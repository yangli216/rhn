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
@Table(name = "RHN_EX_SKIN_TEST_EVT")
public class SkinTestEvent {
    private static final Set<String> METHODS = Set.of("INTRADERMAL", "PRICK", "OTHER");
    private static final Set<String> RESULTS = Set.of("NEGATIVE", "POSITIVE", "UNCERTAIN", "INVALID");

    @Id @Column(name = "ID_SKIN_TEST_EVT") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_CARE_REQ_MED", nullable = false) private Long medicationRequestId;
    @Column(name = "ID_MED", nullable = false) private Long medicationId;
    @Column(name = "SN_ATTEMPT", nullable = false) private int attemptNo;
    @Column(name = "CD_MED_SNAP", nullable = false) private String medicationCodeSnapshot;
    @Column(name = "NA_MED_SNAP", nullable = false) private String medicationNameSnapshot;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SD_TEST_METHOD", nullable = false) private String testMethod;
    @Column(name = "FG_ORIGINAL_SOLUTION", nullable = false) private boolean originalSolution;
    @Column(name = "ID_CATALOG_ITEM_SOLUTION") private Long solutionCatalogItemId;
    @Column(name = "NA_SOLUTION_SNAP", length = 300) private String solutionNameSnapshot;
    @Column(name = "ID_STOCK_LOT") private Long stockLotId;
    @Column(name = "CD_LOT_SNAP", length = 128) private String lotNoSnapshot;
    @Column(name = "CONCENTRATION", precision = 28, scale = 8) private BigDecimal concentration;
    @Column(name = "CONCENTRATION_UNIT", length = 64) private String concentrationUnit;
    @Column(name = "BODY_SITE", length = 128) private String bodySite;
    @Column(name = "SD_VERIFICATION_METHOD", nullable = false) private String verificationMethod;
    @Column(name = "QTY_OBS_MINUTES", nullable = false) private int observationMinutes;
    @Column(name = "DT_STARTED", nullable = false) private Instant startedAt;
    @Column(name = "DT_COMPLETED") private Instant completedAt;
    @Column(name = "SD_RESULT") private String result;
    @Column(name = "QTY_WHEAL_DIAMETER_MM", precision = 8, scale = 2) private BigDecimal whealDiameterMm;
    @Column(name = "QTY_FLARE_DIAMETER_MM", precision = 8, scale = 2) private BigDecimal flareDiameterMm;
    @Column(name = "DES_REACTION_DESCRIPTION", length = 1000) private String reactionDescription;
    @Column(name = "DES_EARLY_READ_REASON", length = 1000) private String earlyReadReason;
    @Column(name = "ID_USER_PERFORMED", nullable = false) private Long performedByUserId;
    @Column(name = "ID_PRACT_PERFORMED") private Long performedByPractitionerId;
    @Column(name = "ID_USER_READ") private Long readByUserId;
    @Column(name = "ID_PRACT_READ") private Long readByPractitionerId;
    @Column(name = "DT_CANCELLED") private Instant cancelledAt;
    @Column(name = "ID_USER_CANCELLED") private Long cancelledBy;
    @Column(name = "DES_CANCEL_REASON", length = 1000) private String cancelReason;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

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
