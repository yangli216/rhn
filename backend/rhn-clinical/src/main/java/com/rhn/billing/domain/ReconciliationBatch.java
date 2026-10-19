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
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS") private ReconciliationBatchStatus status;
    @Column(name = "CD_SRC") private String sourceCode;
    @Column(name = "CD_PAY_METHOD") private String paymentMethodCode; @Column(name = "CD_EXT_BATCH_NO") private String externalBatchNo;
    @Column(name = "DA_BIZ") private LocalDate businessDate; @Column(name = "QTY_LOCAL") private int localCount;
    @Column(name = "QTY_EXT") private int externalCount; @Column(name = "QTY_DIFF") private int differenceCount;
    @Column(name = "AMT_LOCAL", precision=24, scale=6) private BigDecimal localAmount;
    @Column(name = "AMT_EXT", precision=24, scale=6) private BigDecimal externalAmount;
    @Column(name = "AMT_DIFF", precision=24, scale=6) private BigDecimal differenceAmount;
    @Column(name = "CD_CCY") private String currencyCode; @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_CREATED") private Instant createdAt; @Column(name = "ID_USER_CMPLD") private Long completedBy;
    @Column(name = "DT_CMPLD") private Instant completedAt;
    @Column(name="ID_RECON_FILE") private Long statementFileId;
    @Column(name="ID_RECON_TASK") private Long reconciliationTaskId;
    @Column(name="NUM_EXEC",nullable=false) private int executionNumber;
    @Column(name="CD_MERCH_SCOPE",nullable=false) private String merchantScope = "LEGACY";
    @Column(name="SD_CLOSURE",nullable=false) private String closure = "OPEN";
    @Column(name="ID_RVWR") private Long reviewerId;
    @Column(name="DT_RVWD") private Instant reviewedAt;
    @Column(name="DT_SNAP") private Instant snapshotAt;
    @Column(name="TXT_LOCAL_HASH") private String localSnapshotHash;
    public void bindStatement(Long task,Long file,int execution,String scope,Instant cutoff,String hash){reconciliationTaskId=task;statementFileId=file;executionNumber=execution;merchantScope=scope;snapshotAt=cutoff;localSnapshotHash=hash;}
    public void close(boolean exception,Long reviewer){closure=exception?"CLOSED_WITH_EXCEPTION":"CLOSED_MATCHED";reviewerId=reviewer;reviewedAt=Instant.now();}
    public Long statementFileId(){return statementFileId;} public Long reconciliationTaskId(){return reconciliationTaskId;} public int executionNumber(){return executionNumber;}
    public String merchantScope(){return merchantScope;} public String closure(){return closure;} public Instant snapshotAt(){return snapshotAt;} public String localSnapshotHash(){return localSnapshotHash;}
    public Long reviewerId(){return reviewerId;} public Instant reviewedAt(){return reviewedAt;}
    @Column(name="AMT_EXT_PAY",precision=24,scale=6,nullable=false) private BigDecimal externalPayments=zero();
    @Column(name="AMT_REF_ACCEPT",precision=24,scale=6,nullable=false) private BigDecimal acceptedRefunds=zero();
    @Column(name="AMT_REF_FINAL",precision=24,scale=6,nullable=false) private BigDecimal finalRefunds=zero();
    @Column(name="AMT_FEE",precision=24,scale=6,nullable=false) private BigDecimal fees=zero();
    public void totals(BigDecimal pay,BigDecimal accepted,BigDecimal completed,BigDecimal fee){externalPayments=pay;acceptedRefunds=accepted;finalRefunds=completed;fees=fee;}
    public BigDecimal externalPayments(){return externalPayments;} public BigDecimal acceptedRefunds(){return acceptedRefunds;} public BigDecimal finalRefunds(){return finalRefunds;} public BigDecimal fees(){return fees;}
    protected ReconciliationBatch() {}
    public ReconciliationBatch(Long tenantId,Long organizationId,String batchNo,String commandCode,String type,
                               String sourceCode,String method,LocalDate date,String currency,Long actor){
        this.id=GlobalIds.next();this.tenantId=tenantId;this.organizationId=organizationId;this.batchNo=batchNo;
        this.commandCode=commandCode;this.reconciliationType=type;
        this.status=ReconciliationBatchStatus.IMPORTED;this.sourceCode=sourceCode;
        this.paymentMethodCode=method;this.businessDate=date;this.currencyCode=currency;this.createdBy=actor;
        this.createdAt=Instant.now();this.localAmount=zero();this.externalAmount=zero();this.differenceAmount=zero();
    }
    public void complete(String externalBatchNo,int localCount,int externalCount,int differences,BigDecimal local,
                         BigDecimal external,Long actor){this.externalBatchNo=externalBatchNo;this.localCount=localCount;
        this.externalCount=externalCount;this.differenceCount=differences;this.localAmount=local;this.externalAmount=external;
        this.differenceAmount=external.subtract(local);
        this.status=differences==0?ReconciliationBatchStatus.MATCHED:ReconciliationBatchStatus.DIFFERENCE;
        this.completedBy=actor;this.completedAt=Instant.now();}
    public void resolved(Long actor){this.status=ReconciliationBatchStatus.RESOLVED;this.completedBy=actor;this.completedAt=Instant.now();}
    public void failed(){this.status=ReconciliationBatchStatus.FAILED;}
    private BigDecimal zero(){return BigDecimal.ZERO.setScale(6);}
    public Long id(){return id;} public long revision(){return revision;} public Long tenantId(){return tenantId;}
    public Long organizationId(){return organizationId;} public String batchNo(){return batchNo;} public String commandCode(){return commandCode;}
    public String reconciliationType(){return reconciliationType;}
    public ReconciliationBatchStatus status(){return status;} public String sourceCode(){return sourceCode;}
    public String paymentMethodCode(){return paymentMethodCode;} public String externalBatchNo(){return externalBatchNo;}
    public LocalDate businessDate(){return businessDate;} public int localCount(){return localCount;} public int externalCount(){return externalCount;}
    public int differenceCount(){return differenceCount;} public BigDecimal localAmount(){return localAmount;}
    public BigDecimal externalAmount(){return externalAmount;} public BigDecimal differenceAmount(){return differenceAmount;}
    public String currencyCode(){return currencyCode;} public Instant createdAt(){return createdAt;} public Instant completedAt(){return completedAt;}
}
