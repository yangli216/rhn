package com.rhn.billing.infrastructure.payment;

import com.alipay.api.AlipayApiException;
import com.alipay.api.AlipayClient;
import com.alipay.api.request.*;
import com.alipay.api.response.*;
import com.github.binarywang.wxpay.bean.request.WxPayMicropayRequest;
import com.github.binarywang.wxpay.bean.request.WxPayRefundRequest;
import com.github.binarywang.wxpay.bean.result.*;
import com.github.binarywang.wxpay.exception.WxPayException;
import com.github.binarywang.wxpay.service.WxPayService;
import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.api.PaymentChannelAdapter.*;
import com.rhn.billing.infrastructure.payment.AlipayPaymentProperties.AlipayMerchant;
import com.rhn.billing.infrastructure.payment.WechatPaymentProperties.WechatMerchant;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import java.math.BigDecimal;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DirectPaymentChannelAdapterTest {
    final AlipayPaymentClients aliClients = mock(AlipayPaymentClients.class);
    final WechatPaymentClients wxClients = mock(WechatPaymentClients.class);
    final AlipayClient ali = mock(AlipayClient.class);
    final WxPayService wx = mock(WxPayService.class);
    final AlipayPaymentChannelAdapter alipay = new AlipayPaymentChannelAdapter(aliClients);
    final WechatPaymentChannelAdapter wechat = new WechatPaymentChannelAdapter(wxClients);
    AlipayMerchant alipayMerchant() { return new AlipayMerchant(1L,2L,"app","merchant",null,null,null,null,null,null); }
    WechatMerchant wechatMerchant() { return new WechatMerchant(1L,2L,"app","merchant","secret",null,"192.0.2.1"); }
    DirectPaymentChannelAdapterTest() {
        when(aliClients.merchant(1L,2L)).thenReturn(alipayMerchant());
        when(wxClients.merchant(1L,2L)).thenReturn(wechatMerchant());
        when(aliClients.client(any())).thenReturn(ali); when(wxClients.client(any())).thenReturn(wx);
    }
    PaymentInstruction payment(String method, String value, String code) {
        return new PaymentInstruction(10L,"ORDER","KEY",3L,4L,"OUTPATIENT","CASHIER",method,
                new BigDecimal(value),"CNY","corr","TERMINAL",null,code,1L,2L);
    }
    QueryInstruction query(String method, boolean refund) {
        return new QueryInstruction(10L,refund ? "REFUND" : "ORDER",refund ? "REFUND" : "SETTLEMENT_PAY",method,
                null,new BigDecimal("1.23"),"CNY","corr","TERMINAL",refund ? "ORIGINAL" : null,1L,2L);
    }
    RefundInstruction refund(String method) {
        return new RefundInstruction(10L,"REFUND","KEY",3L,"PAY-LOCAL","ORIGINAL","OUTPATIENT","CASHIER",method,
                new BigDecimal("1.23"),"CNY","reason","corr","TERMINAL",new BigDecimal("10.00"),1L,2L);
    }
    <T extends BaseWxPayResult> T identity(T response) { response.setAppid("app"); response.setMchId("merchant"); response.setSign("verified-by-sdk");
        response.setReturnCode("SUCCESS"); response.setResultCode("SUCCESS"); return response; }

    @Test void alipayUsesActualReportedAmountAndStableMerchantOrder() throws Exception {
        var response = new AlipayTradePayResponse(); response.setCode("10000"); response.setOutTradeNo("P10");
        response.setTradeNo("TXN"); response.setTotalAmount("1.22");
        when(ali.execute(any(AlipayTradePayRequest.class))).thenReturn(response);
        var result = alipay.initiate(payment("ALIPAY","1.23","284567890123456789"));
        assertEquals(new BigDecimal("1.22"), result.capturedAmount()); // Billing core must reject the mismatch.
        verify(ali).execute(argThat((AlipayTradePayRequest r) -> {
            var m=(com.alipay.api.domain.AlipayTradePayModel)r.getBizModel();
            return "P10".equals(m.getOutTradeNo()) && "merchant".equals(m.getSellerId()) && "284567890123456789".equals(m.getAuthCode());
        }));
    }
    @Test void alipayUserPayingAndOrderNotFoundStayPending() throws Exception {
        var pay = new AlipayTradePayResponse(); pay.setCode("10003");
        when(ali.execute(any(AlipayTradePayRequest.class))).thenReturn(pay);
        assertEquals(InitiationResult.Outcome.PENDING,alipay.initiate(payment("ALIPAY","1.23","284567890123456789")).outcome());
        var query = new AlipayTradeQueryResponse(); query.setCode("40004"); query.setSubCode("ACQ.TRADE_NOT_EXIST");
        when(ali.execute(any(AlipayTradeQueryRequest.class))).thenReturn(query);
        assertEquals(QueryResult.Outcome.PENDING,alipay.query(query("ALIPAY",false)).outcome());
    }
    @Test void alipayRejectsAnUnrelatedSuccessfulTrade() throws Exception {
        var response=new AlipayTradeQueryResponse(); response.setCode("10000"); response.setOutTradeNo("OTHER"); response.setTradeStatus("TRADE_SUCCESS");
        when(ali.execute(any(AlipayTradeQueryRequest.class))).thenReturn(response);
        assertThrows(BusinessException.class,()->alipay.query(query("ALIPAY",false)));
    }
    @Test void alipayRefundRequiresExactOriginalTradeAndRefundIdentity() throws Exception {
        var accepted=new AlipayTradeRefundResponse();accepted.setCode("10000");accepted.setTradeNo("ORIGINAL");
        when(ali.execute(any(AlipayTradeRefundRequest.class))).thenReturn(accepted);
        assertEquals(RefundResult.Outcome.PENDING,alipay.refund(refund("ALIPAY")).outcome());
        var response=new AlipayTradeFastpayRefundQueryResponse();response.setCode("10000");response.setTradeNo("ORIGINAL");
        response.setOutRequestNo("R10");response.setRefundStatus("REFUND_SUCCESS");response.setRefundAmount("1.23");
        when(ali.execute(any(AlipayTradeFastpayRefundQueryRequest.class))).thenReturn(response);
        assertEquals(QueryResult.Outcome.SUCCEEDED,alipay.query(query("ALIPAY",true)).outcome());
        response.setOutRequestNo("ANOTHER_REFUND");
        assertThrows(BusinessException.class,()->alipay.query(query("ALIPAY",true)));
    }
    @Test void sdkExceptionsNeverExposeTheRawRequest() throws Exception {
        when(ali.execute(any(AlipayTradePayRequest.class))).thenThrow(new AlipayApiException("authorizationCode=284567890123456789"));
        var error=assertThrows(IllegalStateException.class,()->alipay.initiate(payment("ALIPAY","1.23","284567890123456789")));
        assertFalse(error.getMessage().contains("284567"));assertNull(error.getCause());
        when(wx.micropay(any())).thenThrow(new WxPayException("xml contains auth_code=134567890123456789"));
        error=assertThrows(IllegalStateException.class,()->wechat.initiate(payment("WECHAT","1.23","134567890123456789")));
        assertFalse(error.getMessage().contains("134567"));assertNull(error.getCause());
    }
    @Test void wechatSendsExactCentsAndDoesNotBorrowAmountForMissingReceipt() throws Exception {
        var response=identity(new WxPayMicropayResult());response.setOutTradeNo("P10");response.setTransactionId("TXN");
        when(wx.micropay(any())).thenReturn(response);
        var result=wechat.initiate(payment("WECHAT","1.23","134567890123456789"));
        assertNull(result.capturedAmount());
        verify(wx).micropay(argThat((WxPayMicropayRequest r)->r.getTotalFee()==123 && "P10".equals(r.getOutTradeNo())));
    }
    @Test void unsignedWechatSuccessCannotBeUsedAsAReceipt() throws Exception {
        var response=identity(new WxPayOrderQueryResult());response.setOutTradeNo("P10");response.setTradeState("SUCCESS");response.setTotalFee(123);response.setTransactionId("TXN");response.setSign(null);
        when(wx.queryOrder(null,"P10")).thenReturn(response);
        assertThrows(IllegalStateException.class,()->wechat.query(query("WECHAT",false)));
    }
    @ParameterizedTest @ValueSource(strings={"", "<sign>invalid</sign>"})
    void realSdkRejectsUnsignedOrTamperedSuccessWithoutNetwork(String signature) throws Exception {
        var service=spy(new com.github.binarywang.wxpay.service.impl.WxPayServiceImpl());
        var config=new com.github.binarywang.wxpay.config.WxPayConfig();config.setAppId("app");config.setMchId("merchant");config.setMchKey("12345678901234567890123456789012");service.setConfig(config);
        String xml="<xml><return_code>SUCCESS</return_code><result_code>SUCCESS</result_code><appid>app</appid><mch_id>merchant</mch_id><out_trade_no>P10</out_trade_no><transaction_id>TXN</transaction_id><trade_state>SUCCESS</trade_state><total_fee>123</total_fee>"+signature+"</xml>";
        doReturn(xml).when(service).post(anyString(),anyString(),anyBoolean());
        when(wxClients.client(any())).thenReturn(service);
        assertThrows(IllegalStateException.class,()->wechat.query(query("WECHAT",false)));
    }
    @Test void wechatRejectsOtherMerchantAndCurrency() throws Exception {
        var response=identity(new WxPayOrderQueryResult());response.setOutTradeNo("P10");response.setTradeState("SUCCESS");response.setMchId("OTHER");
        when(wx.queryOrder(null,"P10")).thenReturn(response);
        assertThrows(IllegalStateException.class,()->wechat.query(query("WECHAT",false)));
        response.setMchId("merchant");response.setFeeType("USD");
        assertThrows(IllegalStateException.class,()->wechat.query(query("WECHAT",false)));
    }
    @ParameterizedTest @ValueSource(strings={"USERPAYING","NOTPAY","REFUND","UNKNOWN"})
    void wechatDoesNotTurnAnUnconfirmedStateIntoSuccessOrFailure(String state) throws Exception {
        var response=identity(new WxPayOrderQueryResult());response.setOutTradeNo("P10");response.setTradeState(state);
        when(wx.queryOrder(null,"P10")).thenReturn(response);
        assertEquals(QueryResult.Outcome.PENDING,wechat.query(query("WECHAT",false)).outcome());
    }
    @Test void wechatPartialRefundUsesOriginalTotalAndRemainsPendingUntilQuery() throws Exception {
        var response=identity(new WxPayRefundResult());response.setTransactionId("ORIGINAL");response.setOutRefundNo("R10");
        when(wx.refundV2(any())).thenReturn(response);
        assertEquals(RefundResult.Outcome.PENDING,wechat.refund(refund("WECHAT")).outcome());
        verify(wx).refundV2(argThat((WxPayRefundRequest r)->r.getTotalFee()==1000 && r.getRefundFee()==123));
    }
    @Test void wechatRefundQuerySelectsTheExactRefundRatherThanTheFirstRecord() throws Exception {
        var response=identity(new WxPayRefundQueryResult());response.setTransactionId("ORIGINAL");
        var other=new WxPayRefundQueryResult.RefundRecord();other.setOutRefundNo("OTHER");other.setRefundStatus("SUCCESS");other.setRefundFee(999);
        var own=new WxPayRefundQueryResult.RefundRecord();own.setOutRefundNo("R10");own.setRefundStatus("PROCESSING");own.setRefundFee(123);own.setRefundId("REFUND-TXN");
        response.setRefundRecords(List.of(other,own));when(wx.refundQuery(null,null,"R10",null)).thenReturn(response);
        assertEquals(QueryResult.Outcome.PENDING,wechat.query(query("WECHAT",true)).outcome());
        own.setRefundStatus("SUCCESS");var result=wechat.query(query("WECHAT",true));
        assertEquals(new BigDecimal("1.23"),result.completedAmount());assertEquals("REFUND-TXN",result.externalTransactionNo());
    }
    @ParameterizedTest @ValueSource(strings={"0","-1","0.001","1.234","21474836.48"})
    void invalidOrInexactWechatAmountsCannotReachTheSdk(String amount) {
        assertThrows(BusinessException.class,()->wechat.validate(payment("WECHAT",amount,"134567890123456789")));
        verifyNoInteractions(wx);
    }
    @Test void rejectsWrongChannelCodesAndRedactsInstructionText() {
        var instruction=payment("WECHAT","1.23","284567890123456789");
        assertThrows(BusinessException.class,()->wechat.validate(instruction));
        assertFalse(instruction.toString().contains(instruction.authorizationCode()));
        assertFalse(wechatMerchant().toString().contains("secret"));
    }
    @Test void configurationNeverFallsBackToAnotherInstitutionOrDuplicateMerchant() {
        var real=new WechatPaymentClients(new WechatPaymentProperties(true, List.of(wechatMerchant())));
        assertThrows(BusinessException.class,()->real.merchant(1L,3L));
        assertThrows(BusinessException.class,()->real.merchant(2L,2L));
        assertThrows(IllegalArgumentException.class,()->new WechatPaymentProperties(true, List.of(wechatMerchant(),wechatMerchant())));

    }
    @Test void channelNumbersUseGlobalIdsRatherThanTenantScopedDisplayNumbers() {
        assertEquals("P10", PaymentProtocol.number(10L, false));
        assertNotEquals(PaymentProtocol.number(10L, false), PaymentProtocol.number(11L, false));
        assertNotEquals(PaymentProtocol.number(10L, false), PaymentProtocol.number(10L, true));
        assertTrue(PaymentProtocol.number(Long.MAX_VALUE, true).length() <= 32);
    }
    @Test void aLegacyExternalOrderCannotBeQueriedAsANewDirectOrder() {
        var legacy = new QueryInstruction(10L,"ORDER","SETTLEMENT_PAY","WECHAT","WECHAT-EXT-ORDER",
                new BigDecimal("1.23"),"CNY","corr","TERMINAL",null,1L,2L);
        assertThrows(BusinessException.class,()->wechat.query(legacy));
        verifyNoInteractions(wx);
    }
    @Test void directAdaptersAreExclusiveWithTheExplicitSimulationSwitch() {
        new ApplicationContextRunner().withUserConfiguration(AlipayPaymentConfiguration.class, WechatPaymentConfiguration.class).run(c->assertEquals(2,c.getBeansOfType(PaymentChannelAdapter.class).size()));
        new ApplicationContextRunner().withUserConfiguration(AlipayPaymentConfiguration.class, WechatPaymentConfiguration.class)
                .withPropertyValues("rhn.billing.payment.aggregated-adapter.enabled=true").run(c->assertTrue(c.getBeansOfType(PaymentChannelAdapter.class).isEmpty()));
    }
    @Test void providerConfigurationRejectsAnotherProvidersCredentialFields() {
        new ApplicationContextRunner().withUserConfiguration(AlipayPaymentConfiguration.class)
                .withPropertyValues("rhn.billing.payment.alipay.merchants[0].tenant-id=1",
                        "rhn.billing.payment.alipay.merchants[0].organization-id=2",
                        "rhn.billing.payment.alipay.merchants[0].api-key=not-an-alipay-field")
                .run(context->assertNotNull(context.getStartupFailure()));
    }
    @Test void providerCanBeDisabledWithoutDisablingAnotherProvider() {
        new ApplicationContextRunner().withUserConfiguration(AlipayPaymentConfiguration.class,WechatPaymentConfiguration.class)
                .withPropertyValues("rhn.billing.payment.alipay.enabled=false")
                .run(context->{assertTrue(context.getBeansOfType(AlipayPaymentChannelAdapter.class).isEmpty());
                    assertEquals(1,context.getBeansOfType(WechatPaymentChannelAdapter.class).size());});
    }
    @Test void providersCanBeExplicitlyEnabledWithStrictConfigurationBinding() {
        new ApplicationContextRunner().withUserConfiguration(AlipayPaymentConfiguration.class,WechatPaymentConfiguration.class)
                .withPropertyValues("rhn.billing.payment.alipay.enabled=true", "rhn.billing.payment.wechat.enabled=true")
                .run(context->{assertNull(context.getStartupFailure());
                    assertEquals(2,context.getBeansOfType(PaymentChannelAdapter.class).size());});
    }

}
