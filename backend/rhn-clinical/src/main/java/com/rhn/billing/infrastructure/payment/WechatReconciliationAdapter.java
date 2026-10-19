package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.ReconciliationAdapter;
import com.rhn.billing.api.PaymentReconciliation.*;
import com.github.binarywang.wxpay.bean.request.WxPayDownloadBillRequest;
import com.github.binarywang.wxpay.exception.WxPayException;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.*;
import static com.rhn.billing.infrastructure.payment.StatementCsv.*;

final class WechatReconciliationAdapter implements ReconciliationAdapter {
    private final WechatPaymentClients clients;
    WechatReconciliationAdapter(WechatPaymentClients clients){this.clients=clients;}
    public StatementCapability statementCapability(){return new StatementCapability("WECHAT","WECHAT_DIRECT","微信支付","TRADE","Asia/Shanghai","10:00",90,"WECHAT-V2-ALL-1");}
    public MerchantScope merchantScope(Long tenant,Long org){var m=clients.merchant(tenant,org);if(m.appId()==null||m.merchantId()==null||m.appId().isBlank()||m.merchantId().isBlank())throw invalid("当前机构尚未配置微信商户身份");return new MerchantScope(StatementScopeKeys.of("WECHAT_DIRECT","PRODUCTION",m.merchantId()),m.merchantId(),"PRODUCTION",m.appId());}
    public StatementDownload download(StatementRequest in){
        same(in.scope().fingerprint(),merchantScope(in.tenantId(),in.credentialOrganizationId()).fingerprint(),"商户配置身份与账单任务不一致");
        try{
            var merchant=clients.merchant(in.tenantId(),in.credentialOrganizationId());
            var request=new WxPayDownloadBillRequest();request.setBillDate(in.businessDate().format(DateTimeFormatter.BASIC_ISO_DATE));request.setBillType("ALL");
            String content=clients.client(merchant).downloadRawBill(request);
            byte[] bytes=content.getBytes(StandardCharsets.UTF_8);if(bytes.length==0||bytes.length>MAX_BYTES)throw invalid("微信账单为空或超过16 MiB接入上限");
            if(content.stripLeading().startsWith("<"))throw invalid("微信返回非账单内容，不能作为空账处理");
            return new StatementDownload(FetchState.AVAILABLE,List.of(new StatementFile("wechat-trade.csv",bytes)),"WECHAT_V2_AUTHENTICATED_HTTPS");
        }catch(WxPayException e){
            String code=e.getErrCode()==null?e.getReturnMsg():e.getErrCode();
            FetchState state=switch(code==null?"":code){case "20002","BILL_NOT_EXIST"->FetchState.NOT_FOUND;case "20003","20100","SYSTEMERROR","Bill Creating"->FetchState.NOT_READY;case "20001","20007","SIGNERROR","NOAUTH","MCHID_NOT_EXIST","sign error","invalid appid"->FetchState.AUTH_FAILED;case "20008","FREQUENCY_LIMITED","Frequency Limited","Network Traffic Limit"->FetchState.RATE_LIMITED;default->FetchState.NOT_READY;};
            return new StatementDownload(state,List.of(),"WECHAT_V2_API_RESULT");
        }
    }
    public ParsedStatement parse(StatementRequest in,StatementDownload download){return WechatStatementParser.parse(in,download);}
}
