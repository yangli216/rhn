package com.rhn.platform.cryptography.spi;

import com.rhn.platform.cryptography.api.SigningMode;

import java.util.Optional;
import java.util.Set;

/**
 * Outbound port to one CA vendor. Implementations own protocol, credentials, endpoint calls and vendor
 * status mapping; the platform owns signing orders, certificate binding, local verification and evidence.
 * Vendor SDKs and HTTP clients stay in {@code infrastructure.ca.<vendor>}.
 */
public interface CaVendorAdapter {
    String vendorCode();

    Capabilities capabilities();

    /** Configuration readiness only; never returns or exposes credentials. */
    default boolean configured(Long tenantId, Long organizationId) { return true; }

    /** Verification material and timestamping; mandatory because every signature is verified locally. */
    CaVerificationPort verification();

    default Optional<CaTimestampPort> timestamp() { return Optional.empty(); }

    default Optional<CaSignerEnrollmentPort> enrollment() { return Optional.empty(); }

    default Optional<CaRemoteSigningPort> remoteSigning() { return Optional.empty(); }

    default Optional<CaMobileLoginPort> mobileLogin() { return Optional.empty(); }

    default Optional<CaSigningGrantPort> signingGrant() { return Optional.empty(); }

    default Optional<CaCallbackTranslator> callbacks() { return Optional.empty(); }

    /**
     * @param assurance          {@link ProviderAssurance#DEVELOPMENT_ONLY} adapters are refused by the
     *                           registry whenever compliance enforcement is enabled
     * @param signingModes       modes the vendor can serve; {@code CLIENT_TOKEN} needs a browser driver
     * @param formats            signature formats the adapter may return
     * @param batchQueryLimit    maximum orders per status query, 1 when the vendor has no batch query
     */
    record Capabilities(ProviderAssurance assurance, Set<SigningMode> signingModes, Set<SignatureFormat> formats,
                        int batchQueryLimit) {
        public Capabilities {
            if (assurance == null) throw new IllegalArgumentException("CA adapter assurance is required");
            signingModes = signingModes == null ? Set.of() : Set.copyOf(signingModes);
            formats = formats == null ? Set.of() : Set.copyOf(formats);
            if (formats.isEmpty()) throw new IllegalArgumentException("CA adapter must declare signature formats");
            if (batchQueryLimit < 1) throw new IllegalArgumentException("CA batch query limit must be positive");
        }
    }
}
