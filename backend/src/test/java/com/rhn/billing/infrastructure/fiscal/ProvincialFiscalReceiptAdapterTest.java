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
import static org.mockito.Mockito.*;

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
                BigDecimal.ZERO,
                "CNY",
                new BigDecimal("120.00"),
                BigDecimal.ZERO,
                new BigDecimal("78.00"),
                BigDecimal.ZERO,
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
    void forwardsPersonalAccountAndOtherFundWithoutFoldingThemIntoPatientCash() {
        var client = mock(NationalFiscalReceiptClient.class);
        when(client.issue(any())).thenReturn(FiscalModels.FiscalIssueResponse.pending(null, null, null));
        var adapter = new ProvincialFiscalReceiptAdapter(client);
        adapter.issue(new ReceiptInstruction(1L, 2L, "REQ", "CMD", "MEDICAL_E_INVOICE", "CASHIER", "FISCAL", null,
                "payer", null, BigDecimal.TEN, BigDecimal.ZERO, "CNY", new BigDecimal("5"), BigDecimal.ONE, new BigDecimal("2"),
                new BigDecimal("2"), List.of(), "CORR"));
        var captured = org.mockito.ArgumentCaptor.forClass(FiscalModels.FiscalIssueRequest.class);
        verify(client).issue(captured.capture());
        var request = captured.getValue();
        assertEquals(new BigDecimal("5"), request.insuranceAmount());
        assertEquals(BigDecimal.ONE, request.personalAccountAmount());
        assertEquals(new BigDecimal("2"), request.patientAmount());
        assertEquals(new BigDecimal("2"), request.otherFundAmount());
        assertEquals(0, request.totalAmount().compareTo(request.insuranceAmount().add(request.personalAccountAmount())
                .add(request.patientAmount()).add(request.otherFundAmount())));
    }

    @Test
    void forwardsRoundingSeparatelyWithoutRepricingTheItem() {
        var client = mock(NationalFiscalReceiptClient.class);
        when(client.issue(any())).thenReturn(FiscalModels.FiscalIssueResponse.pending(null, null, null));
        new ProvincialFiscalReceiptAdapter(client).issue(new ReceiptInstruction(1L, 2L, "REQ", "CMD", "MEDICAL_E_INVOICE", "CASHIER", "FISCAL", null,
                "payer", null, new BigDecimal("9.96"), new BigDecimal("-0.04"), "CNY", BigDecimal.ZERO, BigDecimal.ZERO,
                new BigDecimal("9.96"), BigDecimal.ZERO, List.of(new ReceiptLine(1, "LABORATORY", "LAB", "检验", BigDecimal.ONE, BigDecimal.TEN)), "CORR"));
        var captured = org.mockito.ArgumentCaptor.forClass(FiscalModels.FiscalIssueRequest.class);
        verify(client).issue(captured.capture());
        var request = captured.getValue();
        assertEquals(new BigDecimal("-0.04"), request.roundingAmount());
        assertEquals(BigDecimal.TEN, request.items().getFirst().amount());
        assertEquals(0, request.items().getFirst().amount().add(request.roundingAmount()).compareTo(request.totalAmount()));
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
    @Test void missingPlatformTimeIsNotFilledWithLocalNow() {
        var client=mock(NationalFiscalReceiptClient.class);
        var value=new ProvincialFiscalReceiptAdapter(client);
        when(client.query(any(),any(),any())).thenReturn(FiscalModels.FiscalIssueResponse.success("EXT","CODE","NO",null,null,null));
        assertNull(value.query("REQ","EXT","corr").issuedAt());
        when(client.voidReceipt(any())).thenReturn(FiscalModels.FiscalVoidResponse.success("EXT",null));
        assertNull(value.voidReceipt(new ReceiptAction(1L,"REQ","CMD","EXT","reason","corr")).issuedAt());
        when(client.redFlush(any())).thenReturn(FiscalModels.FiscalRedFlushResponse.success("RED","CODE","NO",null,null,null));
        assertNull(value.redFlush(new ReceiptAction(1L,"REQ","CMD","EXT","reason","corr")).issuedAt());
    }
    @Test void missingReversalReceiptNumberCannotBorrowOriginalTicket() {
        var client=mock(NationalFiscalReceiptClient.class);var value=new ProvincialFiscalReceiptAdapter(client);
        when(client.redFlush(any())).thenReturn(FiscalModels.FiscalRedFlushResponse.failed("FAILED","failed"));
        var result=value.redFlush(new ReceiptAction(1L,"REQ","CMD","ORIGINAL","reason","corr"));
        assertNull(result.externalReceiptNo());assertNull(result.issuedAt());
    }
    @Test void queryRetainsActualSuccessfulOperationInsteadOfAlwaysReportingIssued() {
        var client=mock(NationalFiscalReceiptClient.class);var value=new ProvincialFiscalReceiptAdapter(client);
        for(String outcome:new String[]{"VOIDED","RED_FLUSHED"}) {
            when(client.query(any(),any(),any())).thenReturn(new FiscalModels.FiscalIssueResponse(true,outcome,"EXT","CODE","NO",null,null,
                    java.time.Instant.parse("2026-10-04T00:00:00Z"),null,null));
            assertEquals(ReceiptResult.Outcome.valueOf(outcome),value.query("REQ","EXT","corr").outcome());
        }
    }
    @Test void conflictingOrUnknownPlatformStateCannotBecomeAValidResult() {
        var client=mock(NationalFiscalReceiptClient.class);var value=new ProvincialFiscalReceiptAdapter(client);
        for(String outcome:new String[]{"PENDING","UNKNOWN",null}) {
            when(client.query(any(),any(),any())).thenReturn(new FiscalModels.FiscalIssueResponse(true,outcome,"EXT","CODE","NO",null,null,null,null,null));
            assertThrows(IllegalStateException.class,()->value.query("REQ","EXT","corr"));
        }
    }

    @Test void pendingQueryDoesNotInventAFailureCodeOrIssuanceTime() {
        var client=mock(NationalFiscalReceiptClient.class);var value=new ProvincialFiscalReceiptAdapter(client);
        when(client.query(any(),any(),any())).thenReturn(FiscalModels.FiscalIssueResponse.pending(null,null,null));
        var result=value.query("REQ",null,"corr");
        assertEquals(ReceiptResult.Outcome.PENDING,result.outcome());
        assertNull(result.errorCode());assertNull(result.errorMessage());assertNull(result.issuedAt());
    }

}
