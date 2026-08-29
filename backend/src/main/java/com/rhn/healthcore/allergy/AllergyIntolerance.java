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
@Table(name = "allergy_intolerances")
class AllergyIntolerance {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id") private Long encounterId;
    @Column(name = "assertion_type", nullable = false) private String assertionType;
    @Column(name = "category_code") private String categoryCode;
    @Column(name = "clinical_status", nullable = false) private String clinicalStatus;
    @Column(name = "verification_status", nullable = false) private String verificationStatus;
    @Column(name = "criticality_code") private String criticalityCode;
    @Column(name = "reaction_severity") private String reactionSeverity;
    @Column(name = "information_source", nullable = false) private String informationSource;
    @Column(name = "substance_code_system_uri") private String substanceCodeSystemUri;
    @Column(name = "substance_code") private String substanceCode;
    @Column(name = "substance_display") private String substanceDisplay;
    @Column(name = "reaction_text") private String reactionText;
    @Column(name = "onset_at") private Instant onsetAt;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;
    @Column(name = "recorder_practitioner_id") private Long recorderPractitionerId;
    @Column(name = "recorder_user_id", nullable = false) private Long recorderUserId;
    @Column(name = "verified_at") private Instant verifiedAt;
    @Column(name = "verifier_practitioner_id") private Long verifierPractitionerId;
    @Column(name = "inactivated_at") private Instant inactivatedAt;
    @Column(name = "inactivated_by") private Long inactivatedBy;
    @Column(name = "inactivation_reason") private String inactivationReason;

    protected AllergyIntolerance() {}

    AllergyIntolerance(Long tenantId, Long residentId, RecordAllergyRequest input,
                       Long recorderUserId, Long recorderPractitionerId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = input.encounterId(); this.assertionType = input.assertionType();
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
        return new AllergySnapshot(id, assertionType, categoryCode, criticalityCode, reactionSeverity,
                substanceCodeSystemUri, substanceCode, substanceDisplay, reactionText);
    }

    AllergyResponse response() {
        return new AllergyResponse(id, revision, residentId, encounterId, assertionType, categoryCode,
                clinicalStatus, verificationStatus, criticalityCode, reactionSeverity, informationSource,
                substanceCodeSystemUri, substanceCode, substanceDisplay, reactionText, onsetAt, recordedAt,
                recorderPractitionerId, verifiedAt, verifierPractitionerId, inactivatedAt, inactivationReason);
    }

    Long id() { return id; } long revision() { return revision; } Long tenantId() { return tenantId; }
    Long residentId() { return residentId; } String assertionType() { return assertionType; }
    String categoryCode() { return categoryCode; } String clinicalStatus() { return clinicalStatus; }
}
