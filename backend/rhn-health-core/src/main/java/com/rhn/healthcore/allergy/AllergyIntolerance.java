package com.rhn.healthcore.allergy;

import com.rhn.healthcore.api.AllergyDirectory.AllergySnapshot;
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
@Table(name = "RHN_VIS_ALLERGY_INTOL")
class AllergyIntolerance {
    @Id @Column(name = "ID_ALLERGY_INTOL") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "ID_ALLERGEN") private Long allergenId;
    @Column(name = "SD_ASSERTION_TYPE", nullable = false) private String assertionType;
    @Column(name = "CD_CAT") private String categoryCode;
    @Column(name = "SD_CLIN_STATUS", nullable = false) private String clinicalStatus;
    @Column(name = "SD_VERIFICATION_STATUS", nullable = false) private String verificationStatus;
    @Column(name = "CD_CRITICALITY") private String criticalityCode;
    @Column(name = "SD_REACTION_SEVERITY") private String reactionSeverity;
    @Column(name = "SD_INFORMATION_SRC", nullable = false) private String informationSource;
    @Column(name = "CD_SUBSTANCE_CODE_SYS_URI") private String substanceCodeSystemUri;
    @Column(name = "CD_SUBSTANCE") private String substanceCode;
    @Column(name = "NA_SUBSTANCE") private String substanceDisplay;
    @Column(name = "DES_REACTION") private String reactionText;
    @Column(name = "DT_ONSET") private Instant onsetAt;
    @Column(name = "DT_RECORDED", nullable = false) private Instant recordedAt;
    @Column(name = "ID_PRACT_RECORDER") private Long recorderPractitionerId;
    @Column(name = "ID_USER_RECORDER", nullable = false) private Long recorderUserId;
    @Column(name = "DT_VERIFIED") private Instant verifiedAt;
    @Column(name = "ID_PRACT_VERIFIER") private Long verifierPractitionerId;
    @Column(name = "DT_INACTIVATED") private Instant inactivatedAt;
    @Column(name = "ID_USER_INACTIVATED") private Long inactivatedBy;
    @Column(name = "DES_INACTIVATION_REASON") private String inactivationReason;

    protected AllergyIntolerance() {}

    AllergyIntolerance(Long tenantId, Long residentId, RecordAllergyRequest input,
                       Long recorderUserId, Long recorderPractitionerId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = input.encounterId(); this.allergenId = input.allergenId(); this.assertionType = input.assertionType();
        this.categoryCode = input.categoryCode(); this.clinicalStatus = "ACTIVE";
        this.verificationStatus = "CONFIRMED"; this.criticalityCode = input.criticalityCode();
        this.reactionSeverity = input.reactionSeverity(); this.informationSource = input.informationSource();
        this.substanceCodeSystemUri = input.substanceCodeSystemUri(); this.substanceCode = input.substanceCode();
        this.substanceDisplay = input.substanceDisplay(); this.reactionText = input.reactionText();
        this.onsetAt = input.onsetAt(); this.recordedAt = Instant.now();
        this.recorderUserId = recorderUserId; this.recorderPractitionerId = recorderPractitionerId;
        this.verifiedAt = this.recordedAt; this.verifierPractitionerId = recorderPractitionerId;
    }

    void inactivate(long expectedRevision, String reason, Long actorId) {
        if (revision != expectedRevision) throw new BusinessException("ALLERGY_REVISION_CONFLICT",
                "过敏信息已被其他用户修改，请刷新后重试", HttpStatus.CONFLICT);
        if (!"ACTIVE".equals(clinicalStatus)) throw new BusinessException("ALLERGY_ALREADY_INACTIVE",
                "过敏信息已停用", HttpStatus.CONFLICT);
        clinicalStatus = "INACTIVE"; inactivatedAt = Instant.now(); inactivatedBy = actorId;
        inactivationReason = reason;
    }

    AllergySnapshot snapshot() {
        return new AllergySnapshot(id, allergenId, assertionType, categoryCode, criticalityCode, reactionSeverity,
                substanceCodeSystemUri, substanceCode, substanceDisplay, reactionText);
    }

    AllergyResponse response() {
        return new AllergyResponse(id, revision, residentId, encounterId, allergenId, assertionType, categoryCode,
                clinicalStatus, verificationStatus, criticalityCode, reactionSeverity, informationSource,
                substanceCodeSystemUri, substanceCode, substanceDisplay, reactionText, onsetAt, recordedAt,
                recorderPractitionerId, verifiedAt, verifierPractitionerId, inactivatedAt, inactivationReason);
    }

    Long id() { return id; } long revision() { return revision; } Long tenantId() { return tenantId; }
    Long residentId() { return residentId; } String assertionType() { return assertionType; }
    String categoryCode() { return categoryCode; } String clinicalStatus() { return clinicalStatus; }
}
