package com.rhn.inpatient.domain;

import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_INP_SHIFT_HANDOFF_SIGN")
public class InpatientShiftHandoffSignature {
    @Id @Column(name = "ID_INP_SHIFT_HANDOFF_SIGN") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INP_SHIFT_HANDOFF", nullable = false) private Long handoffId;
    @Column(name = "SD_STAGE", nullable = false) private String stage;
    @Column(name = "SD_SIGN_MEANING", nullable = false) private String signatureMeaning;
    @Column(name = "ID_SIGNER_SUBJECT", nullable = false) private Long signerSubjectId;
    @Column(name = "ID_SIGNER_PRACT") private Long signerPractitionerId;
    @Column(name = "NA_SIGNER", nullable = false) private String signerName;
    @Column(name = "DT_SIGNED", nullable = false) private Instant signedAt;
    @Column(name = "ID_CRYPTO_EVID_SIGN", nullable = false) private Long signatureEvidenceId;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "HASH_REQ", nullable = false) private String requestHash;

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
