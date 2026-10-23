package com.rhn.platform.security;

import java.time.Duration;
import java.util.Optional;

interface RefreshLoginSessionStore {
    void save(String token, RefreshLoginSession session, Duration ttl);

    /** Replaces a stored session and its expiry only while it still exists; false when it is gone. */
    boolean renew(String token, RefreshLoginSession session, Duration ttl);

    Optional<RefreshLoginSession> find(Long tenantId, String token);

    void delete(Long tenantId, String token);

    /** Deletes the session only while the stored value is still the expected snapshot; false when it changed or is gone. */
    boolean deleteIfUnchanged(Long tenantId, String token, RefreshLoginSession expected);

    void deleteByUser(Long tenantId, Long userId);
}
