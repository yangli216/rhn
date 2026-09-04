package com.rhn.billing.infrastructure.fiscal;

import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalIssueRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalIssueResponse;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalItem;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalRedFlushRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalRedFlushResponse;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalVoidRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalVoidResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MockFiscalReceiptClientTest {

    private MockFiscalReceiptClient client;

    @BeforeEach
    void setUp() {
        client = new MockFiscalReceiptClient();
    }

    @Test
    void issueGeneratesValidInvoiceFourElements() {
        List<FiscalItem> items = List.of(
                new FiscalItem(1, "DRUG", "D01", "头孢克肟胶囊", new BigDecimal("2.00"), new BigDecimal("36.00")),
                new FiscalItem(2, "EXAM", "E01", "超声检查", new BigDecimal("1.00"), new BigDecimal("120.00"))
        );

        FiscalIssueRequest request = new FiscalIssueRequest(
                101L,
                201L,
                "REQ-20260904-001",
                "IDEM-001",
                "MEDICAL_E_INVOICE",
                "CASHIER",
                "360000",
                "李四",
                "DIGEST-12345",
                new BigDecimal("156.00"),
                new BigDecimal("100.00"),
                new BigDecimal("20.00"),
                new BigDecimal("36.00"),
                "CNY",
                items,
                "CORR-001"
        );

        FiscalIssueResponse response = client.issue(request);

        assertNotNull(response);
        assertTrue(response.success());
        assertEquals("ISSUED", response.outcome());
        assertNotNull(response.externalReceiptNo());
        assertTrue(response.externalReceiptNo().startsWith("EINV-"));

        // 验证电子票据代码（10位，如 3600060126 或 3601060126）
        assertEquals(10, response.fiscalCode().length());
        assertTrue(response.fiscalCode().startsWith("360006") || response.fiscalCode().startsWith("360106"));

        // 验证电子票据号码（10位数字）
        assertEquals(10, response.fiscalNumber().length());
        assertTrue(response.fiscalNumber().matches("^\\d{10}$"));

        // 验证防伪校验码（6位数字）
        assertEquals(6, response.verificationCode().length());
        assertTrue(response.verificationCode().matches("^\\d{6}$"));

        // 验证查验 URL
        assertNotNull(response.verifyUrl());
        assertTrue(response.verifyUrl().contains("bill_code=" + response.fiscalCode()));
        assertTrue(response.verifyUrl().contains("bill_no=" + response.fiscalNumber()));
        assertTrue(response.verifyUrl().contains("check_code=" + response.verificationCode()));
    }

    @Test
    void queryReturnsStoredInvoice() {
        FiscalIssueRequest request = new FiscalIssueRequest(
                102L, 202L, "REQ-20260904-002", "IDEM-002",
                "MEDICAL_E_INVOICE", "CASHIER", "360000", "王五", "DIGEST-67890",
                new BigDecimal("88.00"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("88.00"),
                "CNY", List.of(), "CORR-002"
        );

        FiscalIssueResponse issued = client.issue(request);
        FiscalIssueResponse queried = client.query(request.receiptRequestNo(), issued.externalReceiptNo(), "CORR-002");

        assertNotNull(queried);
        assertTrue(queried.success());
        assertEquals(issued.fiscalCode(), queried.fiscalCode());
        assertEquals(issued.fiscalNumber(), queried.fiscalNumber());
        assertEquals(issued.verificationCode(), queried.verificationCode());
        assertEquals(issued.verifyUrl(), queried.verifyUrl());
    }

    @Test
    void voidReceiptSucceeds() {
        FiscalVoidRequest voidReq = new FiscalVoidRequest(
                103L, "REQ-20260904-003", "IDEM-VOID-001", "EINV-99999", "重复开具作废", "CORR-003"
        );
        FiscalVoidResponse voidResp = client.voidReceipt(voidReq);

        assertNotNull(voidResp);
        assertTrue(voidResp.success());
        assertEquals("EINV-99999", voidResp.externalReceiptNo());
        assertNotNull(voidResp.voidedAt());
    }

    @Test
    void redFlushCreatesValidRedInvoice() {
        FiscalRedFlushRequest redReq = new FiscalRedFlushRequest(
                104L, "REQ-20260904-004", "IDEM-RED-001", "EINV-1001",
                "3601060126", "0001859231", "退费冲红", "CORR-004"
        );
        FiscalRedFlushResponse redResp = client.redFlush(redReq);

        assertNotNull(redResp);
        assertTrue(redResp.success());
        assertNotNull(redResp.redExternalReceiptNo());
        assertTrue(redResp.redExternalReceiptNo().startsWith("RED-EINV-"));
        assertEquals("3601060126", redResp.redFiscalCode());
        assertEquals(10, redResp.redFiscalNumber().length());
        assertEquals(6, redResp.verificationCode().length());
        assertNotNull(redResp.verifyUrl());
    }
}
