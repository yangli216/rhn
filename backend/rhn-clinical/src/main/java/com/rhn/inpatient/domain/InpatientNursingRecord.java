package com.rhn.inpatient.domain;

import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_INP_NURS_RECORD")
public class InpatientNursingRecord {
    @Id @Column(name = "ID_INP_NURS_RECORD") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_CARE_EPISODE", nullable = false) private Long episodeId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;
    @Column(name = "SD_RECORD_TYPE", nullable = false) private String recordType;
    @Lob @Column(name = "JSON_CONTENT", nullable = false) private String contentJson;
    @Lob @Column(name = "JSON_OBS_SUM") private String observationSummaryJson;
    @Lob @Column(name = "JSON_ASSMT") private String assessmentJson;
    @Column(name = "JSON_CONTENT_SCHEMA", nullable = false) private String contentSchema;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "HASH_REQ", nullable = false) private String requestHash;
    @Column(name = "ID_RECDD_BY_SUBJECT", nullable = false) private Long recordedBySubjectId;
    @Column(name = "ID_RECDD_BY_PRACT") private Long recordedByPractitionerId;
    @Column(name = "NA_RECDR", nullable = false) private String recorderName;
    @Column(name = "DT_RECDD", nullable = false) private Instant recordedAt;
    @Column(name = "CONTENT_DIGEST_ALGO", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT", nullable = false) private String contentDigest;
    @Column(name = "ID_CRYPTO_EVID_INTGR", nullable = false) private Long integrityEvidenceId;

    protected InpatientNursingRecord() {
    }

    public InpatientNursingRecord(Long tenantId, Long organizationId, Long departmentId,
                                  Long episodeId, Long encounterId, Long residentId,
                                  Instant occurredAt, String recordType, String contentJson,
                                  String observationSummaryJson, String assessmentJson, String contentSchema,
                                  String commandCode, String requestHash,
                                  Long recordedBySubjectId, Long recordedByPractitionerId,
                                  String recorderName) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.episodeId = episodeId;
        this.encounterId = encounterId;
        this.residentId = residentId;
        this.occurredAt = occurredAt;
        this.recordType = recordType;
        this.contentJson = contentJson;
        this.observationSummaryJson = observationSummaryJson;
        this.assessmentJson = assessmentJson;
        this.contentSchema = contentSchema;
        this.commandCode = commandCode;
        this.requestHash = requestHash;
        this.recordedBySubjectId = recordedBySubjectId;
        this.recordedByPractitionerId = recordedByPractitionerId;
        this.recorderName = recorderName;
        this.recordedAt = Instant.now();
    }

    public void protect(EvidenceReceipt evidence) {
        if (integrityEvidenceId != null) throw new IllegalStateException("ALREADY_PROTECTED");
        this.contentDigestAlgorithm = evidence.contentDigestAlgorithm();
        this.contentDigest = evidence.contentDigest();
        this.integrityEvidenceId = evidence.evidenceId();
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long episodeId() { return episodeId; }
    public Long encounterId() { return encounterId; }
    public Long residentId() { return residentId; }
    public Instant occurredAt() { return occurredAt; }
    public String recordType() { return recordType; }
    public String contentJson() { return contentJson; }
    public String observationSummaryJson() { return observationSummaryJson; }
    public String assessmentJson() { return assessmentJson; }
    public String contentSchema() { return contentSchema; }
    public String commandCode() { return commandCode; }
    public String requestHash() { return requestHash; }
    public Long recordedBySubjectId() { return recordedBySubjectId; }
    public Long recordedByPractitionerId() { return recordedByPractitionerId; }
    public String recorderName() { return recorderName; }
    public Instant recordedAt() { return recordedAt; }
    public String contentDigestAlgorithm() { return contentDigestAlgorithm; }
    public String contentDigest() { return contentDigest; }
    public Long integrityEvidenceId() { return integrityEvidenceId; }
}
