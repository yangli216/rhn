package com.rhn.healthcore.condition;

import com.rhn.healthcore.api.ConditionDirectory.ConditionSnapshot;
import com.rhn.healthcore.api.ConditionDirectory.RecordSuspectedCondition;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "conditions")
class Condition {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "term_id") private Long termId;
    @Column(name = "condition_key", nullable = false) private String conditionKey;
    @Column(name = "code_system_uri", nullable = false) private String codeSystemUri;
    @Column(name = "code_release") private String codeRelease;
    @Column(name = "condition_code", nullable = false) private String conditionCode;
    @Column(name = "condition_name", nullable = false) private String conditionName;
    @Column(name = "clinical_status", nullable = false) private String clinicalStatus;
    @Column(name = "verification_status", nullable = false) private String verificationStatus;
    @Column(name = "onset_at") private Instant onsetAt;
    @Column(name = "abatement_at") private Instant abatementAt;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;
    @Column(name = "recorder_practitioner_id", nullable = false) private Long recorderPractitionerId;
    @Column(name = "recorder_user_id", nullable = false) private Long recorderUserId;

    protected Condition() {
    }

    Condition(RecordSuspectedCondition command) {
        this.id = GlobalIds.next();
        this.tenantId = command.tenantId();
        this.residentId = command.residentId();
        this.termId = command.termId();
        this.conditionKey = command.conditionKey();
        this.codeSystemUri = command.codeSystemUri();
        this.codeRelease = command.codeRelease();
        this.conditionCode = command.conditionCode();
        this.conditionName = command.conditionName();
        this.clinicalStatus = "ACTIVE";
        this.verificationStatus = "SUSPECTED";
        this.onsetAt = command.onsetAt();
        this.recordedAt = command.recordedAt();
        this.recorderPractitionerId = command.recorderPractitionerId();
        this.recorderUserId = command.recorderUserId();
    }

    ConditionSnapshot snapshot() {
        return new ConditionSnapshot(id, revision, residentId, termId, conditionCode, conditionName,
                clinicalStatus, verificationStatus, recordedAt);
    }
}
