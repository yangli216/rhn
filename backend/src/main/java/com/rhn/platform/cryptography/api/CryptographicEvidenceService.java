package com.rhn.platform.cryptography.api;


public interface CryptographicEvidenceService {
    EvidenceReceipt protect(ProtectionRequest request);

    EvidenceVerification verify(Long evidenceId, byte[] currentContent);

    void requireValid(Long evidenceId, byte[] currentContent);
}
