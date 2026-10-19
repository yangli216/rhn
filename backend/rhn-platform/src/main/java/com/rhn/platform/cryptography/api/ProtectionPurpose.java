package com.rhn.platform.cryptography.api;

public enum ProtectionPurpose {
    INTEGRITY,
    /** System-signed record of who performed a business action and with what meaning (ADR-008). */
    ATTESTATION,
    NON_REPUDIATION
}
