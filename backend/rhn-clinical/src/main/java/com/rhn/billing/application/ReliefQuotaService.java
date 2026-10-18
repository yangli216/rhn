package com.rhn.billing.application;

import com.rhn.billing.domain.ReliefApplication;
import com.rhn.billing.domain.ReliefPolicyVersion;
import com.rhn.billing.domain.ReliefQuota;
import com.rhn.billing.domain.ReliefQuotaKey;
import com.rhn.billing.domain.ReliefQuotaTransaction;
import com.rhn.billing.domain.ReliefQuotaTransactionType;
import com.rhn.billing.infrastructure.ReliefQuotaRepository;
import com.rhn.billing.infrastructure.ReliefQuotaTransactionRepository;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * 额度累计：结算应用减免时在同一事务内加锁占用（RESERVE），结算完成时确认（CONFIRM）。
 * 额度对象为整项政策（POLICY）或带项目周期次数的规则范围；命令码保证同一减免记录不重复累计。
 */
@Component
class ReliefQuotaService {
    private final ReliefQuotaRepository quotas;
    private final ReliefQuotaTransactionRepository transactions;

    ReliefQuotaService(ReliefQuotaRepository quotas, ReliefQuotaTransactionRepository transactions) {
        this.quotas = quotas; this.transactions = transactions;
    }

    ReliefQuotaKey key(ReliefPolicyVersion version, Long residentId, LocalDate businessDate, String scene,
                       Long organizationId, String scopeKey) {
        return ReliefQuotaKey.of(version.policyId(), residentId, version.quotaPeriod(), businessDate,
                version.shareAcrossScenes(), version.shareAcrossOrganizations(), scene, organizationId, scopeKey);
    }

    /** 读取已用额度，不存在时视为零。落账时加锁，保证同一居民并发结算不会同时超用；预览只读不加锁。 */
    Usage usage(Long tenantId, ReliefQuotaKey key, boolean lock) {
        var value = lock
                ? quotas.lockByKey(tenantId, key.policyId(), key.residentId(), key.periodKey(), key.shareKey(), key.scopeKey())
                : quotas.findByTenantIdAndPolicyIdAndResidentIdAndPeriodKeyAndShareKeyAndScopeKey(tenantId,
                        key.policyId(), key.residentId(), key.periodKey(), key.shareKey(), key.scopeKey());
        return value.map(quota -> new Usage(quota.usedAmount(), quota.usedCount())).orElse(new Usage(BigDecimal.ZERO, 0));
    }

    void reserve(Long tenantId, ReliefApplication application, ReliefQuotaKey key, BigDecimal amount, int count,
                 Long actorId, Instant occurredAt) {
        String command = "RESERVE-" + application.id() + "-" + key.scopeKey();
        if (transactions.existsByTenantIdAndCommandCode(tenantId, command)) return;
        ReliefQuota quota = quotas.lockByKey(tenantId, key.policyId(), key.residentId(), key.periodKey(),
                        key.shareKey(), key.scopeKey())
                .orElseGet(() -> quotas.saveAndFlush(new ReliefQuota(tenantId, key, occurredAt)));
        quota.change(amount, count, occurredAt);
        transactions.save(new ReliefQuotaTransaction(tenantId, quota.id(), application.id(),
                ReliefQuotaTransactionType.RESERVE, amount, count, command, actorId, occurredAt));
    }

    /** 结算完成时确认本结算的全部占用；确认不改变累计，只留下可审计的状态。 */
    void confirm(Long tenantId, Collection<ReliefApplication> applications, Long actorId, Instant occurredAt) {
        for (ReliefApplication application : applications) {
            List<ReliefQuotaTransaction> reserved = transactions
                    .findByTenantIdAndApplicationIdOrderByOccurredAtAscIdAsc(tenantId, application.id());
            for (ReliefQuotaTransaction transaction : reserved) {
                if (transaction.type() != ReliefQuotaTransactionType.RESERVE) continue;
                String command = "CONFIRM-" + transaction.id();
                if (transactions.existsByTenantIdAndCommandCode(tenantId, command)) continue;
                transactions.save(new ReliefQuotaTransaction(tenantId, transaction.quotaId(), application.id(),
                        ReliefQuotaTransactionType.CONFIRM, BigDecimal.ZERO.setScale(6), 0, command, actorId, occurredAt));
            }
        }
    }

    /**
     * 退费冲销恢复额度：整项政策额度恢复冲销金额，原减免全部冲销时同时恢复次数；
     * 规则范围的次数在保留费用不再命中该规则时恢复。每个额度对象的次数只恢复一次。
     */
    void restore(Long tenantId, ReliefApplication original, ReliefApplication reversal, BigDecimal amount,
                 boolean fullyReversed, Set<String> retainedRuleScopes, Long actorId, Instant occurredAt) {
        List<ReliefQuotaTransaction> history = transactions
                .findByTenantIdAndApplicationIdOrderByOccurredAtAscIdAsc(tenantId, original.id());
        for (ReliefQuotaTransaction reserved : history) {
            if (reserved.type() != ReliefQuotaTransactionType.RESERVE) continue;
            ReliefQuota quota = quotas.findById(reserved.quotaId()).orElseThrow();
            ReliefQuotaKey key = quota.key();
            quota = quotas.lockByKey(tenantId, key.policyId(), key.residentId(), key.periodKey(), key.shareKey(),
                    key.scopeKey()).orElseThrow();
            boolean policyScope = ReliefQuotaKey.POLICY_SCOPE.equals(key.scopeKey());
            boolean countRestored = history.stream().anyMatch(value -> value.type() == ReliefQuotaTransactionType.REVERSE
                    && value.quotaId().equals(reserved.quotaId()) && value.countDelta() < 0);
            boolean restoreCount = reserved.countDelta() > 0 && !countRestored
                    && (policyScope ? fullyReversed : !retainedRuleScopes.contains(key.scopeKey()));
            BigDecimal amountDelta = policyScope ? amount.min(quota.usedAmount()) : BigDecimal.ZERO;
            if (amountDelta.signum() == 0 && !restoreCount) continue;
            String command = "REVERSE-" + reversal.id() + "-" + quota.id();
            if (transactions.existsByTenantIdAndCommandCode(tenantId, command)) continue;
            int countDelta = restoreCount ? -reserved.countDelta() : 0;
            quota.change(amountDelta.negate(), countDelta, occurredAt);
            transactions.save(new ReliefQuotaTransaction(tenantId, quota.id(), original.id(),
                    ReliefQuotaTransactionType.REVERSE, amountDelta.negate(), countDelta, command, actorId, occurredAt));
        }
    }

    record Usage(BigDecimal amount, int count) {}
}
