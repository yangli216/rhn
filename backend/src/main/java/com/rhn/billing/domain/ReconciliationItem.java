package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity @Table(name="reconciliation_items")
public class ReconciliationItem {
    @Id private Long id; @Version private long revision; @Column(name="tenant_id") private Long tenantId;
    @Column(name="reconciliation_batch_id") private Long reconciliationBatchId; @Column(name="payment_id") private Long paymentId;
    @Column(name="cashier_close_id") private Long cashierCloseId; @Column(name="receipt_id") private Long receiptId;
    @Column(name="external_transaction_no") private String externalTransactionNo; @Column(name="match_type") private String matchType;
    private String status; @Column(name="local_amount",precision=24,scale=6) private BigDecimal localAmount;
    @Column(name="external_amount",precision=24,scale=6) private BigDecimal externalAmount;
    @Column(name="difference_amount",precision=24,scale=6) private BigDecimal differenceAmount;
    @Column(name="currency_code") private String currencyCode; @Column(name="owner_id") private Long ownerId;
    @Column(name="resolved_by") private Long resolvedBy; @Column(name="resolved_at") private Instant resolvedAt;
    private String resolution;
    protected ReconciliationItem(){}
    public ReconciliationItem(Long tenant,Long batch,Long payment,String externalNo,String match,BigDecimal local,
                              BigDecimal external,String currency){id=GlobalIds.next();tenantId=tenant;reconciliationBatchId=batch;
        paymentId=payment;externalTransactionNo=externalNo;matchType=match;status="MATCHED".equals(match)?"RESOLVED":"OPEN";
        localAmount=local;externalAmount=external;differenceAmount=external.subtract(local);currencyCode=currency;}
    public void resolve(Long actor,String reason,boolean ignore){status=ignore?"IGNORED":"RESOLVED";resolvedBy=actor;resolvedAt=Instant.now();resolution=reason;}
    public Long id(){return id;} public long revision(){return revision;} public Long tenantId(){return tenantId;}
    public Long reconciliationBatchId(){return reconciliationBatchId;} public Long paymentId(){return paymentId;}
    public String externalTransactionNo(){return externalTransactionNo;} public String matchType(){return matchType;}
    public String status(){return status;} public BigDecimal localAmount(){return localAmount;} public BigDecimal externalAmount(){return externalAmount;}
    public BigDecimal differenceAmount(){return differenceAmount;} public String currencyCode(){return currencyCode;}
    public Long resolvedBy(){return resolvedBy;} public Instant resolvedAt(){return resolvedAt;} public String resolution(){return resolution;}
}
