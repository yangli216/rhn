package com.rhn.platform.cryptography.api;

import java.util.Collection;
import java.util.List;

/**
 * Optional personal CA signatures over attestation evidence (ADR-008). Nothing here is a precondition
 * for a business flow: {@link #request} returns {@code NOT_APPLICABLE} instead of failing when CA signing
 * is disabled or the signer is not enrolled, and vendor calls happen after the caller's transaction commits.
 */
public interface PersonalSignatureService {
    /** Safe to call inside a business transaction; only persists a pending order. */
    PersonalSignatureViews.SignatureStatus request(PersonalSignatureViews.SignatureRequest request);

    PersonalSignatureViews.SignatureStatus status(Long orderId);

    /** Latest order per attestation evidence for the current tenant; attestations without orders are omitted. */
    List<PersonalSignatureViews.SignatureStatus> forAttestations(Collection<Long> attestationEvidenceIds);

    PersonalSignatureViews.ClientSigningMaterial clientMaterial(Long orderId);

    PersonalSignatureViews.SignatureStatus submitClientSignature(Long orderId,
                                                               PersonalSignatureViews.ClientSignature signature);

    PersonalSignatureViews.SignatureStatus cancel(Long orderId);

    EvidenceVerification verify(Long orderId);

    PersonalSignatureViews.SigningCapability capability();
}
