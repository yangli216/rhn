package com.rhn.billing.infrastructure.insurance.chs;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MockChsNationalInsuranceClientTest {

    private MockChsNationalInsuranceClient client;

    @BeforeEach
    void setUp() {
        client = new MockChsNationalInsuranceClient();
    }

    @Test
    void queryPersonReturnsValidPersonAndInsutype() {
        ChsModels.PersonInfoRequest request = new ChsModels.PersonInfoRequest("01", "110101199001011234", "张三");
        ChsModels.PersonInfoResponse response = client.queryPersonInfo(request);

        assertNotNull(response);
        assertEquals("张三", response.psnName());
        assertEquals("310", response.insutype());
        assertNotNull(response.insuOptins());
        assertTrue(response.balc().compareTo(BigDecimal.ZERO) > 0);
    }

    @Test
    void preSettleCalculatesCoverageAccurately() {
        // 构建明细：包含甲类、乙类、丙类
        List<ChsModels.FeedetItem> feedetails = List.of(
                new ChsModels.FeedetItem(1L, "ITEM01", "HILIST01", "阿莫西林胶囊", "1", "1",
                        new BigDecimal("2.00"), new BigDecimal("20.00"), new BigDecimal("40.00")), // 甲类 40
                new ChsModels.FeedetItem(2L, "ITEM02", "HILIST02", "血常规检测", "2", "2",
                        new BigDecimal("1.00"), new BigDecimal("50.00"), new BigDecimal("50.00")), // 乙类 50
                new ChsModels.FeedetItem(3L, "ITEM03", "HILIST03", "特需营养液", "3", "3",
                        new BigDecimal("1.00"), new BigDecimal("30.00"), new BigDecimal("30.00"))  // 丙类 30
        );

        ChsModels.PreSettleRequest request = new ChsModels.PreSettleRequest(
                "PSN-101", "310", 1001L, "SETTLE-001",
                new BigDecimal("120.00"), "ORG-01", "DEPT-01", "DOC-01",
                feedetails
        );

        ChsModels.PreSettleResponse response = client.preSettle(request);

        assertNotNull(response);
        assertEquals(new BigDecimal("120.00"), response.medfeeSumamt());
        assertTrue(response.hifpPay().compareTo(BigDecimal.ZERO) > 0);
        assertNotNull(response.preSetlId());
        assertTrue(response.preSetlId().startsWith("PRE_SETL_CHS_"));
    }

    @Test
    void settleAndReverseLifecycleSucceeds() {
        ChsModels.PreSettleRequest preRequest = new ChsModels.PreSettleRequest(
                "PSN-102", "310", 1002L, "SETTLE-002",
                new BigDecimal("60.00"), "ORG-01", "DEPT-01", "DOC-01",
                List.of(new ChsModels.FeedetItem(1L, "ITEM01", "HILIST01", "普通药品", "1", "1",
                        BigDecimal.ONE, new BigDecimal("60.00"), new BigDecimal("60.00")))
        );
        ChsModels.PreSettleResponse preResponse = client.preSettle(preRequest);
        String preSetlId = preResponse.preSetlId();

        // 正式结算
        ChsModels.SettleRequest settleRequest = new ChsModels.SettleRequest(
                preSetlId, "PSN-102", "SETTLE-002", "CASHIER-1"
        );
        ChsModels.SettleResponse settleResponse = client.settle(settleRequest);
        assertNotNull(settleResponse);
        assertNotNull(settleResponse.setlId());
        assertTrue(settleResponse.setlId().startsWith("SETL_CHS_"));

        // 冲正/撤销
        ChsModels.ReversalRequest reverseRequest = new ChsModels.ReversalRequest(
                settleResponse.setlId(), "PSN-102", "CASHIER-1", "患者退费撤销"
        );
        ChsModels.ReversalResponse reverseResponse = client.reverse(reverseRequest);
        assertNotNull(reverseResponse);
        assertEquals(settleResponse.setlId(), reverseResponse.originalSetlId());
        assertTrue(reverseResponse.success());
    }
}
