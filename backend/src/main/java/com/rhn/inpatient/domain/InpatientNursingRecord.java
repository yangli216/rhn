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
@Table(name = "inpatient_nursing_records")
public class InpatientNursingRecord {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "episode_id", nullable = false) private Long episodeId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "record_type", nullable = false) private String recordType;
    @Lob @Column(name = "content_json", nullable = false) private String contentJson;
    @Lob @Column(name = "observation_summary_json") private String observationSummaryJson;
    @Lob @Column(name = "assessment_json") private String assessmentJson;
    @Column(name = "content_schema", nullable = false) private String contentSchema;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "request_hash", nullable = false) private String requestHash;
    @Column(name = "recorded_by_subject_id", nullable = false) private Long recordedBySubjectId;
    @Column(name = "recorded_by_practitioner_id") private Long recordedByPractitionerId;
    @Column(name = "recorder_name", nullable = false) private String recorderName;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;
    @Column(name = "content_digest_algorithm", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "content_digest", nullable = false) private String contentDigest;
    @Column(name = "integrity_evidence_id", nullable = false) private Long integrityEvidenceId;

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
