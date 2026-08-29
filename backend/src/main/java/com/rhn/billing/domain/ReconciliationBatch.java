package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity @Table(name="reconciliation_batches")
public class ReconciliationBatch {
    @Id private Long id; @Version private long revision;
    @Column(name="tenant_id") private Long tenantId; @Column(name="organization_id") private Long organizationId;
    @Column(name="external_message_id") private Long externalMessageId; @Column(name="batch_no") private String batchNo;
    @Column(name="command_code") private String commandCode; @Column(name="reconciliation_type") private String reconciliationType;
    private String status; @Column(name="source_code") private String sourceCode;
    @Column(name="payment_method_code") private String paymentMethodCode; @Column(name="external_batch_no") private String externalBatchNo;
    @Column(name="business_date") private LocalDate businessDate; @Column(name="local_count") private int localCount;
    @Column(name="external_count") private int externalCount; @Column(name="difference_count") private int differenceCount;
    @Column(name="local_amount",precision=24,scale=6) private BigDecimal localAmount;
    @Column(name="external_amount",precision=24,scale=6) private BigDecimal externalAmount;
    @Column(name="difference_amount",precision=24,scale=6) private BigDecimal differenceAmount;
    @Column(name="currency_code") private String currencyCode; @Column(name="created_by") private Long createdBy;
    @Column(name="created_at") private Instant createdAt; @Column(name="completed_by") private Long completedBy;
    @Column(name="completed_at") private Instant completedAt;
    protected ReconciliationBatch() {}
    public ReconciliationBatch(Long tenantId,Long organizationId,String batchNo,String commandCode,String type,
                               String sourceCode,String method,LocalDate date,String currency,Long actor){
        this.id=GlobalIds.next();this.tenantId=tenantId;this.organizationId=organizationId;this.batchNo=batchNo;
        this.commandCode=commandCode;this.reconciliationType=type;this.status="IMPORTED";this.sourceCode=sourceCode;
        this.paymentMethodCode=method;this.businessDate=date;this.currencyCode=currency;this.createdBy=actor;
        this.createdAt=Instant.now();this.localAmount=zero();this.externalAmount=zero();this.differenceAmount=zero();
    }
    public void complete(String externalBatchNo,int localCount,int externalCount,int differences,BigDecimal local,
                         BigDecimal external,Long actor){this.externalBatchNo=externalBatchNo;this.localCount=localCount;
        this.externalCount=externalCount;this.differenceCount=differences;this.localAmount=local;this.externalAmount=external;
        this.differenceAmount=external.subtract(local);this.status=differences==0?"MATCHED":"DIFFERENCE";
        this.completedBy=actor;this.completedAt=Instant.now();}
    public void resolved(Long actor){this.status="RESOLVED";this.completedBy=actor;this.completedAt=Instant.now();}
    public void failed(){this.status="FAILED";}
    private BigDecimal zero(){return BigDecimal.ZERO.setScale(6);}
    public Long id(){return id;} public long revision(){return revision;} public Long tenantId(){return tenantId;}
    public Long organizationId(){return organizationId;} public String batchNo(){return batchNo;} public String commandCode(){return commandCode;}
    public String reconciliationType(){return reconciliationType;} public String status(){return status;} public String sourceCode(){return sourceCode;}
    public String paymentMethodCode(){return paymentMethodCode;} public String externalBatchNo(){return externalBatchNo;}
    public LocalDate businessDate(){return businessDate;} public int localCount(){return localCount;} public int externalCount(){return externalCount;}
    public int differenceCount(){return differenceCount;} public BigDecimal localAmount(){return localAmount;}
    public BigDecimal externalAmount(){return externalAmount;} public BigDecimal differenceAmount(){return differenceAmount;}
    public String currencyCode(){return currencyCode;} public Instant createdAt(){return createdAt;} public Instant completedAt(){return completedAt;}
}
