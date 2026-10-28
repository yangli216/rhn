package com.rhn;

import com.rhn.billing.api.InsuranceDebugViews.ClaimActionResult;
import com.rhn.billing.api.InsuranceDebugViews.ReverseClaimRequest;
import com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView;
import com.rhn.billing.application.InsuranceClaimApplicationService;
import com.rhn.billing.application.InsuranceDebugClaimService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** 冲正保护：确认申请号、必填原因、先查询再冲正、已撤销或仍不明确时不冲正。 */
class InsuranceDebugClaimServiceTest {
    static final String ID = "362387869990001";
    static final long CLAIM = 362387869990001L;
    InsuranceClaimApplicationService claims;
    InsuranceDebugClaimService service;

    @BeforeEach void setUp() {
        claims = mock(InsuranceClaimApplicationService.class);
        var provider = mock(ExecutionContextProvider.class);
        when(provider.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "operator", "corr", Set.of("INSURANCE_DEBUG.REVERSE")));
        service = new InsuranceDebugClaimService(claims, provider);
    }

    InsuranceSettlementView view(String status, String operation) {
        return new InsuranceSettlementView(CLAIM, 4, 9L, 8L, 7L, "CLM-001", "STL-001", status, operation, "360100", "310", "PRE-1",
                "STL-EXT-1", new BigDecimal("100.00"), new BigDecimal("60.00"), new BigDecimal("10.00"), new BigDecimal("30.00"),
                BigDecimal.ZERO, "CNY", null, null, null, null, false, List.of(), List.of());
    }

    ReverseClaimRequest request(String reason, String claimNo) { return new ReverseClaimRequest(reason, claimNo); }

    @Test void refusesWhenTheConfirmedClaimNoDiffers() {
        when(claims.get(CLAIM)).thenReturn(view("SETTLED", "SETTLE"));
        assertThatThrownBy(() -> service.reverse(ID, request("重复扣费", "CLM-999")))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_CONFIRM_MISMATCH"));
        verify(claims, never()).reverse(anyLong(), anyString(), anyString());
    }

    @Test void requiresAReason() {
        assertThatThrownBy(() -> service.reverse(ID, request(" ", "CLM-001")))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_REVERSAL_REASON_INVALID"));
        verifyNoInteractions(claims);
    }

    @Test void reversesSettledClaimsDirectlyWithAnIdempotentCommandPerRevision() {
        when(claims.get(CLAIM)).thenReturn(view("SETTLED", "SETTLE"));
        when(claims.reverse(eq(CLAIM), anyString(), eq("重复扣费"))).thenReturn(view("REVERSED", "REVERSE"));
        ClaimActionResult result = service.reverse(ID, request(" 重复扣费 ", "CLM-001"));
        assertThat(result.outcome()).isEqualTo("REVERSED");
        verify(claims, never()).query(anyLong(), anyString());
        verify(claims).reverse(CLAIM, "DBG-R-" + CLAIM + "-4", "重复扣费");
    }

    @Test void queriesUnresolvedClaimsFirstAndSkipsReversalWhenAlreadyReversed() {
        when(claims.get(CLAIM)).thenReturn(view("SETTLEMENT_PENDING", "SETTLE"));
        when(claims.query(eq(CLAIM), anyString())).thenReturn(view("REVERSED", "REVERSE"));
        var result = service.reverse(ID, request("结果不明", "CLM-001"));
        assertThat(result.outcome()).isEqualTo("ALREADY_REVERSED");
        verify(claims, never()).reverse(anyLong(), anyString(), anyString());
    }

    @Test void doesNotReverseWhenTheInsurerResultIsStillUnclear() {
        when(claims.get(CLAIM)).thenReturn(view("SETTLEMENT_PENDING", "SETTLE"));
        when(claims.query(eq(CLAIM), anyString())).thenReturn(view("SETTLEMENT_PENDING", "SETTLE"));
        var result = service.reverse(ID, request("结果不明", "CLM-001"));
        assertThat(result.outcome()).isEqualTo("NOT_REVERSIBLE");
        verify(claims, never()).reverse(anyLong(), anyString(), anyString());
    }

    @Test void reversesAfterTheQueryConfirmsSettlement() {
        when(claims.get(CLAIM)).thenReturn(view("SETTLEMENT_PENDING", "SETTLE"));
        when(claims.query(eq(CLAIM), anyString())).thenReturn(view("SETTLED", "SETTLE"));
        when(claims.reverse(eq(CLAIM), anyString(), anyString())).thenReturn(view("REVERSAL_PENDING", "REVERSE"));
        var result = service.reverse(ID, request("医保已扣费", "CLM-001"));
        assertThat(result.outcome()).isEqualTo("REVERSAL_PENDING");
        assertThat(result.claim().canReverse()).isTrue();
        verify(claims).reverse(eq(CLAIM), startsWith("DBG-R-"), eq("医保已扣费"));
    }

    @Test void attentionListMarksWhichActionsApply() {
        when(claims.attentionWorklist(50)).thenReturn(List.of(view("PRE_SETTLEMENT_PENDING", "PRE_SETTLE"), view("FAILED", "REVERSE")));
        var rows = service.attention(50);
        assertThat(rows.get(0).canQuery()).isTrue();
        assertThat(rows.get(0).canReverse()).isFalse();
        assertThat(rows.get(1).statusText()).isEqualTo("冲正失败");
        assertThat(rows.get(1).canReverse()).isTrue();
    }
}
