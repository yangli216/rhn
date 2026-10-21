package com.rhn.billing.application;

import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.ReliefApplication;
import com.rhn.billing.domain.ReliefQuota;
import com.rhn.billing.domain.ReliefQuotaTransaction;
import com.rhn.billing.domain.ReliefQuotaTransactionType;
import com.rhn.billing.domain.ReliefTiming;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementLine;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.infrastructure.InsuranceClaimRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.ReliefApplicationRepository;
import com.rhn.billing.infrastructure.ReliefQuotaRepository;
import com.rhn.billing.infrastructure.ReliefQuotaTransactionRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.shared.context.ExecutionContext;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

/**
 * 取消未付款结算单：结算单只是划价、没有发生任何资金往来时，整单删除，所含收费回到待结算，
 * 医保前减免恢复额度。审计依据保留在 {@code BILLING_SETTLEMENT_CANCELLED} 事件中，
 * 与医生取消签署时删除未结算收费的做法一致。医保试算须先由医保平台撤销，见 {@link SettlementCancellationService}。
 */
@Service
class SettlementCancellationTransactions {
    private final SettlementRepository settlements;
    private final SettlementLineRepository lines;
    private final PatientAccountRepository accounts;
    private final InsuranceClaimRepository claims;
    private final ReliefApplicationRepository reliefApplications;
    private final ReliefQuotaTransactionRepository quotaTransactions;
    private final ReliefQuotaRepository quotas;
    private final DomainEventPublisher eventPublisher;
    private final EntityManager entityManager;

    SettlementCancellationTransactions(SettlementRepository settlements, SettlementLineRepository lines,
                                       PatientAccountRepository accounts, InsuranceClaimRepository claims,
                                       ReliefApplicationRepository reliefApplications,
                                       ReliefQuotaTransactionRepository quotaTransactions, ReliefQuotaRepository quotas,
                                       DomainEventPublisher eventPublisher, EntityManager entityManager) {
        this.settlements = settlements; this.lines = lines; this.accounts = accounts; this.claims = claims;
        this.reliefApplications = reliefApplications; this.quotaTransactions = quotaTransactions; this.quotas = quotas;
        this.eventPublisher = eventPublisher; this.entityManager = entityManager;
    }

    /** 可取消时为 {@code null}，否则为不能取消的原因。 */
    String blockedReason(Long tenantId, Settlement value) {
        if (!"NORMAL".equals(value.settlementType())) return "冲正结算单不能取消";
        if ("REGISTRATION".equals(value.settlementScene()) || count("""
                select count(value) from RegistrationBillingIntent value
                 where value.tenantId = :tenantId and value.settlementId = :id""", tenantId, value.id()) > 0) {
            return "挂号结算单不能取消，请通过退号处理";
        }
        if (value.status() != SettlementStatus.PRICED) return "结算单已发起支付或已完成结算，不能取消；如需调整请办理退费";
        if (count("select count(value) from SettlementTender value where value.tenantId = :tenantId and value.settlementId = :id",
                tenantId, value.id()) > 0) return "结算单已有收款或减免核定，不能取消";
        if (count("select count(value) from PaymentOrder value where value.tenantId = :tenantId and value.invoiceId = :id",
                tenantId, value.legacyInvoiceId()) > 0
                || count("select count(value) from Payment value where value.tenantId = :tenantId and value.invoiceId = :id",
                tenantId, value.legacyInvoiceId()) > 0) {
            return "结算单已发起过支付，不能取消，请到收费处核对支付结果";
        }
        if (reliefApplications.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(tenantId, value.id()).stream()
                .anyMatch(application -> application.timing() != ReliefTiming.PRE_INSURANCE)) {
            return "结算单已核定医保后减免，不能取消";
        }
        InsuranceClaim claim = claims.findByTenantIdAndSettlementId(tenantId, value.id()).orElse(null);
        if (claim != null && !"PRE_SETTLED".equals(claim.status()) && !failedPreSettlement(claim)) {
            return "医保结算处理中或已结算，不能取消结算单";
        }
        return null;
    }

