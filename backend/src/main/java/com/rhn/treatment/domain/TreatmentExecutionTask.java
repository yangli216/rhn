package com.rhn.treatment.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

@Entity
@Table(name = "treatment_execution_tasks")
public class TreatmentExecutionTask {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "source_group_id", nullable = false) private Long sourceGroupId;
    @Column(name = "task_no", nullable = false) private String taskNo;
    @Column(name = "task_type", nullable = false) private String taskType;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "started_by") private Long startedBy;
    @Column(name = "verification_method") private String verificationMethod;
    @Column(name = "execution_site") private String executionSite;
    @Column(name = "start_note") private String startNote;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "completed_by") private Long completedBy;
    @Column(name = "result_code") private String resultCode;
    @Column(name = "completion_note") private String completionNote;
    @Column(name = "adverse_reaction", nullable = false) private boolean adverseReaction;
    @Column(name = "adverse_reaction_detail") private String adverseReactionDetail;
    @Column(name = "exception_note") private String exceptionNote;

    protected TreatmentExecutionTask() {}

    public TreatmentExecutionTask(Long tenantId, Long organizationId, Long departmentId,
                                  Long residentId, Long encounterId, Long sourceGroupId,
                                  String taskType, Instant createdAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.residentId = residentId; this.encounterId = encounterId;
        this.sourceGroupId = sourceGroupId; this.taskNo = "TX" + NUMBER_TIME.format(createdAt)
                + GlobalIds.randomSuffix(6); this.taskType = taskType; this.status = "WAITING_SETTLEMENT";
        this.createdAt = createdAt; this.adverseReaction = false;
    }

    public void synchronize(boolean anyActive, boolean allSettled, boolean allFulfilled,
                            boolean allSkinTestsPassed, boolean skinTestPositive, String gateNote) {
        if ("COMPLETED".equals(status) || "CANCELLED".equals(status)) return;
        if (!anyActive) { status = "CANCELLED"; return; }
        if ("IN_PROGRESS".equals(status)) {
            if (!allSettled || !allFulfilled) {
                status = "EXCEPTION";
                exceptionNote = gateNote;
            }
            return;
        }
        if ("EXCEPTION".equals(status) && (exceptionNote == null || !exceptionNote.startsWith("[SKIN_TEST]"))) return;
        if (skinTestPositive) {
            status = "EXCEPTION";
            exceptionNote = "[SKIN_TEST] 皮试阳性，当前用药禁止执行，请医生调整医嘱";
            return;
        }
        status = !allSettled ? "WAITING_SETTLEMENT" : !allFulfilled ? "WAITING_DISPENSE"
                : !allSkinTestsPassed ? "WAITING_SKIN_TEST" : "READY";
        if (!"EXCEPTION".equals(status)) exceptionNote = null;
    }

    public void start(long expectedRevision, boolean identityVerified, String verificationMethod,
                      String executionSite, String note, Long actorId, Instant occurredAt) {
        requireRevision(expectedRevision);
        if (!"READY".equals(status)) throw conflict("TREATMENT_START_STATE_INVALID", "只有已满足执行条件的治疗任务可以开始");
        if (!identityVerified) throw conflict("TREATMENT_IDENTITY_VERIFICATION_REQUIRED", "开始治疗前必须完成患者身份核对");
        this.status = "IN_PROGRESS"; this.startedAt = occurredAt; this.startedBy = actorId;
        this.verificationMethod = clean(verificationMethod) == null ? "NAME_AND_IDENTIFIER" : clean(verificationMethod);
        this.executionSite = clean(executionSite); this.startNote = clean(note);
    }

    public void complete(long expectedRevision, String resultCode, String note, boolean adverseReaction,
                         String adverseReactionDetail, Long actorId, Instant occurredAt) {
        requireRevision(expectedRevision);
        if (!"IN_PROGRESS".equals(status)) throw conflict(
                "TREATMENT_COMPLETE_STATE_INVALID", "只有执行中的治疗任务可以结束");
        String result = clean(resultCode) == null ? "COMPLETED" : clean(resultCode).toUpperCase();
        if (!java.util.Set.of("COMPLETED", "INTERRUPTED", "NOT_COMPLETED").contains(result)) {
            throw conflict("TREATMENT_RESULT_CODE_INVALID", "治疗结果编码不正确");
        }
        String reactionDetail = clean(adverseReactionDetail);
        if (adverseReaction && reactionDetail == null) throw conflict(
                "TREATMENT_ADVERSE_REACTION_DETAIL_REQUIRED", "记录不良反应时必须填写具体表现和处置");
        this.completedAt = occurredAt; this.completedBy = actorId; this.resultCode = result;
        this.completionNote = clean(note); this.adverseReaction = adverseReaction;
        this.adverseReactionDetail = reactionDetail;
        if ("COMPLETED".equals(result) && !adverseReaction) this.status = "COMPLETED";
        else {
            this.status = "EXCEPTION";
            this.exceptionNote = adverseReaction ? "治疗过程中记录不良反应，需继续随访处置"
                    : "治疗未正常完成：" + result;
        }
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw conflict(
                "TREATMENT_TASK_REVISION_CONFLICT", "治疗任务已被其他用户更新，请刷新后重试");
    }

    private BusinessException conflict(String code, String message) {
        return new BusinessException(code, message, HttpStatus.CONFLICT);
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long sourceGroupId() { return sourceGroupId; }
    public String taskNo() { return taskNo; }
    public String taskType() { return taskType; }
    public String status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Instant startedAt() { return startedAt; }
    public Long startedBy() { return startedBy; }
    public String verificationMethod() { return verificationMethod; }
    public String executionSite() { return executionSite; }
    public String startNote() { return startNote; }
    public Instant completedAt() { return completedAt; }
    public Long completedBy() { return completedBy; }
    public String resultCode() { return resultCode; }
    public String completionNote() { return completionNote; }
    public boolean adverseReaction() { return adverseReaction; }
    public String adverseReactionDetail() { return adverseReactionDetail; }
    public String exceptionNote() { return exceptionNote; }
}
