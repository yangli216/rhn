package com.rhn.platform.cryptography.api;

import java.time.Instant;

/**
 * Optional CA identity proofs for login and second-factor checks: a QR code confirmed in the signer's
 * phone app, or a UKey signature over a one-time challenge. It only proves which account is bound to
 * the presented signer; issuing sessions, account status and audit stay with platform security.
 * Challenges are one-time, expire after two minutes and are bound to the tenant and to the browser
 * that started them ({@code browserNonce}).
 */
public interface CaLoginService {
    Methods methods(Long tenantId);

    MobileChallenge startMobile(Long tenantId, String browserNonce);

    /** A confirmed result is returned once; later polls report {@code EXPIRED}. */
    Outcome pollMobile(Long tenantId, String loginRequestId, String browserNonce);

    CertificateChallenge certificateChallenge(Long tenantId, String browserNonce);

    /** Consumes the challenge whatever the result, so a signature can be tried only once. */
    Outcome verifyCertificate(Long tenantId, String challengeId, String browserNonce,
                              String signatureValue, String certificate);

    /** {@code vendorCode} is null when no login method is available for the tenant. */
    record Methods(boolean mobile, boolean certificate, String vendorCode) {
        public static final Methods NONE = new Methods(false, false, null);
    }

    record MobileChallenge(String loginRequestId, String qrContent, Instant expiresAt, int pollIntervalSeconds) {}

    /** {@code toBeSigned} is Base64 of the exact bytes the UKey must sign with SM3withSM2. */
    record CertificateChallenge(String challengeId, String toBeSigned, Instant expiresAt) {}

    /**
     * {@code userId} is set only when {@code state} is {@code CONFIRMED}; {@code failureCode} explains
     * {@code FAILED}. {@code method} is {@code MOBILE} or {@code CERTIFICATE}.
     */
    record Outcome(State state, String method, String vendorCode, Long userId, String externalSignerId,
                   String failureCode, String failureMessage) {
        public static Outcome pending(String method, String vendorCode) {
            return new Outcome(State.PENDING, method, vendorCode, null, null, null, null);
        }

        public static Outcome failed(State state, String method, String vendorCode, String externalSignerId,
                                     String code, String message) {
            return new Outcome(state, method, vendorCode, null, externalSignerId, code, message);
        }
    }

    enum State { PENDING, CONFIRMED, REJECTED, EXPIRED, FAILED }
}
