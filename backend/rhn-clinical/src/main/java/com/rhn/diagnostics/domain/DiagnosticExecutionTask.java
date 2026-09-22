package com.rhn.diagnostics.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "RHN_EX_DIAG_EXEC_TASK")
public class DiagnosticExecutionTask {
    @Id @Column(name = "ID_DIAG_EXEC_TASK") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_STL") private Long settlementId;
    @Column(name = "ID_DIAG_REPORT") private Long reportId;
    @Column(name = "CD_TASK_NO", nullable = false) private String taskNo;
    @Column(name = "SD_REQ_TYPE", nullable = false) private String requestType;
    @Column(name = "CD_ITEM_SNAP", nullable = false) private String itemCodeSnapshot;
    @Column(name = "NA_ITEM_SNAP", nullable = false) private String itemNameSnapshot;
    @Column(name = "SD_SPEC_TYPE_SNAP") private String specimenTypeSnapshot;
    @Column(name = "SD_EXAM_TYPE_SNAP") private String examinationTypeSnapshot;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_COLLD") private Instant collectedAt;
    @Column(name = "ID_USER_COLLD") private Long collectedBy;
    @Column(name = "CD_SPEC_NO") private String specimenNo;
    @Column(name = "DES_COLL_NOTE") private String collectionNote;
    @Column(name = "DT_STARTED") private Instant startedAt;
    @Column(name = "ID_USER_STARTED") private Long startedBy;
    @Column(name = "DT_CMPLD") private Instant completedAt;
    @Column(name = "ID_USER_CMPLD") private Long completedBy;
    @Column(name = "DES_COMP_NOTE") private String completionNote;
    @Column(name = "DT_CNCLD") private Instant cancelledAt;
    @Column(name = "DES_EXCEPT_NOTE") private String exceptionNote;

    protected DiagnosticExecutionTask() {}

    public DiagnosticExecutionTask(Long tenantId, Long organizationId, Long departmentId,
                                   Long residentId, Long encounterId, Long requestId, String requestNo,
                                   String requestType, String itemCode, String itemName,
                                   String specimenType, String examinationType, boolean settlementRequired,
                                   Instant createdAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.residentId = residentId; this.encounterId = encounterId;
        this.requestId = requestId; this.taskNo = "DX-" + requestNo; this.requestType = requestType;
        this.itemCodeSnapshot = itemCode; this.itemNameSnapshot = itemName;
        this.specimenTypeSnapshot = specimenType; this.examinationTypeSnapshot = examinationType;
        this.status = settlementRequired ? "WAITING_SETTLEMENT" : "READY";
        this.createdAt = createdAt == null ? Instant.now() : createdAt;
    }

    public void authorize(Long value, Instant occurredAt) {
        settlementId = value;
        if ("WAITING_SETTLEMENT".equals(status)) status = "READY";
        exceptionNote = null;
    }

    public void reverseAuthorization(Instant occurredAt) {
        if ("WAITING_SETTLEMENT".equals(status) || "CANCELLED".equals(status)) return;
        settlementId = null;
        if ("READY".equals(status)) status = "WAITING_SETTLEMENT";
        else {
            status = "EXCEPTION";
            exceptionNote = "医嘱执行后结算被冲正，请人工核对";
        }
    }

    public void collect(long expectedRevision, String value, String note, Long actor, Instant occurredAt) {
        requireRevision(expectedRevision);
        if (!"LABORATORY".equals(requestType)) invalid("DIAGNOSTIC_COLLECTION_TYPE_INVALID", "检查项目不需要标本采集");
        if (!"READY".equals(status)) invalid("DIAGNOSTIC_COLLECTION_STATE_INVALID", "只有待执行的检验申请可以采集标本");
        status = "COLLECTED"; specimenNo = value; collectionNote = note;
        collectedBy = actor; collectedAt = occurredAt;
    }

    public void start(long expectedRevision, Long actor, Instant occurredAt) {
        requireRevision(expectedRevision);
        boolean allowed = "LABORATORY".equals(requestType) ? "COLLECTED".equals(status) : "READY".equals(status);
        if (!allowed) invalid("DIAGNOSTIC_START_STATE_INVALID",
                "LABORATORY".equals(requestType) ? "检验项目需先完成标本采集" : "当前检查项目不能开始执行");
        status = "IN_PROGRESS"; startedBy = actor; startedAt = occurredAt;
    }

    public void recordReport(Long value, String reportStatus, Long actor, String note, Instant occurredAt) {
        reportId = value;
        if ("CANCELLED".equals(reportStatus)) {
            status = "EXCEPTION"; exceptionNote = "报告已取消，请重新执行或撤销申请"; return;
        }
        if ("PRELIMINARY".equals(reportStatus)) {
            if (!"COMPLETED".equals(status)) status = "IN_PROGRESS";
            return;
        }
        status = "COMPLETED"; completedBy = actor; completedAt = occurredAt;
        completionNote = note; exceptionNote = null;
    }

    public void cancel(Instant occurredAt) {
        if ("COMPLETED".equals(status)) return;
        status = "CANCELLED"; cancelledAt = occurredAt;
    }

    private void requireRevision(long expected) {
        if (revision != expected) invalid("DIAGNOSTIC_TASK_REVISION_CONFLICT", "医技任务已被其他用户更新，请刷新后重试");
    }

    private void invalid(String code, String message) { throw new BusinessException(code, message, HttpStatus.CONFLICT); }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long requestId() { return requestId; }
    public Long settlementId() { return settlementId; }
    public Long reportId() { return reportId; }
    public String taskNo() { return taskNo; }
    public String requestType() { return requestType; }
    public String itemCodeSnapshot() { return itemCodeSnapshot; }
    public String itemNameSnapshot() { return itemNameSnapshot; }
    public String specimenTypeSnapshot() { return specimenTypeSnapshot; }
    public String examinationTypeSnapshot() { return examinationTypeSnapshot; }
    public String status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Instant collectedAt() { return collectedAt; }
    public Long collectedBy() { return collectedBy; }
    public String specimenNo() { return specimenNo; }
    public String collectionNote() { return collectionNote; }
    public Instant startedAt() { return startedAt; }
    public Long startedBy() { return startedBy; }
    public Instant completedAt() { return completedAt; }
    public Long completedBy() { return completedBy; }
    public String completionNote() { return completionNote; }
    public Instant cancelledAt() { return cancelledAt; }
    public String exceptionNote() { return exceptionNote; }
}

