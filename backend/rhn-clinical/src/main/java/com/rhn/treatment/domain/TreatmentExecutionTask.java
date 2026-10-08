package com.rhn.treatment.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

@Entity
@Table(name = "RHN_EX_TREAT_EXEC_TASK")
public class TreatmentExecutionTask {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    @Id @Column(name = "ID_TREAT_EXEC_TASK") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_CARE_REQ_SRC_GRP", nullable = false) private Long sourceGroupId;
    @Column(name = "CD_TASK_NO", nullable = false) private String taskNo;
    @Column(name = "SD_TASK_TYPE", nullable = false) private String taskType;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private TreatmentExecutionTaskStatus status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_STARTED") private Instant startedAt;
    @Column(name = "ID_USER_STARTED") private Long startedBy;
    @Column(name = "SD_VRFCTN_METHOD") private String verificationMethod;
    @Column(name = "SD_EXEC_SITE") private String executionSite;
    @Column(name = "DES_START_NOTE") private String startNote;
    @Column(name = "DT_CMPLD") private Instant completedAt;
    @Column(name = "ID_USER_CMPLD") private Long completedBy;
    @Column(name = "CD_RESULT") private String resultCode;
    @Column(name = "DES_COMP_NOTE") private String completionNote;
    @Column(name = "FG_ADVERSE_REACT") private Boolean adverseReaction;
    @Column(name = "DES_ADVERSE_REACT_DETAIL") private String adverseReactionDetail;
    @Column(name = "DES_EXCEPT_NOTE") private String exceptionNote;

    protected TreatmentExecutionTask() {}

    public TreatmentExecutionTask(Long tenantId, Long organizationId, Long departmentId,
                                  Long residentId, Long encounterId, Long sourceGroupId,
                                  String taskType, Instant createdAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.residentId = residentId; this.encounterId = encounterId;
        this.sourceGroupId = sourceGroupId; this.taskNo = "TX" + NUMBER_TIME.format(createdAt)
                + GlobalIds.randomSuffix(6); this.taskType = taskType; this.status = TreatmentExecutionTaskStatus.WAITING_SETTLEMENT;
        this.createdAt = createdAt;
    }

    public void synchronize(boolean anyActive, boolean allSettled, boolean allFulfilled,
                            boolean allSkinTestsPassed, boolean skinTestPositive, String gateNote) {
        if (status == TreatmentExecutionTaskStatus.COMPLETED || status == TreatmentExecutionTaskStatus.CANCELLED) return;
        if (!anyActive) { status = TreatmentExecutionTaskStatus.CANCELLED; return; }
        if (status == TreatmentExecutionTaskStatus.IN_PROGRESS) {
            if (!allSettled || !allFulfilled) {
                status = TreatmentExecutionTaskStatus.EXCEPTION;
                exceptionNote = gateNote;
            }
            return;
        }
        if (status == TreatmentExecutionTaskStatus.EXCEPTION && (exceptionNote == null || !exceptionNote.startsWith("[SKIN_TEST]"))) return;
        if (skinTestPositive) {
            status = TreatmentExecutionTaskStatus.EXCEPTION;
            exceptionNote = "[SKIN_TEST] 皮试阳性，当前用药禁止执行，请医生调整医嘱";
            return;
        }
        status = !allSettled ? TreatmentExecutionTaskStatus.WAITING_SETTLEMENT : !allFulfilled ? TreatmentExecutionTaskStatus.WAITING_DISPENSE
                : !allSkinTestsPassed ? TreatmentExecutionTaskStatus.WAITING_SKIN_TEST : TreatmentExecutionTaskStatus.READY;
        if (status != TreatmentExecutionTaskStatus.EXCEPTION) exceptionNote = null;
    }

