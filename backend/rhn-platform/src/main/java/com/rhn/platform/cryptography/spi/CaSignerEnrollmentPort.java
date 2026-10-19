package com.rhn.platform.cryptography.spi;

import java.time.Instant;

/** Registers a practitioner with the vendor and reports whether the vendor-side signer can sign. */
public interface CaSignerEnrollmentPort {
    /**
     * Sends the signer profile to the vendor. Identity numbers are passed through only for this call and
     * are never persisted by the platform in clear text.
     */
    Enrollment enroll(Long tenantId, Long organizationId, SignerProfile profile);

    Enrollment query(Long tenantId, Long organizationId, String externalSignerId);

    record SignerProfile(Long userId, Long practitionerId, String name, String identityType,
                         String identityNumber, String mobile, String department) {
        @Override
        public String toString() {
            return "SignerProfile[userId=" + userId + ", practitionerId=" + practitionerId
                    + ", identityNumber=REDACTED, mobile=REDACTED]";
        }
    }

    /** {@code certificate} is Base64 DER and present once the vendor has issued it. */
    record Enrollment(String externalSignerId, State state, String certificate, Instant certificateNotAfter,
                      String message) {}

    enum State { PENDING_REVIEW, REJECTED, CERTIFICATE_PENDING, READY, DISABLED }
}
