package com.rhn.platform.cryptography.api;

public enum ProtectionProfile {
    CLINICAL_DOCUMENT_CONTENT(ProtectionPurpose.INTEGRITY, SignerBinding.SYSTEM, false),
    CLINICAL_DOCUMENT_SIGNATURE(ProtectionPurpose.NON_REPUDIATION, SignerBinding.ACTOR, true),
    DOMAIN_EVENT(ProtectionPurpose.INTEGRITY, SignerBinding.SYSTEM, false),
    AUDIT_EVENT(ProtectionPurpose.INTEGRITY, SignerBinding.SYSTEM, true);

    private final ProtectionPurpose purpose;
    private final SignerBinding signerBinding;
    private final boolean trustedTimestampRequired;

    ProtectionProfile(ProtectionPurpose purpose, SignerBinding signerBinding,
                      boolean trustedTimestampRequired) {
        this.purpose = purpose;
        this.signerBinding = signerBinding;
        this.trustedTimestampRequired = trustedTimestampRequired;
    }

    public ProtectionPurpose purpose() { return purpose; }
    public SignerBinding signerBinding() { return signerBinding; }
    public boolean trustedTimestampRequired() { return trustedTimestampRequired; }
}
