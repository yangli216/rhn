package com.rhn.platform.cryptography.spi;

import java.time.Instant;

/** Trusted timestamping for signatures that do not arrive with one (for example UKey signatures). */
public interface CaTimestampPort {
    Timestamp stamp(Long tenantId, Long organizationId, byte[] signatureValue);

    record Timestamp(String authority, String token, Instant time) {}
}
