package com.rhn.billing.application;

import com.rhn.billing.application.SettlementReliefService.LineEstimate;
import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.*;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SettlementReliefPreSettledPreviewTest {
    private final ExecutionContext context = new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of(), 1001L, 1002L,
            "ORGANIZATION", Set.of(1001L), Set.of(1002L));
    private ReliefPolicyRepository policies;
    private InsuranceClaimRepository claims;
    private SettlementReliefService service;
    private Settlement settlement;
    private final PatientAccount account = mock(PatientAccount.class);

    @BeforeEach
    void setUp() {
        policies = mock(ReliefPolicyRepository.class);
        claims = mock(InsuranceClaimRepository.class);
        service = new SettlementReliefService(policies, mock(ReliefPolicyVersionRepository.class),
                mock(ReliefRuleRepository.class), mock(ReliefQualificationRepository.class),
                mock(ReliefRosterRepository.class), mock(ReliefApplicationRepository.class),
                mock(ReliefApplicationLineRepository.class), null, null, mock(SettlementLineRepository.class),
                mock(SettlementTenderRepository.class), mock(ChargeItemRepository.class),
                mock(LedgerEntryRepository.class), claims, mock(SettlementRepository.class), null, null, null);
        settlement = mock(Settlement.class);
        when(settlement.id()).thenReturn(10L);
        when(settlement.settlementType()).thenReturn("NORMAL");
        when(settlement.settlementScene()).thenReturn("OUTPATIENT");
        when(settlement.createdAt()).thenReturn(Instant.parse("2026-01-01T00:00:00Z"));
        when(policies.findByTenantIdAndStatus(any(), any())).thenReturn(List.of());
    }

    private void claimWith(String status) {
        InsuranceClaim claim = mock(InsuranceClaim.class);
        when(claim.status()).thenReturn(status);
        when(claims.findByTenantIdAndSettlementId(1L, 10L)).thenReturn(Optional.of(claim));
    }

    @Test
    void preSettledPreviewProceedsToPolicyEvaluation() {
        claimWith("PRE_SETTLED");
        assertThat(service.previewPostInsurance(context, account, settlement)).isEmpty();
        verify(policies).findByTenantIdAndStatus(any(), any());
    }

    @Test
    void settledAndSelfPayPreviewProceedToPolicyEvaluation() {
        claimWith("SETTLED");
        service.previewPostInsurance(context, account, settlement);
        when(claims.findByTenantIdAndSettlementId(1L, 10L)).thenReturn(Optional.empty());
        service.previewPostInsurance(context, account, settlement);
        verify(policies, times(2)).findByTenantIdAndStatus(any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"PRE_SETTLEMENT_PENDING", "PRE_SETTLEMENT_FAILED", "FAILED", "SETTLEMENT_PENDING"})
    void otherStatusesStayEmpty(String status) {
        claimWith(status);
        assertThat(service.previewPostInsurance(context, account, settlement)).isEmpty();
        verifyNoInteractions(policies);
    }

    @Test
    void applyPostInsuranceStillRejectedWhenPreSettled() {
        claimWith("PRE_SETTLED");
        assertThatThrownBy(() -> service.applyPostInsurance(context, account, settlement, Map.of(), "X-"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("医保结算尚未完成");
        verifyNoInteractions(policies);
    }

    private static BigDecimal d(String value) { return new BigDecimal(value); }

    @Test
    void lineEstimatesSumToClaimTotals() {
        List<BigDecimal> nets = List.of(d("33.33"), d("66.67"), d("100.00"), d("7.77"));
        BigDecimal fund = d("120.00"), other = d("5.00"), personalAccount = d("30.00");
        BigDecimal total = nets.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        List<LineEstimate> estimates = SettlementReliefService.estimate(nets, fund, other, personalAccount);
        BigDecimal personal = estimates.stream().map(LineEstimate::personal).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal account = estimates.stream().map(LineEstimate::account).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cash = estimates.stream().map(LineEstimate::cash).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(personal).isEqualByComparingTo(total.subtract(fund).subtract(other));
        assertThat(account).isEqualByComparingTo(personalAccount);
        // claim.patientCashAmount = 总额 - 统筹 - 其他 - 个人账户
        assertThat(cash).isEqualByComparingTo(total.subtract(fund).subtract(other).subtract(personalAccount));
        estimates.forEach(value -> assertThat(value.cash().signum()).isGreaterThanOrEqualTo(0));
    }

    @Test
    void nullClaimAmountsTreatedAsZero() {
        List<LineEstimate> estimates = SettlementReliefService.estimate(List.of(d("10.00"), d("20.00")), null, null, null);
        assertThat(estimates).extracting(LineEstimate::cash).usingComparatorForType(BigDecimal::compareTo, BigDecimal.class)
                .containsExactly(d("10.00"), d("20.00"));
    }
}
