package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.ReconciliationAdapter;
import com.rhn.billing.api.PaymentReconciliation.*;
import com.alipay.api.domain.AlipayDataDataserviceBillDownloadurlQueryModel;
import com.alipay.api.internal.parser.json.ObjectJsonParser;
import com.alipay.api.response.AlipayDataDataserviceBillDownloadurlQueryResponse;
import java.nio.charset.StandardCharsets;
import com.alipay.api.request.AlipayDataDataserviceBillDownloadurlQueryRequest;
import java.util.*;
import static com.rhn.billing.infrastructure.payment.StatementCsv.*;

final class AlipayReconciliationAdapter implements ReconciliationAdapter {
    private final AlipayPaymentClients clients;
    private final StatementHttpDownload http;
    AlipayReconciliationAdapter(AlipayPaymentClients clients){this(clients,new StatementHttpDownload());}
    AlipayReconciliationAdapter(AlipayPaymentClients clients,StatementHttpDownload http){this.clients=clients;this.http=http;}
    public StatementCapability statementCapability(){return new StatementCapability("ALIPAY","ALIPAY_DIRECT","支付宝","TRADE","Asia/Shanghai","09:00",2190,"ALIPAY-TRADE-1");}
    public MerchantScope merchantScope(Long tenant,Long org){
        var m=clients.merchant(tenant,org);String environment=m.serverUrl()==null?"https://openapi.alipay.com/gateway.do":m.serverUrl();
        if(m.appId()==null||m.merchantId()==null||m.appId().isBlank()||m.merchantId().isBlank())throw invalid("当前机构尚未配置支付宝商户身份");
        return new MerchantScope(StatementScopeKeys.of("ALIPAY_DIRECT",environment,m.merchantId()),m.merchantId(),environment,m.appId());
    }
    public StatementDownload download(StatementRequest in){
        same(in.scope().fingerprint(),merchantScope(in.tenantId(),in.credentialOrganizationId()).fingerprint(),"商户配置身份与账单任务不一致");
        try{
            var merchant=clients.merchant(in.tenantId(),in.credentialOrganizationId());
            var model=new AlipayDataDataserviceBillDownloadurlQueryModel();model.setBillType("trade");model.setBillDate(in.businessDate().toString());model.setSecure("true");
            var request=new AlipayDataDataserviceBillDownloadurlQueryRequest();request.setBizModel(model);
            var client=clients.client(merchant);
            boolean certificateMode=clients.certificateMode(merchant);
            var response=certificateMode?client.certificateExecute(request):client.execute(request);
            if("NO_BILL_DATA".equals(response.getSubCode())&&response.getBody()!=null){
                // The SDK permits unsigned error responses. Only a signed error (which execute has
                // verified) is strong enough to publish an explicitly empty statement.
                var parser=new ObjectJsonParser<>(AlipayDataDataserviceBillDownloadurlQueryResponse.class);
                var signature=parser.getSignItem(request,response.getBody());
                var certificate=certificateMode?parser.getCertItem(request,response.getBody()):null;
                if(signature!=null&&signature.getSign()!=null&&!signature.getSign().isBlank()
                        &&(!certificateMode||certificate!=null&&certificate.getCert()!=null&&!certificate.getCert().isBlank()))
                    return new StatementDownload(FetchState.NO_DATA_CONFIRMED,List.of(new StatementFile("signed-no-data.json",response.getBody().getBytes(StandardCharsets.UTF_8))),"ALIPAY_SIGNED_NO_DATA");
            }
            if(!"10000".equals(response.getCode()))return new StatementDownload(switch(response.getSubCode()==null?"":response.getSubCode()){
                case "NO_BILL_DATA"->FetchState.NOT_FOUND;
                case "BILL_NOT_EXIST"->FetchState.NOT_FOUND;
                case "USER_RATE_LIMIT","SYSTEM_RATE_LIMIT"->FetchState.RATE_LIMITED;
                case "TYPE_NOT_SUPPORTED"->FetchState.UNSUPPORTED;
                case "isv.insufficient-isv-permissions","isv.invalid-auth-token"->FetchState.AUTH_FAILED;
                default->FetchState.NOT_READY;},List.of(),"ALIPAY_API_RESULT");
            byte[] bytes=http.alipay(response.getBillDownloadUrl());
            return new StatementDownload(FetchState.AVAILABLE,List.of(),"ALIPAY_SIGNED_API_HTTPS",new StatementFile("alipay-trade.zip",bytes));
        }catch(StatementProtocolException e){throw e;}
        catch(Exception e){throw invalid("支付宝账单申请失败，请检查账单权限、凭证或稍后重试");}
    }
    public ParsedStatement parse(StatementRequest in,StatementDownload download){var source=download.transportFile();var content=source==null?download.files():unpack("alipay-trade.csv",source.content());return AlipayStatementParser.parse(in,new StatementDownload(download.state(),content,download.proof(),source));}
}
