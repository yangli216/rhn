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
@Table(name = "RHN_HPL_COND")
class Condition {
    @Id @Column(name = "ID_COND") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_CONCEPT_TERM") private Long termId;
    @Column(name = "CD_COND_KEY", nullable = false) private String conditionKey;
    @Column(name = "CODE_SYSTEM_URI", nullable = false) private String codeSystemUri;
    @Column(name = "CD_CODE_RELEASE") private String codeRelease;
    @Column(name = "CD_COND", nullable = false) private String conditionCode;
    @Column(name = "NA_COND", nullable = false) private String conditionName;
    @Column(name = "SD_CLIN_STATUS", nullable = false) private String clinicalStatus;
    @Column(name = "SD_VRFCTN_STATUS", nullable = false) private String verificationStatus;
    @Column(name = "DT_ONSET") private Instant onsetAt;
    @Column(name = "DT_ABATE") private Instant abatementAt;
    @Column(name = "DT_RECDD", nullable = false) private Instant recordedAt;
    @Column(name = "ID_PRACT_RECDR", nullable = false) private Long recorderPractitionerId;
    @Column(name = "ID_USER_RECDR", nullable = false) private Long recorderUserId;

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
