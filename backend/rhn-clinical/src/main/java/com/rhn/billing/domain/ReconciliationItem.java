package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity @Table(name="RHN_BIL_RECON_ITEM")
public class ReconciliationItem {
    @Id @Column(name = "ID_RECON_ITEM") private Long id; @Version @Column(name = "REVISION") private long revision; @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "ID_RECON_BATCH") private Long reconciliationBatchId; @Column(name = "ID_PAY") private Long paymentId;
    @Column(name = "ID_CASHIER_CLOSE") private Long cashierCloseId; @Column(name = "ID_RCPT") private Long receiptId;
    @Column(name = "CD_EXT_TXN_NO") private String externalTransactionNo; @Column(name = "SD_MATCH_TYPE") private String matchType;
    @Column(name = "SD_STATUS") private String status; @Column(name = "AMT_LOCAL", precision=24, scale=6) private BigDecimal localAmount;
    @Column(name = "AMT_EXT", precision=24, scale=6) private BigDecimal externalAmount;
    @Column(name = "AMT_DIFF", precision=24, scale=6) private BigDecimal differenceAmount;
    @Column(name = "CD_CCY") private String currencyCode; @Column(name = "ID_OWNER") private Long ownerId;
    @Column(name = "ID_USER_RSLVD") private Long resolvedBy; @Column(name = "DT_RSLVD") private Instant resolvedAt;
    @Column(name = "DES_RSLN") private String resolution;
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
