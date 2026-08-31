package com.rhn.inpatient.domain;

import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "inpatient_shift_handoff_signatures")
public class InpatientShiftHandoffSignature {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "handoff_id", nullable = false) private Long handoffId;
    @Column(nullable = false) private String stage;
    @Column(name = "signature_meaning", nullable = false) private String signatureMeaning;
    @Column(name = "signer_subject_id", nullable = false) private Long signerSubjectId;
    @Column(name = "signer_practitioner_id") private Long signerPractitionerId;
    @Column(name = "signer_name", nullable = false) private String signerName;
    @Column(name = "signed_at", nullable = false) private Instant signedAt;
    @Column(name = "signature_evidence_id", nullable = false) private Long signatureEvidenceId;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "request_hash", nullable = false) private String requestHash;

    protected InpatientShiftHandoffSignature() {
    }

    public InpatientShiftHandoffSignature(Long tenantId, Long handoffId, String stage,
                                          String signatureMeaning, Long signerSubjectId,
                                          Long signerPractitionerId, String signerName,
                                          String commandCode, String requestHash,
                                          EvidenceReceipt evidence) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.handoffId = handoffId;
        this.stage = stage;
        this.signatureMeaning = signatureMeaning;
        if (evidence.signerSubjectId() != null && !evidence.signerSubjectId().equals(signerSubjectId)) {
            throw new IllegalArgumentException("Signature evidence actor does not match current subject");
        }
        this.signerSubjectId = signerSubjectId;
        this.signerPractitionerId = signerPractitionerId;
        this.signerName = signerName;
        this.signedAt = evidence.signedAt();
        this.signatureEvidenceId = evidence.evidenceId();
        this.commandCode = commandCode;
        this.requestHash = requestHash;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long handoffId() { return handoffId; }
    public String stage() { return stage; }
    public String signatureMeaning() { return signatureMeaning; }
    public Long signerSubjectId() { return signerSubjectId; }
    public Long signerPractitionerId() { return signerPractitionerId; }
    public String signerName() { return signerName; }
    public Instant signedAt() { return signedAt; }
    public Long signatureEvidenceId() { return signatureEvidenceId; }
    public String commandCode() { return commandCode; }
    public String requestHash() { return requestHash; }
}
