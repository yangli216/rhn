package com.rhn.billing.application.reconciliation;

import com.rhn.billing.api.PaymentReconciliation.StatementRow;
import com.rhn.billing.domain.*;
import java.math.BigDecimal;
import java.time.ZoneId;
import java.util.*;

/** Pure matching decision. It never changes a payment, issues a refund or chooses a near match. */
public final class ReconciliationMatcher {
 private ReconciliationMatcher(){}
 public record Match(String type,Payment payment,BigDecimal localAmount,BigDecimal externalAmount){public boolean matched(){return Set.of("MATCHED","TIME_DIFFERENCE").contains(type);}}
 public static Match match(StatementRow row,PaymentOrder order,List<Payment> facts,List<LedgerEntry> ledger,boolean identityValid,boolean duplicate,ZoneId zone){
  BigDecimal ext=row.outcome()==com.rhn.billing.api.PaymentReconciliation.StatementOutcome.FAILED?BigDecimal.ZERO.setScale(6):"PAYMENT".equals(row.transactionType())?row.amount():row.amount().negate();
  Payment p=facts.size()==1?facts.getFirst():null;BigDecimal local=p==null?BigDecimal.ZERO.setScale(6):signed(p);
  String type;
  if(duplicate||facts.size()>1)type="DUPLICATE";
  else if(!identityValid)type="IDENTITY_DIFFERENCE";
  else if("REVERSAL".equals(row.transactionType()))type="REVERSAL_REVIEW";
  else if(row.outcome()==com.rhn.billing.api.PaymentReconciliation.StatementOutcome.FAILED)type=p==null&&"FAILED".equals(order.status())?"MATCHED":"STATUS_DIFFERENCE";
  else if(!row.finalSuccess())type=p==null?"AWAITING_CONFIRMATION":"STATUS_DIFFERENCE";
  else if(p==null)type="LOCAL_NOT_POSTED";
  else if(!Objects.equals(p.organizationId(),order.organizationId())||!Objects.equals(p.patientAccountId(),order.patientAccountId())||!Objects.equals(p.invoiceId(),order.invoiceId())||!Objects.equals(p.status(),"COMPLETED"))type="IDENTITY_DIFFERENCE";
  else if(!Objects.equals(p.paymentMethodCode(),order.paymentMethodCode())||!Objects.equals(p.paymentType(),row.transactionType())||!Objects.equals(p.currencyCode(),row.currencyCode()))type="IDENTITY_DIFFERENCE";
  else if(!Objects.equals(order.status(),"REFUND".equals(row.transactionType())?"REFUNDED":"SUCCEEDED"))type="STATUS_DIFFERENCE";
  else if(p.amount().compareTo(row.amount())!=0||order.requestedAmount().compareTo(row.amount())!=0)type="AMOUNT_DIFFERENCE";
  else if(!Objects.equals(p.externalTransactionNo(),"REFUND".equals(row.transactionType())&&row.externalRefundNo()!=null?row.externalRefundNo():row.externalTransactionNo()))type="IDENTITY_DIFFERENCE";
  else if(ledger.size()!=1||!Objects.equals(ledger.getFirst().entryType(),row.transactionType().equals("PAYMENT")?"PAYMENT":"PAYMENT_REFUND")||!Objects.equals(ledger.getFirst().direction(),row.transactionType().equals("PAYMENT")?"CREDIT":"DEBIT")||ledger.getFirst().amount().compareTo(p.amount())!=0||!Objects.equals(ledger.getFirst().currencyCode(),p.currencyCode())||!Objects.equals(ledger.getFirst().patientAccountId(),p.patientAccountId()))type="LEDGER_DIFFERENCE";
  else if(!p.paidAt().atZone(zone).toLocalDate().equals(row.occurredAt().atZone(zone).toLocalDate()))type="TIME_DIFFERENCE";
  else type="MATCHED";
  return new Match(type,p,local,ext);
 }
 public static Long orderId(StatementRow row){boolean original=!"REFUND".equals(row.transactionType());String s=original?row.merchantOrderNo():row.refundRequestNo();String prefix=original?"P":"R";if(s==null||!s.matches(prefix+"[1-9][0-9]{0,18}"))return null;try{return Long.valueOf(s.substring(1));}catch(NumberFormatException e){return null;}}
 public static String key(StatementRow row){return row.transactionType()+"|"+(!"REFUND".equals(row.transactionType())?row.merchantOrderNo():row.refundRequestNo());}
 public static String channelKey(StatementRow row){return row.transactionType()+"|"+("PAYMENT".equals(row.transactionType())||"REVERSAL".equals(row.transactionType())?row.externalTransactionNo():row.externalRefundNo()!=null?row.externalRefundNo():row.originalExternalTransactionNo()+"|"+row.refundRequestNo());}
 public static BigDecimal signed(Payment payment){return "REFUND".equals(payment.paymentType())?payment.amount().negate():payment.amount();}
}
