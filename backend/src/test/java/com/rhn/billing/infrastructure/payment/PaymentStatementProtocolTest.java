package com.rhn.billing.infrastructure.payment;

import com.alipay.api.AlipayClient;
import com.alipay.api.request.AlipayDataDataserviceBillDownloadurlQueryRequest;
import com.alipay.api.response.AlipayDataDataserviceBillDownloadurlQueryResponse;
import com.github.binarywang.wxpay.bean.request.WxPayDownloadBillRequest;
import com.github.binarywang.wxpay.service.WxPayService;
import com.rhn.billing.api.PaymentReconciliation.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.nio.charset.*;
import java.time.LocalDate;
import java.util.*;
import java.util.zip.*;
import java.io.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PaymentStatementProtocolTest {
    StatementRequest request() { return new StatementRequest(1L,2L,new MerchantScope("f".repeat(64),"MERCHANT","TEST","APP"),LocalDate.of(2026,10,17),"CNY",3L,1); }
    StatementDownload ali(String text, boolean gbk) { return new StatementDownload(FetchState.AVAILABLE,List.of(new StatementFile("业务明细.csv",text.getBytes(gbk?Charset.forName("GB18030"):StandardCharsets.UTF_8))),"ALIPAY_SIGNED_API_HTTPS"); }
    String alipay() { return "#支付宝业务明细查询\r\n#账号：[hospital@example.test]\r\n#起始日期：[2026年10月17日 00:00:00] 终止日期：[2026年10月18日 00:00:00]\r\n支付宝交易号,商户订单号,业务类型,商品名称,完成时间,订单金额（元）,商家实收（元）,退款批次号,服务费（元）\r\nT1,P10,交易,\"检验,检查\",2026-10-17 12:00:00,100.00,90.00,,-0.60\r\nT1,P10,退款,退费,2026-10-17 12:01:00,-20.00,-18.00,R11,0.12\r\n#交易合计：1笔，合计金额：100.00元\r\n#退款合计：1笔，合计金额：-20.00元\r\n"; }
    String wechat() { return "交易时间,公众账号ID,商户号,微信订单号,商户订单号,交易状态,货币种类,订单金额,应结订单金额,微信退款单号,商户退款单号,申请退款金额,退款金额,退款状态,手续费\n`2026-10-17 12:00:00,`APP,`MERCHANT,`T1,`P10,`SUCCESS,`CNY,`100.00,`90.00,`,`,`,`,`,`0.60\n`2026-10-17 12:01:00,`APP,`MERCHANT,`T1,`P10,`REFUND,`CNY,`100.00,`90.00,`RF1,`R11,`20.00,`18.00,`PROCESSING,`0.00\n总交易单数,订单总金额,申请退款总金额,应结订单总金额,退款总金额,手续费总金额\n`2,`100.00,`20.00,`90.00,`18.00,`0.60\n"; }
    StatementDownload wx(String text){return new StatementDownload(FetchState.AVAILABLE,List.of(new StatementFile("wx.csv",text.getBytes(StandardCharsets.UTF_8))),"TEST");}
    @Test void alipayParsesGbkQuotedNamesGrossDiscountsAndPartialRefundRequest() {
        var parsed=AlipayStatementParser.parse(request(),ali(alipay(),true));
        assertEquals(2,parsed.summary().count());assertEquals(0,new BigDecimal("100").compareTo(parsed.rows().getFirst().amount()));
        assertEquals(0,new BigDecimal("90").compareTo(parsed.rows().getFirst().settlementAmount()));
        assertEquals("R11",parsed.rows().get(1).refundRequestNo());assertEquals("T1",parsed.rows().get(1).originalExternalTransactionNo());
    }
    @Test void alipayCompanionSummaryValidatesCountsAndNetWithoutTreatingNetAsGross() {
        String detail=alipay().substring(0,alipay().indexOf("#交易合计"));
        String summary="门店编号,交易订单总笔数,退款订单总笔数,订单金额（元）,商家实收（元）,服务费（元）\nS1,1,1,80.00,72.00,-0.48\n合计,1,1,80.00,72.00,-0.48\n";
        var download=new StatementDownload(FetchState.AVAILABLE,List.of(ali(detail,false).files().getFirst(),new StatementFile("业务汇总.csv",summary.getBytes(StandardCharsets.UTF_8))),"ALIPAY_SIGNED_API_HTTPS");
        assertEquals(0,new BigDecimal("20").compareTo(AlipayStatementParser.parse(request(),download).summary().refunds()));
    }
    @Test void alipayRejectsWrongTotalsWrongDateAndUnverifiedSource() {
        assertThrows(StatementProtocolException.class,()->AlipayStatementParser.parse(request(),ali(alipay().replace("100.00元","99.00元"),false)));
        assertThrows(StatementProtocolException.class,()->AlipayStatementParser.parse(request(),ali(alipay().replace("2026年10月17日","2026年10月16日"),false)));
        assertThrows(StatementProtocolException.class,()->AlipayStatementParser.parse(request(),new StatementDownload(FetchState.AVAILABLE,ali(alipay(),false).files(),"UNTRUSTED")));
    }
    @Test void wechatPreservesGrossAmountsAndProcessingOrFailedRefundOutcomes() {
        var parsed=WechatStatementParser.parse(request(),wx(wechat()));
        assertEquals(StatementOutcome.PENDING,parsed.rows().get(1).outcome());assertFalse(parsed.rows().get(1).finalSuccess());
        assertEquals(0,new BigDecimal("100").compareTo(parsed.rows().getFirst().amount()));
        assertEquals(StatementOutcome.FAILED,WechatStatementParser.parse(request(),wx(wechat().replace("PROCESSING","FAIL"))).rows().get(1).outcome());
    }
    @Test void wechatAcceptsOfficialZeroPaddedFeeDecimalsWithoutRounding() {
        var parsed=WechatStatementParser.parse(request(),wx(wechat().replace("`0.60","`0.60000").replace("`0.00","`0.00000")));
        assertEquals(0,new BigDecimal("0.60").compareTo(parsed.summary().fees()));
        assertThrows(StatementProtocolException.class,()->WechatStatementParser.parse(request(),wx(wechat().replace("`0.60","`0.60100"))));
    }
    @Test void wechatRejectsWrongMerchantIncompleteRowsAndInconsistentSummary() {
        for(String text:List.of(wechat().replace("MERCHANT","OTHER"),wechat().replace("`100.00,`20.00,`90.00","`99.00,`20.00,`90.00"),wechat().replace("`PROCESSING,`0.00","`PROCESSING")))
            assertThrows(StatementProtocolException.class,()->WechatStatementParser.parse(request(),wx(text)));
    }
    @Test void csvAndZipRejectAmbiguousOrUnsafeContent() throws Exception {
        assertThrows(StatementProtocolException.class,()->StatementCsv.read(new StatementFile("bad.csv","\"a\"b,c".getBytes()),true));
        var bytes=new ByteArrayOutputStream();try(var zip=new ZipOutputStream(bytes)){zip.putNextEntry(new ZipEntry("../escape.csv"));zip.write("a,b".getBytes());zip.closeEntry();}
        assertThrows(StatementProtocolException.class,()->StatementCsv.unpack("test.zip",bytes.toByteArray()));
        assertThrows(StatementProtocolException.class,()->new StatementHttpDownload().alipay("http://127.0.0.1/internal"));
        assertThrows(StatementProtocolException.class,()->new StatementHttpDownload().alipay("https://dwbillcenter.alipay.com.attacker.test/file"));
    }
    @Test void alipayUsesOfficialTradeApiAndKeepsNoDataSeparateFromMissing() throws Exception {
        var clients=mock(AlipayPaymentClients.class);var sdk=mock(AlipayClient.class);var http=mock(StatementHttpDownload.class);
        when(clients.merchant(1L,2L)).thenReturn(new AlipayPaymentProperties.AlipayMerchant(1L,2L,"APP","MERCHANT",null,null,null,null,null,null));when(clients.client(any())).thenReturn(sdk);
        var adapter=new AlipayReconciliationAdapter(clients,http);var in=new StatementRequest(1L,2L,adapter.merchantScope(1L,2L),LocalDate.of(2026,10,17),"CNY",3L,1);
        var response=new AlipayDataDataserviceBillDownloadurlQueryResponse();response.setCode("40004");response.setSubCode("BILL_NOT_EXIST");when(sdk.execute(any(AlipayDataDataserviceBillDownloadurlQueryRequest.class))).thenReturn(response);
        assertEquals(FetchState.NOT_FOUND,adapter.download(in).state());response.setSubCode("NO_BILL_DATA");assertEquals(FetchState.NOT_FOUND,adapter.download(in).state());
        response.setBody("{\"alipay_data_dataservice_bill_downloadurl_query_response\":{\"code\":\"40004\",\"sub_code\":\"NO_BILL_DATA\"},\"sign\":\"verified-by-sdk\"}");assertEquals(FetchState.NO_DATA_CONFIRMED,adapter.download(in).state());
        verify(sdk,atLeastOnce()).execute(argThat((AlipayDataDataserviceBillDownloadurlQueryRequest r)->{var m=(com.alipay.api.domain.AlipayDataDataserviceBillDownloadurlQueryModel)r.getBizModel();return "trade".equals(m.getBillType())&&"true".equals(m.getSecure())&&"2026-10-17".equals(m.getBillDate());}));verifyNoInteractions(http);
    }
    @Test void certificateErrorsWithoutACertificateSerialCannotConfirmAnEmptyStatement() throws Exception {
        var clients=mock(AlipayPaymentClients.class);var sdk=mock(AlipayClient.class);var http=mock(StatementHttpDownload.class);
        when(clients.merchant(1L,2L)).thenReturn(new AlipayPaymentProperties.AlipayMerchant(1L,2L,"APP","MERCHANT",null,null,null,null,null,null));
        when(clients.client(any())).thenReturn(sdk);when(clients.certificateMode(any())).thenReturn(true);
        var adapter=new AlipayReconciliationAdapter(clients,http);var input=new StatementRequest(1L,2L,adapter.merchantScope(1L,2L),LocalDate.of(2026,10,17),"CNY",3L,1);
        var response=new AlipayDataDataserviceBillDownloadurlQueryResponse();response.setCode("40004");response.setSubCode("NO_BILL_DATA");
        String body="{\"alipay_data_dataservice_bill_downloadurl_query_response\":{\"code\":\"40004\",\"sub_code\":\"NO_BILL_DATA\"},\"sign\":\"verified-by-sdk\"}";
        response.setBody(body);when(sdk.certificateExecute(any(AlipayDataDataserviceBillDownloadurlQueryRequest.class))).thenReturn(response);
        assertEquals(FetchState.NOT_FOUND,adapter.download(input).state());
        response.setBody(body.substring(0,body.length()-1)+",\"alipay_cert_sn\":\"verified-sdk-certificate\"}");
        assertEquals(FetchState.NO_DATA_CONFIRMED,adapter.download(input).state());verifyNoInteractions(http);
    }
    @Test void wechatRequestsAllTransactionsAndNeverConvertsXmlToZero() throws Exception {
        var clients=mock(WechatPaymentClients.class);var sdk=mock(WxPayService.class);when(clients.merchant(1L,2L)).thenReturn(new WechatPaymentProperties.WechatMerchant(1L,2L,"APP","MERCHANT","secret",null,"192.0.2.1"));when(clients.client(any())).thenReturn(sdk);
        var adapter=new WechatReconciliationAdapter(clients);var in=new StatementRequest(1L,2L,adapter.merchantScope(1L,2L),LocalDate.of(2026,10,17),"CNY",3L,1);
        when(sdk.downloadRawBill(any())).thenReturn(wechat());assertEquals(FetchState.AVAILABLE,adapter.download(in).state());
        verify(sdk).downloadRawBill(argThat((WxPayDownloadBillRequest r)->"ALL".equals(r.getBillType())&&"20261017".equals(r.getBillDate())));
        when(sdk.downloadRawBill(any())).thenReturn("<xml><return_msg>not found</return_msg></xml>");assertThrows(StatementProtocolException.class,()->adapter.download(in));
    }
}
