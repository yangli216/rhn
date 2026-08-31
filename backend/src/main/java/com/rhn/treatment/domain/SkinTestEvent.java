package com.rhn.treatment.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;

@Entity
@Table(name = "skin_test_events")
public class SkinTestEvent {
    private static final Set<String> METHODS = Set.of("INTRADERMAL", "PRICK", "OTHER");
    private static final Set<String> RESULTS = Set.of("NEGATIVE", "POSITIVE", "UNCERTAIN", "INVALID");

    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "medication_request_id", nullable = false) private Long medicationRequestId;
    @Column(name = "medication_id", nullable = false) private Long medicationId;
    @Column(name = "attempt_no", nullable = false) private int attemptNo;
    @Column(name = "medication_code_snapshot", nullable = false) private String medicationCodeSnapshot;
    @Column(name = "medication_name_snapshot", nullable = false) private String medicationNameSnapshot;
    @Column(nullable = false) private String status;
    @Column(name = "test_method", nullable = false) private String testMethod;
    @Column(name = "original_solution", nullable = false) private boolean originalSolution;
    @Column(name = "solution_catalog_item_id") private Long solutionCatalogItemId;
    @Column(name = "solution_name_snapshot", length = 300) private String solutionNameSnapshot;
    @Column(name = "stock_lot_id") private Long stockLotId;
    @Column(name = "lot_no_snapshot", length = 128) private String lotNoSnapshot;
    @Column(precision = 28, scale = 8) private BigDecimal concentration;
    @Column(name = "concentration_unit", length = 64) private String concentrationUnit;
    @Column(name = "body_site", length = 128) private String bodySite;
    @Column(name = "verification_method", nullable = false) private String verificationMethod;
    @Column(name = "observation_minutes", nullable = false) private int observationMinutes;
    @Column(name = "started_at", nullable = false) private Instant startedAt;
    @Column(name = "completed_at") private Instant completedAt;
    private String result;
    @Column(name = "wheal_diameter_mm", precision = 8, scale = 2) private BigDecimal whealDiameterMm;
    @Column(name = "flare_diameter_mm", precision = 8, scale = 2) private BigDecimal flareDiameterMm;
    @Column(name = "reaction_description", length = 1000) private String reactionDescription;
    @Column(name = "early_read_reason", length = 1000) private String earlyReadReason;
    @Column(name = "performed_by_user_id", nullable = false) private Long performedByUserId;
    @Column(name = "performed_by_practitioner_id") private Long performedByPractitionerId;
    @Column(name = "read_by_user_id") private Long readByUserId;
    @Column(name = "read_by_practitioner_id") private Long readByPractitionerId;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancelled_by") private Long cancelledBy;
    @Column(name = "cancel_reason", length = 1000) private String cancelReason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected SkinTestEvent() {}

    public SkinTestEvent(Long tenantId, Long organizationId, Long departmentId, Long residentId,
                         Long encounterId, Long medicationRequestId, Long medicationId, int attemptNo,
                         String medicationCode, String medicationName, String testMethod,
                         boolean originalSolution, Long solutionCatalogItemId, String solutionName,
                         Long stockLotId, String lotNo, BigDecimal concentration, String concentrationUnit,
                         String bodySite, String verificationMethod, int observationMinutes,
                         Long actorId, Long practitionerId,
                         Instant startedAt) {
        String method = upper(testMethod);
        if (!METHODS.contains(method)) throw badRequest("SKIN_TEST_METHOD_INVALID", "皮试方式不正确");
        if (observationMinutes < 1 || observationMinutes > 120) {
            throw badRequest("SKIN_TEST_OBSERVATION_MINUTES_INVALID", "观察时长应为 1 至 120 分钟");
        }
        requirePair(concentration, concentrationUnit, "SKIN_TEST_CONCENTRATION_INVALID", "浓度值和单位必须同时填写");
        if (concentration != null && concentration.signum() <= 0) {
            throw badRequest("SKIN_TEST_CONCENTRATION_INVALID", "皮试液浓度必须大于 0");
        }
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.residentId = residentId; this.encounterId = encounterId;
        this.medicationRequestId = medicationRequestId; this.medicationId = medicationId;
        this.attemptNo = attemptNo; this.medicationCodeSnapshot = medicationCode;
        this.medicationNameSnapshot = medicationName; this.status = "IN_PROGRESS"; this.testMethod = method;
        this.originalSolution = originalSolution; this.solutionCatalogItemId = solutionCatalogItemId;
        this.solutionNameSnapshot = clean(solutionName); this.stockLotId = stockLotId;
        this.lotNoSnapshot = clean(lotNo); this.concentration = concentration;
        this.concentrationUnit = clean(concentrationUnit); this.bodySite = clean(bodySite);
        this.verificationMethod = clean(verificationMethod) == null
                ? "NAME_AND_IDENTIFIER" : clean(verificationMethod);
        this.observationMinutes = observationMinutes; this.performedByUserId = actorId;
        this.performedByPractitionerId = practitionerId; this.startedAt = startedAt; this.createdAt = startedAt;
    }

    public void complete(long expectedRevision, String result, BigDecimal whealDiameterMm,
                         BigDecimal flareDiameterMm, String reactionDescription, String earlyReadReason,
                         Long actorId, Long practitionerId, Instant occurredAt) {
        requireRevision(expectedRevision);
        if (!"IN_PROGRESS".equals(status)) throw conflict(
                "SKIN_TEST_COMPLETE_STATE_INVALID", "只有进行中的皮试可以判读结果");
        String outcome = upper(result);
        if (!RESULTS.contains(outcome)) throw badRequest("SKIN_TEST_RESULT_INVALID", "皮试结果不正确");
        requireNonNegative(whealDiameterMm, "SKIN_TEST_WHEAL_INVALID", "风团直径不能小于 0");
        requireNonNegative(flareDiameterMm, "SKIN_TEST_FLARE_INVALID", "红晕直径不能小于 0");
        String reaction = clean(reactionDescription);
        if ("POSITIVE".equals(outcome) && reaction == null) {
            throw badRequest("SKIN_TEST_POSITIVE_REACTION_REQUIRED", "皮试阳性时必须记录局部或全身反应");
        }
        String earlyReason = clean(earlyReadReason);
        boolean observationNotFinished = occurredAt.isBefore(
                startedAt.plus(Duration.ofMinutes(observationMinutes)));
        if (observationNotFinished && "NEGATIVE".equals(outcome)) {
            throw conflict("SKIN_TEST_NEGATIVE_OBSERVATION_NOT_FINISHED",
                    "皮试阴性必须完成规定观察时间后才能判读");
        }
        if (observationNotFinished && earlyReason == null) {
            throw conflict("SKIN_TEST_OBSERVATION_NOT_FINISHED", "尚未达到规定观察时间；如需提前判读必须填写临床原因");
        }
        this.status = "COMPLETED"; this.completedAt = occurredAt; this.result = outcome;
        this.whealDiameterMm = whealDiameterMm; this.flareDiameterMm = flareDiameterMm;
        this.reactionDescription = reaction; this.earlyReadReason = earlyReason;
        this.readByUserId = actorId; this.readByPractitionerId = practitionerId;
    }

    public void cancel(long expectedRevision, String reason, Long actorId, Instant occurredAt) {
        requireRevision(expectedRevision);
        if (!"IN_PROGRESS".equals(status)) throw conflict(
                "SKIN_TEST_CANCEL_STATE_INVALID", "只有进行中的皮试可以取消");
        String value = clean(reason);
        if (value == null) throw badRequest("SKIN_TEST_CANCEL_REASON_REQUIRED", "取消皮试必须填写原因");
        this.status = "CANCELLED"; this.cancelledAt = occurredAt; this.cancelledBy = actorId;
        this.cancelReason = value;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw conflict(
                "SKIN_TEST_REVISION_CONFLICT", "皮试记录已被其他用户更新，请刷新后重试");
    }
    private void requirePair(Object left, Object right, String code, String message) {
        if ((left == null) != (clean(right == null ? null : right.toString()) == null)) throw badRequest(code, message);
    }
    private void requireNonNegative(BigDecimal value, String code, String message) {
        if (value != null && value.signum() < 0) throw badRequest(code, message);
    }
    private BusinessException badRequest(String code, String message) {
        return new BusinessException(code, message, HttpStatus.BAD_REQUEST);
    }
    private BusinessException conflict(String code, String message) {
        return new BusinessException(code, message, HttpStatus.CONFLICT);
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(); }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long medicationRequestId() { return medicationRequestId; }
    public Long medicationId() { return medicationId; }
    public int attemptNo() { return attemptNo; }
    public String medicationCodeSnapshot() { return medicationCodeSnapshot; }
    public String medicationNameSnapshot() { return medicationNameSnapshot; }
    public String status() { return status; }
    public String testMethod() { return testMethod; }
    public boolean originalSolution() { return originalSolution; }
    public Long solutionCatalogItemId() { return solutionCatalogItemId; }
    public String solutionNameSnapshot() { return solutionNameSnapshot; }
    public Long stockLotId() { return stockLotId; }
    public String lotNoSnapshot() { return lotNoSnapshot; }
    public BigDecimal concentration() { return concentration; }
    public String concentrationUnit() { return concentrationUnit; }
    public String bodySite() { return bodySite; }
    public String verificationMethod() { return verificationMethod; }
    public int observationMinutes() { return observationMinutes; }
    public Instant startedAt() { return startedAt; }
    public Instant completedAt() { return completedAt; }
    public String result() { return result; }
    public BigDecimal whealDiameterMm() { return whealDiameterMm; }
    public BigDecimal flareDiameterMm() { return flareDiameterMm; }
    public String reactionDescription() { return reactionDescription; }
    public String earlyReadReason() { return earlyReadReason; }
    public Long performedByUserId() { return performedByUserId; }
    public Long performedByPractitionerId() { return performedByPractitionerId; }
    public Long readByUserId() { return readByUserId; }
    public Long readByPractitionerId() { return readByPractitionerId; }
    public Instant cancelledAt() { return cancelledAt; }
}
