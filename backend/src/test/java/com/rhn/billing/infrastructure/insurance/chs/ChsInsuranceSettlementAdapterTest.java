package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.api.InsuranceSettlementAdapter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ChsInsuranceSettlementAdapterTest {

    private ChsInsuranceSettlementAdapter adapter;
    private MockChsNationalInsuranceClient mockClient;

    @BeforeEach
    void setUp() {
        mockClient = new MockChsNationalInsuranceClient();
        adapter = new ChsInsuranceSettlementAdapter(mockClient);
    }

    @Test
    void supportsOnlyApplicableCoverageTypes() {
        assertTrue(adapter.supports("310100", "BASIC_MEDICAL_INSURANCE"));
        assertTrue(adapter.supports("310100", "310"));
        assertTrue(adapter.supports("310100", "390"));
        assertTrue(adapter.supports("310100", "EMPLOYEE_BASIC"));
        assertTrue(adapter.supports("310100", "RESIDENT_BASIC"));
        assertFalse(adapter.supports("TEST_REGION", "BASIC_MEDICAL_INSURANCE"));
        assertFalse(adapter.supports("310100", "COMMERCIAL_INSURANCE"));
        assertFalse(adapter.supports("310100", null));
    }

    @Test
    void preSettleAndSettleSuccess() {
        var instruction = new InsuranceSettlementAdapter.InsuranceInstruction(
                1001L, 2001L, "SETTLE-001", "IDEMP-001", 3001L,
                88L, 4001L, 5001L, "310100", "310",
                "ORG-01", "DEPT-01", "DOC-01",
                Instant.now(), Instant.now(), "DIAG-HASH",
                List.of(new InsuranceSettlementAdapter.InsuranceLine(
                        1L, 101L, "ITEM01", "HILIST01", "阿莫西林",
                        BigDecimal.ONE, new BigDecimal("100.00"), new BigDecimal("100.00"), "DRUG", null
                )),
                new BigDecimal("100.00"), "CNY", "CORR-01"
        );

        var preResult = adapter.preSettle(instruction);
        assertNotNull(preResult);
        assertEquals(InsuranceSettlementAdapter.InsuranceResult.Outcome.SUCCEEDED, preResult.outcome());
        assertNotNull(preResult.externalSettlementNo());
        assertTrue(preResult.externalSettlementNo().startsWith("PRE_SETL_CHS_"));

        // 正式结算
        var settleResult = adapter.settle(instruction, preResult.externalSettlementNo());
        assertNotNull(settleResult);
        assertEquals(InsuranceSettlementAdapter.InsuranceResult.Outcome.SUCCEEDED, settleResult.outcome());
        assertNotNull(settleResult.externalSettlementNo());
        assertTrue(settleResult.externalSettlementNo().startsWith("SETL_CHS_"));

        // 撤销
        var reverseInstruction = new InsuranceSettlementAdapter.InsuranceReversal(
                1001L, 2001L, "SETTLE-001", "IDEMP-REV-01",
                "310100", "310",
                settleResult.externalSettlementNo(), new BigDecimal("100.00"), "患者退号退费", "CORR-REV-01"
        );
        var reverseResult = adapter.reverse(reverseInstruction);
        assertNotNull(reverseResult);
        assertEquals(InsuranceSettlementAdapter.InsuranceResult.Outcome.SUCCEEDED, reverseResult.outcome());
    }
}
