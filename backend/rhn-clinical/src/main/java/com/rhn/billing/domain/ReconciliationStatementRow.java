package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds;
import com.rhn.billing.api.PaymentReconciliation.StatementRow;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
@Entity @Table(name="RHN_BIL_RECON_ROW")
public class ReconciliationStatementRow {
 @Version @Column(name="REVISION") private long revision;
 @Id @Column(name="ID_RECON_ROW") private Long id;
 @Column(name="ID_TNT",nullable=false) private Long tenantId;
 @Column(name="ID_RECON_FILE",nullable=false) private Long fileId;
 @Column(name="NUM_LINE",nullable=false) private int lineNumber;
 @Column(name="ID_ORG") private Long organizationId;
 @Column(name="ID_PAY_ORDER") private Long paymentOrderId;
 @Column(name="SD_TXN_TYPE",nullable=false) private String transactionType;
 @Column(name="CD_MERCH_ORDER") private String merchantOrderNo;
 @Column(name="CD_EXT_TXN") private String externalTransactionNo;
 @Column(name="CD_REF_REQ") private String refundRequestNo;
 @Column(name="CD_EXT_REF") private String externalRefundNo;
 @Column(name="CD_ORIG_TXN") private String originalExternalTransactionNo;
 @Column(name="AMT_GROSS",precision=24,scale=6,nullable=false) private BigDecimal amount;
 @Column(name="AMT_SETTLE",precision=24,scale=6) private BigDecimal settlementAmount;
 @Column(name="AMT_FEE",precision=24,scale=6) private BigDecimal fee;
 @Column(name="CD_CCY",nullable=false) private String currencyCode;
 @Column(name="SD_CHANNEL_STATUS",nullable=false) private String channelStatus;
 @Column(name="SD_OUTCOME",nullable=false) private String outcome;
 @Column(name="FL_FINAL",nullable=false) private boolean finalSuccess;
 @Column(name="DT_OCCRD",nullable=false) private Instant occurredAt;
 @Column(name="SD_DISPOS",nullable=false) private String disposition="OPEN";
 @Column(name="ID_PRPSR") private Long proposerId;
 @Column(name="ID_RVWR") private Long reviewerId;
 @Column(name="DES_REASON") private String reason;
 public void propose(Long actor,String reason){disposition="REVIEW_PENDING";proposerId=actor;this.reason=reason;}
 public void review(Long actor,boolean approve){disposition=approve?"ACCEPTED_EXCEPTION":"OPEN";reviewerId=actor;}
 public long revision(){return revision;} public String disposition(){return disposition;} public Long proposerId(){return proposerId;} public Long reviewerId(){return reviewerId;} public String reason(){return reason;}
 protected ReconciliationStatementRow(){}
 public ReconciliationStatementRow(Long tenant,Long file,StatementRow row,Long org,Long order){id=GlobalIds.next();tenantId=tenant;fileId=file;lineNumber=row.lineNumber();organizationId=org;paymentOrderId=order;transactionType=row.transactionType();merchantOrderNo=row.merchantOrderNo();externalTransactionNo=row.externalTransactionNo();refundRequestNo=row.refundRequestNo();externalRefundNo=row.externalRefundNo();originalExternalTransactionNo=row.originalExternalTransactionNo();amount=row.amount();settlementAmount=row.settlementAmount();fee=row.fee();currencyCode=row.currencyCode();channelStatus=row.channelStatus();finalSuccess=row.finalSuccess();outcome=row.outcome().name();occurredAt=row.occurredAt();}
 public Long id(){return id;} public Long fileId(){return fileId;} public Long organizationId(){return organizationId;} public Long paymentOrderId(){return paymentOrderId;} public int lineNumber(){return lineNumber;}
 public String transactionType(){return transactionType;} public String merchantOrderNo(){return merchantOrderNo;} public String externalTransactionNo(){return externalTransactionNo;} public String refundRequestNo(){return refundRequestNo;} public String externalRefundNo(){return externalRefundNo;} public String originalExternalTransactionNo(){return originalExternalTransactionNo;}
 public BigDecimal amount(){return amount;} public BigDecimal settlementAmount(){return settlementAmount;} public BigDecimal fee(){return fee;} public String currencyCode(){return currencyCode;} public String channelStatus(){return channelStatus;} public boolean finalSuccess(){return finalSuccess;} public Instant occurredAt(){return occurredAt;}
}
