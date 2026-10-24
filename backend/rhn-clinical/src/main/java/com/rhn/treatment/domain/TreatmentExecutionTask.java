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
import java.util.List;

@Entity
@Table(name = "RHN_EX_TREAT_EXEC_TASK")
public class TreatmentExecutionTask {

    @Id @Column(name = "ID_TREAT_EXEC_TASK") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_CARE_REQ_SRC_GRP", nullable = false) private Long sourceGroupId;
    @Column(name = "CD_TASK_NO") private String taskNo;
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
                                  String taskType, Instant createdAt, String businessNumber) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.residentId = residentId; this.encounterId = encounterId;
        this.sourceGroupId = sourceGroupId; this.taskNo = businessNumber; this.taskType = taskType; this.status = TreatmentExecutionTaskStatus.WAITING_SETTLEMENT;
        this.createdAt = createdAt;
    }

    public static final String SKIN_TEST_MARKER = "[SKIN_TEST]";
    /** 处置说明写入 DES_EXCEPT_NOTE（varchar 1000），与该字段上限一致。 */
    public static final int RESOLVE_NOTE_MAX_LENGTH = 1000;

    /** 处置前的异常事实，供处置事件留痕；重新执行会清除这些当前轮字段。 */
    public record ExceptionSnapshot(String status, String resultCode, Boolean adverseReaction,
                                    String adverseReactionDetail, String completionNote, String exceptionNote,
                                    Instant completedAt, Long completedBy) {}

    public void synchronize(boolean anyActive, boolean allSettled, boolean allFulfilled,
                            boolean allSkinTestsPassed, boolean skinTestPositive, String gateNote) {
        if (status.terminal()) return;
        if (!anyActive) { status = TreatmentExecutionTaskStatus.CANCELLED; return; }
        if (status == TreatmentExecutionTaskStatus.IN_PROGRESS) {
            if (!allSettled || !allFulfilled) {
                status = TreatmentExecutionTaskStatus.EXCEPTION;
                exceptionNote = gateNote;
            }
            return;
        }
        if (status == TreatmentExecutionTaskStatus.EXCEPTION && !skinTestException()) return;
        if (skinTestPositive) {
            status = TreatmentExecutionTaskStatus.EXCEPTION;
            exceptionNote = SKIN_TEST_MARKER + " 皮试阳性，当前用药禁止执行，请医生调整医嘱";
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

    /** 皮试阳性类异常只能由医生调整医嘱，不进入处置闭环。 */
    public boolean skinTestException() {
        return exceptionNote != null && exceptionNote.startsWith(SKIN_TEST_MARKER);
    }

    /** 已开始过执行（含执行后异常/已处置/重新执行前）；退费与撤销医嘱保护以此为准。 */
    public boolean hasStarted() {
        return status != TreatmentExecutionTaskStatus.CANCELLED
                && (startedAt != null || status == TreatmentExecutionTaskStatus.IN_PROGRESS
                || status == TreatmentExecutionTaskStatus.COMPLETED);
    }

    /** 当前可用的处置方式；仅异常任务有值。已记录不良反应的异常和皮试阳性异常不能重新执行。 */
    public List<String> allowedResolutions() {
        if (status != TreatmentExecutionTaskStatus.EXCEPTION || skinTestException()) return List.of();
        return Boolean.TRUE.equals(adverseReaction) ? List.of("CLOSE") : List.of("REQUEUE", "CLOSE");
    }

    /**
     * 处置异常任务。REQUEUE 把任务放回待执行链路（保留 startedAt，清除当前轮结果），调用方必须随后用门禁事实
     * 执行 synchronize 推导真实状态；CLOSE 直接进入终态 CLOSED，completedAt/completedBy 记录处置时间与处置人，
     * 处置说明写入 exceptionNote，处置前的结果由事件留痕。
     */
    public ExceptionSnapshot resolve(long expectedRevision, String resolutionCode, String note,
                                     Long actorId, Instant occurredAt) {
        requireRevision(expectedRevision);
        if (status != TreatmentExecutionTaskStatus.EXCEPTION) throw conflict(
                "TREATMENT_RESOLVE_STATE_INVALID", "只有异常状态的治疗任务可以处置");
        String resolution = Strings.trimToNull(resolutionCode);
        if (resolution == null || !List.of("REQUEUE", "CLOSE").contains(resolution.toUpperCase(java.util.Locale.ROOT))) {
            throw conflict("TREATMENT_RESOLUTION_INVALID", "处置方式不正确");
        }
        resolution = resolution.toUpperCase(java.util.Locale.ROOT);
        String text = Strings.trimToNull(note);
        if (text == null) throw conflict("TREATMENT_RESOLVE_NOTE_REQUIRED", "处置必须填写处置说明");
        if (text.length() > RESOLVE_NOTE_MAX_LENGTH) throw conflict(
                "TREATMENT_RESOLVE_NOTE_TOO_LONG", "处置说明不能超过 " + RESOLVE_NOTE_MAX_LENGTH + " 字");
        if (skinTestException()) throw conflict(
                "REQUEUE".equals(resolution) ? "TREATMENT_REQUEUE_NOT_ALLOWED" : "TREATMENT_CLOSE_NOT_ALLOWED",
                "皮试阳性异常不能在此处置，请医生调整医嘱");
        if ("REQUEUE".equals(resolution) && Boolean.TRUE.equals(adverseReaction)) throw conflict(
                "TREATMENT_REQUEUE_NOT_ALLOWED", "已记录不良反应的异常不能重新执行，请关闭处置");
        ExceptionSnapshot previous = new ExceptionSnapshot(status.name(), resultCode, adverseReaction,
                adverseReactionDetail, completionNote, exceptionNote, completedAt, completedBy);
        if ("REQUEUE".equals(resolution)) {
            this.status = TreatmentExecutionTaskStatus.WAITING_SETTLEMENT;
            this.completedAt = null; this.completedBy = null; this.resultCode = null; this.completionNote = null;
            this.adverseReaction = null; this.adverseReactionDetail = null; this.exceptionNote = null;
        } else {
            this.status = TreatmentExecutionTaskStatus.CLOSED;
            this.completedAt = occurredAt; this.completedBy = actorId; this.exceptionNote = text;
        }
        return previous;
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