    /** 校验能否取消；医保已试算时返回待撤销的医保申请，由调用方在事务外先撤销医保平台费用明细。 */
    @Transactional(readOnly = true)
    Long prepare(ExecutionContext context, Long settlementId) {
        Settlement value = requireCancellable(context, settlementId, false);
        return claims.findByTenantIdAndSettlementId(context.tenantId(), value.id())
                .filter(claim -> "PRE_SETTLED".equals(claim.status())).map(InsuranceClaim::id).orElse(null);
    }

    @Transactional
    CancelledSettlement remove(ExecutionContext context, Long settlementId, String reason, String insuranceNote) {
        Settlement value = requireCancellable(context, settlementId, true);
        PatientAccount account = accounts.findByIdAndTenantId(value.patientAccountId(), context.tenantId()).orElseThrow();
        Long tenantId = context.tenantId();
        Instant now = Instant.now();
        List<Long> chargeItemIds = lines.findByTenantIdAndSettlementIdOrderByLineNoAsc(tenantId, value.id()).stream()
                .map(SettlementLine::chargeItemId).toList();
        List<Long> applicationIds = reliefApplications.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(tenantId, value.id())
                .stream().map(ReliefApplication::id).toList();
        BigDecimal relief = value.discountAmount();
        for (Long applicationId : applicationIds) releaseQuota(tenantId, applicationId, now);
        entityManager.flush();

        Long claimId = claims.findByTenantIdAndSettlementId(tenantId, value.id()).map(InsuranceClaim::id).orElse(null);
        Long invoiceId = value.legacyInvoiceId();
        if (!applicationIds.isEmpty()) {
            delete("delete from ReliefQuotaTransaction value where value.tenantId = :tenantId and value.applicationId in :ids",
                    tenantId, applicationIds);
            delete("delete from ReliefApplicationLine value where value.tenantId = :tenantId and value.applicationId in :ids",
                    tenantId, applicationIds);
            delete("delete from ReliefApplication value where value.tenantId = :tenantId and value.id in :ids", tenantId, applicationIds);
        }
        if (claimId != null) {
            delete("delete from InsuranceClaimResponse value where value.tenantId = :tenantId and value.claimId in :ids",
                    tenantId, List.of(claimId));
            delete("delete from InsuranceClaimLine value where value.tenantId = :tenantId and value.claimId in :ids",
                    tenantId, List.of(claimId));
            delete("delete from InsuranceClaim value where value.tenantId = :tenantId and value.id in :ids", tenantId, List.of(claimId));
        }
        List<Long> settlementIds = List.of(value.id());
        delete("delete from SettlementEvent value where value.tenantId = :tenantId and value.settlementId in :ids", tenantId, settlementIds);
        delete("delete from SettlementCategorySummary value where value.tenantId = :tenantId and value.settlementId in :ids",
                tenantId, settlementIds);
        delete("delete from SettlementLine value where value.tenantId = :tenantId and value.settlementId in :ids", tenantId, settlementIds);
        delete("delete from Settlement value where value.tenantId = :tenantId and value.id in :ids", tenantId, settlementIds);
        if (invoiceId != null) {
            List<Long> invoiceIds = List.of(invoiceId);
            // 医保前减免随开单记入的贷方分录；收费本身的借方分录挂在收费事项上，保持不变。
            delete("delete from LedgerEntry value where value.tenantId = :tenantId and value.invoiceId in :ids", tenantId, invoiceIds);
            delete("delete from InvoiceCategorySummary value where value.tenantId = :tenantId and value.invoiceId in :ids",
                    tenantId, invoiceIds);
            delete("delete from InvoiceLine value where value.tenantId = :tenantId and value.invoiceId in :ids", tenantId, invoiceIds);
            delete("delete from Invoice value where value.tenantId = :tenantId and value.id in :ids", tenantId, invoiceIds);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("settlementId", value.id());
        payload.put("settlementNo", value.settlementNo());
        if (invoiceId != null) payload.put("invoiceId", invoiceId);
        if (account.encounterId() != null) payload.put("encounterId", account.encounterId());
        payload.put("accountId", account.id());
        payload.put("terminalScene", value.terminalScene());
        payload.put("grossAmount", value.grossAmount());
        payload.put("netAmount", value.netAmount());
        payload.put("reliefAmount", relief);
        payload.put("chargeItemIds", chargeItemIds);
        if (claimId != null) payload.put("insuranceClaimId", claimId);
        payload.put("reason", reason);
        payload.put("cancelledBy", context.subjectId());
        eventPublisher.publish(tenantId, account.organizationId(), "BILLING_SETTLEMENT_CANCELLED", 1,
                "Settlement", value.id(), value.revision() + 1, account.residentId(), now, payload);
        return new CancelledSettlement(value.id(), value.settlementNo(), value.netAmount(), chargeItemIds, insuranceNote);
    }

    /** 本就诊所有可取消的未付款结算单（不含挂号）。 */
    @Transactional(readOnly = true)
    List<Long> cancellableForEncounter(ExecutionContext context, Long encounterId) {
        return accounts.findByTenantIdAndEncounterIdIn(context.tenantId(), List.of(encounterId)).stream()
                .filter(account -> context.canAccessOrganization(account.organizationId()))
                .flatMap(account -> settlements.findByTenantIdAndPatientAccountIdOrderByCreatedAtAscIdAsc(
                        context.tenantId(), account.id()).stream())
                .filter(value -> value.status() == SettlementStatus.PRICED && blockedReason(context.tenantId(), value) == null)
                .map(Settlement::id).toList();
    }

    private Settlement requireCancellable(ExecutionContext context, Long settlementId, boolean lock) {
        Settlement value = (lock ? settlements.lockByIdAndTenantId(settlementId, context.tenantId())
                : settlements.findByIdAndTenantId(settlementId, context.tenantId()))
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "结算单不存在或已取消"));
        PatientAccount account = accounts.findByIdAndTenantId(value.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        if (!context.hasWorkContext() || !context.canAccessOrganization(account.organizationId())) {
            throw forbidden("SETTLEMENT_FORBIDDEN", "当前工作上下文不能访问该结算单");
        }
        String reason = blockedReason(context.tenantId(), value);
        if (reason != null) throw conflict("SETTLEMENT_NOT_CANCELLABLE", reason);
        return value;
    }

