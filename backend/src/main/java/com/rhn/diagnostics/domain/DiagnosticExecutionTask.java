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
@Table(name = "diagnostic_execution_tasks")
public class DiagnosticExecutionTask {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "settlement_id") private Long settlementId;
    @Column(name = "report_id") private Long reportId;
    @Column(name = "task_no", nullable = false) private String taskNo;
    @Column(name = "request_type", nullable = false) private String requestType;
    @Column(name = "item_code_snapshot", nullable = false) private String itemCodeSnapshot;
    @Column(name = "item_name_snapshot", nullable = false) private String itemNameSnapshot;
    @Column(name = "specimen_type_snapshot") private String specimenTypeSnapshot;
    @Column(name = "examination_type_snapshot") private String examinationTypeSnapshot;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "collected_at") private Instant collectedAt;
    @Column(name = "collected_by") private Long collectedBy;
    @Column(name = "specimen_no") private String specimenNo;
    @Column(name = "collection_note") private String collectionNote;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "started_by") private Long startedBy;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "completed_by") private Long completedBy;
    @Column(name = "completion_note") private String completionNote;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "exception_note") private String exceptionNote;

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