    public void start(long expectedRevision, boolean identityVerified, String verificationMethod,
                      String executionSite, String note, Long actorId, Instant occurredAt) {
        requireRevision(expectedRevision);
        if (status != TreatmentExecutionTaskStatus.READY) throw conflict("TREATMENT_START_STATE_INVALID", "只有已满足执行条件的治疗任务可以开始");
        if (!identityVerified) throw conflict("TREATMENT_IDENTITY_VERIFICATION_REQUIRED", "开始治疗前必须完成患者身份核对");
        String method = Strings.trimToNull(verificationMethod);
        if (method == null || !java.util.Set.of("NAME_AND_IDENTIFIER", "CARD", "MANUAL").contains(method)) {
            throw conflict("TREATMENT_VERIFICATION_METHOD_REQUIRED", "必须明确记录患者身份核对方式");
        }
        this.status = TreatmentExecutionTaskStatus.IN_PROGRESS; this.startedAt = occurredAt; this.startedBy = actorId;
        this.verificationMethod = method;
        this.executionSite = Strings.trimToNull(executionSite); this.startNote = Strings.trimToNull(note);
    }

    public void complete(long expectedRevision, String resultCode, String note, Boolean adverseReaction,
                         String adverseReactionDetail, Long actorId, Instant occurredAt) {
        requireRevision(expectedRevision);
        if (status != TreatmentExecutionTaskStatus.IN_PROGRESS) throw conflict(
                "TREATMENT_COMPLETE_STATE_INVALID", "只有执行中的治疗任务可以结束");
        String result = Strings.trimToNull(resultCode);
        if (result == null) throw conflict("TREATMENT_RESULT_REQUIRED", "必须明确记录治疗执行结果");
        result = result.toUpperCase(java.util.Locale.ROOT);
        if (adverseReaction == null) throw conflict("TREATMENT_ADVERSE_REACTION_REQUIRED", "必须明确评估是否发生不良反应");
        if (!java.util.Set.of("COMPLETED", "INTERRUPTED", "NOT_COMPLETED").contains(result)) {
            throw conflict("TREATMENT_RESULT_CODE_INVALID", "治疗结果编码不正确");
        }
        String reactionDetail = Strings.trimToNull(adverseReactionDetail);
        if (adverseReaction && reactionDetail == null) throw conflict(
                "TREATMENT_ADVERSE_REACTION_DETAIL_REQUIRED", "记录不良反应时必须填写具体表现和处置");
        if (!adverseReaction && reactionDetail != null) throw conflict(
                "TREATMENT_ADVERSE_REACTION_INCONSISTENT", "未发生不良反应时不能填写不良反应详情");
        this.completedAt = occurredAt; this.completedBy = actorId; this.resultCode = result;
        this.completionNote = Strings.trimToNull(note); this.adverseReaction = adverseReaction;
        this.adverseReactionDetail = reactionDetail;
        if ("COMPLETED".equals(result) && !adverseReaction) this.status = TreatmentExecutionTaskStatus.COMPLETED;
        else {
            this.status = TreatmentExecutionTaskStatus.EXCEPTION;
            this.exceptionNote = adverseReaction ? "治疗过程中记录不良反应，需继续随访处置"
                    : "治疗未正常完成：" + result;
        }
    }

    /** A historical status flag alone cannot prove successful, assessed treatment. */
    public TreatmentExecutionTaskStatus verifiedStatus() {
        if (status != TreatmentExecutionTaskStatus.COMPLETED) return status;
        boolean evidence = startedAt != null && startedBy != null && completedAt != null && completedBy != null
                && !completedAt.isBefore(startedAt)
                && java.util.Set.of("NAME_AND_IDENTIFIER", "CARD", "MANUAL").contains(
                        verificationMethod == null ? "" : verificationMethod)
                && "COMPLETED".equals(resultCode) && Boolean.FALSE.equals(adverseReaction)
                && Strings.trimToNull(adverseReactionDetail) == null;
        return evidence ? TreatmentExecutionTaskStatus.COMPLETED : TreatmentExecutionTaskStatus.EXCEPTION;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw conflict(
                "TREATMENT_TASK_REVISION_CONFLICT", "治疗任务已被其他用户更新，请刷新后重试");
    }

    private BusinessException conflict(String code, String message) {
        return new BusinessException(code, message, HttpStatus.CONFLICT);
    }
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
    public TreatmentExecutionTaskStatus status() { return status; }
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
    public Boolean adverseReaction() { return adverseReaction; }
    public String adverseReactionDetail() { return adverseReactionDetail; }
    public String exceptionNote() { return exceptionNote; }
}
