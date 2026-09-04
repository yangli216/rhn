package com.rhn.billing.infrastructure.fiscal;

import com.rhn.billing.api.FiscalReceiptAdapter;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptAction;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptInstruction;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptLine;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ProvincialFiscalReceiptAdapterTest {

    private MockFiscalReceiptClient mockClient;
    private ProvincialFiscalReceiptAdapter adapter;

    @BeforeEach
    void setUp() {
        mockClient = new MockFiscalReceiptClient();
        adapter = new ProvincialFiscalReceiptAdapter(mockClient);
    }

    @Test
    void supportsCorrectAuthorityAndType() {
        // 医疗电子发票类型通用支持
        assertTrue(adapter.supports("360000", "MEDICAL_E_INVOICE"));
        assertTrue(adapter.supports("DEFAULT", "MEDICAL_E_INVOICE"));
        assertTrue(adapter.supports(null, "MEDICAL_E_INVOICE"));

        // 财政机构代码支持
        assertTrue(adapter.supports("PROVINCIAL_FISCAL", "RECEIPT"));
        assertTrue(adapter.supports("NATIONAL_FISCAL", "VIRTUAL"));
        assertTrue(adapter.supports("FISCAL", "RECEIPT"));

        // 本地小票不应由本适配器处理
        assertFalse(adapter.supports("LOCAL", "RECEIPT"));
        assertFalse(adapter.supports("LOCAL", "VIRTUAL"));
    }

    @Test
    void issueInvokesClientAndReturnsIssuedOutcome() {
        List<ReceiptLine> lines = List.of(
                new ReceiptLine(1, "WESTERN_MEDICINE", "M01", "阿莫西林胶囊", new BigDecimal("2.00"), new BigDecimal("38.00")),
                new ReceiptLine(2, "LABORATORY", "L01", "生化全套", new BigDecimal("1.00"), new BigDecimal("160.00"))
        );

        ReceiptInstruction instruction = new ReceiptInstruction(
                501L,
                601L,
                "REQ-2026-501",
                "IDEM-501",
                "MEDICAL_E_INVOICE",
                "CASHIER",
                "360000",
                null,
                "赵六",
                "DIGEST-赵六",
                new BigDecimal("198.00"),
                "CNY",
                new BigDecimal("120.00"),
                BigDecimal.ZERO,
                new BigDecimal("78.00"),
                lines,
                "CORR-501"
        );

        ReceiptResult result = adapter.issue(instruction);

        assertNotNull(result);
        assertEquals(ReceiptResult.Outcome.ISSUED, result.outcome());
        assertNotNull(result.externalReceiptNo());
        assertNotNull(result.fiscalCode());
        assertEquals(10, result.fiscalCode().length());
        assertNotNull(result.fiscalNumber());
        assertEquals(10, result.fiscalNumber().length());
        assertNotNull(result.verificationCode());
        assertEquals(6, result.verificationCode().length());
        assertNotNull(result.controlledObjectReference());
        assertTrue(result.controlledObjectReference().contains("bill_code="));
        assertNotNull(result.issuedAt());
    }

    @Test
    void queryInvokesClientAndReturnsIssued() {
        ReceiptResult result = adapter.query("REQ-2026-502", "EINV-EXISTING", "CORR-502");

        assertNotNull(result);
        assertEquals(ReceiptResult.Outcome.ISSUED, result.outcome());
        assertEquals("EINV-EXISTING", result.externalReceiptNo());
        assertNotNull(result.fiscalCode());
        assertNotNull(result.fiscalNumber());
    }

    @Test
    void voidReceiptInvokesClientAndReturnsVoided() {
        ReceiptAction action = new ReceiptAction(
                503L, "REQ-2026-503", "IDEM-VOID-503", "EINV-503", "结算错误作废", "CORR-503"
        );
        ReceiptResult result = adapter.voidReceipt(action);

        assertNotNull(result);
        assertEquals(ReceiptResult.Outcome.VOIDED, result.outcome());
        assertEquals("EINV-503", result.externalReceiptNo());
    }

    @Test
    void redFlushInvokesClientAndReturnsRedFlushed() {
        ReceiptAction action = new ReceiptAction(
                504L, "REQ-2026-504", "IDEM-RED-504", "EINV-504", "退药退费冲红", "CORR-504"
        );
        ReceiptResult result = adapter.redFlush(action);

        assertNotNull(result);
        assertEquals(ReceiptResult.Outcome.RED_FLUSHED, result.outcome());
        assertNotNull(result.externalReceiptNo());
        assertTrue(result.externalReceiptNo().startsWith("RED-EINV-"));
        assertNotNull(result.fiscalCode());
        assertNotNull(result.fiscalNumber());
        assertNotNull(result.verificationCode());
    }
}
