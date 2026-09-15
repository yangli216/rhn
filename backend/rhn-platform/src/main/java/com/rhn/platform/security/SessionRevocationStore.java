package com.rhn.platform.security;

import java.time.Duration;

public interface SessionRevocationStore {
    void revoke(Long tenantId, String clientSessionId, Duration ttl);

    boolean isRevoked(Long tenantId, String clientSessionId);
}
