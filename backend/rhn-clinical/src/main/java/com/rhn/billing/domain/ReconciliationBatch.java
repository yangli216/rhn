package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity @Table(name="RHN_BIL_RECON_BATCH")
public class ReconciliationBatch {
    @Id @Column(name = "ID_RECON_BATCH") private Long id; @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT") private Long tenantId; @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_EXT_MSG") private Long externalMessageId; @Column(name = "CD_BATCH_NO") private String batchNo;
    @Column(name = "CD_COMMAND") private String commandCode; @Column(name = "SD_RECON_TYPE") private String reconciliationType;
    @Column(name = "SD_STATUS") private String status; @Column(name = "CD_SRC") private String sourceCode;
    @Column(name = "CD_PAY_METHOD") private String paymentMethodCode; @Column(name = "CD_EXT_BATCH_NO") private String externalBatchNo;
    @Column(name = "DA_BIZ") private LocalDate businessDate; @Column(name = "QTY_LOCAL") private int localCount;
    @Column(name = "QTY_EXT") private int externalCount; @Column(name = "QTY_DIFF") private int differenceCount;
    @Column(name = "AMT_LOCAL", precision=24, scale=6) private BigDecimal localAmount;
    @Column(name = "AMT_EXT", precision=24, scale=6) private BigDecimal externalAmount;
    @Column(name = "AMT_DIFF", precision=24, scale=6) private BigDecimal differenceAmount;
    @Column(name = "CD_CCY") private String currencyCode; @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_CREATED") private Instant createdAt; @Column(name = "ID_USER_CMPLD") private Long completedBy;
    @Column(name = "DT_CMPLD") private Instant completedAt;
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
