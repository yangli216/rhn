package com.rhn.billing.application;

import com.rhn.billing.api.BillingFlowDirectory;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class JpaBillingFlowDirectory implements BillingFlowDirectory {
    private final PatientAccountRepository accounts;
    private final LedgerEntryRepository ledger;

    public JpaBillingFlowDirectory(PatientAccountRepository accounts, LedgerEntryRepository ledger) {
        this.accounts = accounts;
        this.ledger = ledger;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, BillingFlowSnapshot> summarize(Long tenantId, Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return Map.of();
        List<PatientAccount> values = accounts.findByTenantIdAndEncounterIdIn(tenantId, encounterIds);
        if (values.isEmpty()) return Map.of();
        Map<Long, BigDecimal> balances = new HashMap<>();
        ledger.balances(tenantId, values.stream().map(PatientAccount::id).toList())
                .forEach(value -> balances.put(value.getAccountId(), money(value.getBalance())));
        Map<Long, MutableSummary> grouped = new LinkedHashMap<>();
        for (PatientAccount account : values) {
            BigDecimal balance = balances.getOrDefault(account.id(), money(BigDecimal.ZERO));
            grouped.computeIfAbsent(account.encounterId(), ignored -> new MutableSummary()).add(balance);
        }
        Map<Long, BillingFlowSnapshot> result = new LinkedHashMap<>();
        grouped.forEach((encounterId, value) -> result.put(encounterId, value.snapshot()));
        return Map.copyOf(result);
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static final class MutableSummary {
        private int count;
        private BigDecimal balance = money(BigDecimal.ZERO);

        void add(BigDecimal value) {
            count++;
            balance = money(balance.add(value));
        }

        BillingFlowSnapshot snapshot() {
            BigDecimal outstanding = balance.signum() > 0 ? balance : money(BigDecimal.ZERO);
            BigDecimal refundable = balance.signum() < 0 ? balance.abs() : money(BigDecimal.ZERO);
            return new BillingFlowSnapshot(count, balance, outstanding, refundable);
        }
    }
}
