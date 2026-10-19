package com.rhn.platform.cryptography.api;

/**
 * Reviewed protection policies. {@code certifiedServiceRequired} sets the minimum provider assurance
 * (ADR-008): only policies that still demand a certified crypto service reject the software signer.
 * {@code externallySigned} policies are written by the personal CA signing flow, never by
 * {@link CryptographicEvidenceService#protect}.
 */
public enum ProtectionProfile {
    CLINICAL_DOCUMENT_CONTENT(ProtectionPurpose.INTEGRITY, SignerBinding.SYSTEM, false, false, false),
    /** Historical only: retained so existing evidence keeps verifying; new signing uses attestation. */
    CLINICAL_DOCUMENT_SIGNATURE(ProtectionPurpose.NON_REPUDIATION, SignerBinding.ACTOR, true, true, false),
    CLINICAL_ACTION_ATTESTATION(ProtectionPurpose.ATTESTATION, SignerBinding.SYSTEM, false, false, false),
    PERSONAL_CA_SIGNATURE(ProtectionPurpose.NON_REPUDIATION, SignerBinding.ACTOR, true, false, true),
    DOMAIN_EVENT(ProtectionPurpose.INTEGRITY, SignerBinding.SYSTEM, false, false, false),
    AUDIT_EVENT(ProtectionPurpose.INTEGRITY, SignerBinding.SYSTEM, true, false, false);

    private final ProtectionPurpose purpose;
    private final SignerBinding signerBinding;
    private final boolean trustedTimestampRequired;
    private final boolean certifiedServiceRequired;
    private final boolean externallySigned;

    ProtectionProfile(ProtectionPurpose purpose, SignerBinding signerBinding, boolean trustedTimestampRequired,
                      boolean certifiedServiceRequired, boolean externallySigned) {
        this.purpose = purpose;
        this.signerBinding = signerBinding;
        this.trustedTimestampRequired = trustedTimestampRequired;
        this.certifiedServiceRequired = certifiedServiceRequired;
        this.externallySigned = externallySigned;
    }

    public ProtectionPurpose purpose() { return purpose; }
    public SignerBinding signerBinding() { return signerBinding; }
    public boolean trustedTimestampRequired() { return trustedTimestampRequired; }
    public boolean certifiedServiceRequired() { return certifiedServiceRequired; }
    public boolean externallySigned() { return externallySigned; }
}