    /** 预结算阶段失败的申请没有可撤销的医保结果；正式结算失败的结果可能已在医保平台生效，不在此列。 */
    private static boolean failedPreSettlement(InsuranceClaim claim) {
        return "FAILED".equals(claim.status()) && "PRE_SETTLE".equals(claim.currentOperation());
    }

    /** 占用的额度原样退回，等同这次减免从未发生。 */
    private void releaseQuota(Long tenantId, Long applicationId, Instant now) {
        for (ReliefQuotaTransaction transaction : quotaTransactions
                .findByTenantIdAndApplicationIdOrderByOccurredAtAscIdAsc(tenantId, applicationId)) {
            if (transaction.type() != ReliefQuotaTransactionType.RESERVE) continue;
            ReliefQuota quota = quotas.findById(transaction.quotaId()).orElseThrow();
            var key = quota.key();
            quota = quotas.lockByKey(tenantId, key.policyId(), key.residentId(), key.periodKey(), key.shareKey(),
                    key.scopeKey()).orElseThrow();
            quota.change(transaction.amountDelta().negate(), -transaction.countDelta(), now);
        }
    }

    private long count(String query, Long tenantId, Long id) {
        if (id == null) return 0;
        return entityManager.createQuery(query, Long.class).setParameter("tenantId", tenantId).setParameter("id", id)
                .getSingleResult();
    }

    private void delete(String statement, Long tenantId, List<Long> ids) {
        entityManager.createQuery(statement).setParameter("tenantId", tenantId).setParameter("ids", ids).executeUpdate();
    }

    record CancelledSettlement(Long settlementId, String settlementNo, BigDecimal netAmount, List<Long> chargeItemIds,
                               String insuranceNote) {}
}
