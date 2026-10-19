package com.rhn.platform.cryptography.api;

import java.time.Instant;
import java.util.List;
import java.util.Set;

public final class PersonalSignatureViews {
    /** Status value returned when no order was created because CA signing does not apply. */
    public static final String NOT_APPLICABLE = "NOT_APPLICABLE";

    private PersonalSignatureViews() {
    }

    /**
     * @param mode           null selects the vendor default
     * @param subject        short label shown to the signer, without diagnoses
     * @param patientDisplay already minimized patient label (for example a masked name), or null
     */
    public record SignatureRequest(Long attestationEvidenceId, String sceneCode, SigningMode mode, String subject,
                                   String patientDisplay) {}

    /**
     * {@code status} is a signing order status or {@link #NOT_APPLICABLE}; {@code reason} explains a
     * not-applicable result. Signer fields are present once the signature is verified.
     */
    public record SignatureStatus(Long orderId, Long attestationEvidenceId, String status, String reason,
                                  SigningMode mode, String vendorCode, String claimContent, Instant expiresAt,
                                  Long evidenceId, String signerName, String certificateIssuer,
                                  String certificateSerial, Instant signedAt, boolean trustedTimestamp,
                                  String errorCode, String errorMessage) {
        public static SignatureStatus notApplicable(Long attestationEvidenceId, String reason) {
            return new SignatureStatus(null, attestationEvidenceId, NOT_APPLICABLE, reason, null, null, null, null,
                    null, null, null, null, null, false, null, null);
        }
    }

    /**
     * Bytes a UKey must sign (SM3withSM2 over {@code toBeSigned}); {@code allowedCertificateFingerprints}
     * lets the browser driver pre-select the signer's bound certificate.
     */
    public record ClientSigningMaterial(Long orderId, String toBeSigned, String digestAlgorithm, String digest,
                                        List<String> allowedCertificateFingerprints, Instant expiresAt) {}

    /** Base64 DER signature value and signing certificate returned by the UKey middleware. */
    public record ClientSignature(String signatureValue, String certificate) {}

    public record SigningCapability(boolean enabled, String vendorCode, Set<SigningMode> modes,
                                    List<SignerView> signers) {}

    public record SignerView(Long id, Long userId, Long practitionerId, String vendorCode, String externalSignerId,
                             String medium, String status, String certificateFingerprint,
                             String certificateSerial, String certificateIssuer, String certificateSubject,
                             Instant certificateNotBefore, Instant certificateNotAfter, Instant boundAt,
                             long revision) {}

    /**
     * Administrative binding of an account to a vendor signer identity. {@code certificate} is Base64
     * DER and must chain to the vendor's trust anchors.
     */
    public record BindSigner(Long userId, Long practitionerId, String vendorCode, String externalSignerId,
                             String medium, String certificate) {}
}
