package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.PaymentReconciliation.*;
import java.math.BigDecimal;
import java.util.*;
import static com.rhn.billing.infrastructure.payment.StatementCsv.*;

final class WechatStatementParser {
    static ParsedStatement parse(StatementRequest request,StatementDownload download){
        if(download.files().size()!=1)throw invalid("微信交易账单应为一个完整数据文件");
        var csv=read(download.files().getFirst(),false); Map<String,Integer> header=null,summaryHeader=null; List<String> summary=null;
        var lines=new ArrayList<StatementRow>(); boolean end=false;int lineNo=0;
        for(var row:csv){lineNo++;if(row.size()==1&&row.getFirst().isBlank())continue;
            if(header==null){if(!row.contains("商户订单号")||!row.contains("微信订单号"))throw invalid("微信账单表头无法识别");header=header(row);continue;}
            if(row.getFirst().equals("总交易单数")){if(summaryHeader!=null)throw invalid("微信账单存在重复汇总");summaryHeader=header(row);end=true;continue;}
            if(end){if(summary!=null)throw invalid("微信账单汇总后存在多余数据");summary=row;continue;}
            if(row.size()!=header.size())throw invalid("微信账单明细列数不完整");
            String merchant=required(header,row,"商户号");same(request.scope().merchantId(),merchant,"微信账单商户号不匹配");
            String status=required(header,row,"交易状态");if(!Set.of("SUCCESS","REFUND","REVOKED").contains(status))throw invalid("微信账单交易状态暂不支持");
            String type=status.equals("SUCCESS")?"PAYMENT":status.equals("REVOKED")?"REVERSAL":"REFUND";
            String currency=required(header,row,"货币种类");same(request.currencyCode(),currency,"微信账单币种不匹配");
            String refundStatus=type.equals("PAYMENT")?"SUCCESS":required(header,row,"退款状态");
            if(!Set.of("SUCCESS","PROCESSING","FAIL","CHANGE").contains(refundStatus))throw invalid("微信退款状态暂不支持");
            String transaction=required(header,row,"微信订单号");
            BigDecimal amount=money(required(header,row,type.equals("PAYMENT")?"订单金额":"申请退款金额"));
            if(amount.signum()<=0)throw invalid("微信收退款金额必须为正数");
            var settlement=money(required(header,row,type.equals("PAYMENT")?"应结订单金额":"退款金额"));
            if(settlement.signum()<0)throw invalid("微信应结或退款金额不能为负数");
            String refund=type.equals("PAYMENT")?null:required(header,row,"商户退款单号");
            lines.add(new StatementRow(lineNo,type,required(header,row,"商户订单号"),transaction,refund,
                    type.equals("PAYMENT")?null:required(header,row,"微信退款单号"),type.equals("PAYMENT")?null:transaction,
                    amount,settlement,optionalMoney(get(header,row,"手续费")),currency,refundStatus,
                    (type.equals("PAYMENT")||refundStatus.equals("SUCCESS"))?StatementOutcome.SUCCEEDED:refundStatus.equals("FAIL")?StatementOutcome.FAILED:StatementOutcome.PENDING,time(required(header,row,"交易时间"),request),merchant,required(header,row,"公众账号ID")));
        }
        if(summaryHeader==null||summary==null||summary.size()!=summaryHeader.size())throw invalid("微信账单缺少完整汇总尾行");
        int count;try{count=Integer.parseInt(required(summaryHeader,summary,"总交易单数"));}catch(NumberFormatException e){throw invalid("微信账单汇总笔数无效");}
        if(count!=lines.size())throw invalid("微信账单笔数汇总不一致");
        var payments=sum(lines,x->x.transactionType().equals("PAYMENT")?x.amount():BigDecimal.ZERO);
        var refunds=sum(lines,x->x.transactionType().equals("PAYMENT")?BigDecimal.ZERO:x.amount());
        var sp=sum(lines,x->x.transactionType().equals("PAYMENT")?x.settlementAmount():BigDecimal.ZERO);
        var sr=sum(lines,x->x.transactionType().equals("PAYMENT")?BigDecimal.ZERO:x.settlementAmount());
        var fees=sum(lines,StatementRow::fee);
        check(payments,required(summaryHeader,summary,"订单总金额"));check(refunds,required(summaryHeader,summary,"申请退款总金额"));
        check(sp,required(summaryHeader,summary,"应结订单总金额"));check(sr,required(summaryHeader,summary,"退款总金额"));check(fees,required(summaryHeader,summary,"手续费总金额"));
        return new ParsedStatement(lines,new StatementSummary(count,payments,refunds,sp,sr,fees),"WECHAT-V2-ALL-1");
    }
    private static void check(BigDecimal amount,String total){if(amount.compareTo(money(total))!=0)throw invalid("微信账单金额汇总不一致");}
}
