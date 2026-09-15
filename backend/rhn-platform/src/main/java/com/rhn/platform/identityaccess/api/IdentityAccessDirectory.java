package com.rhn.platform.identityaccess.api;

import java.util.Optional;

public interface IdentityAccessDirectory {
    Optional<AuthenticatedAccount> findActiveAccount(Long tenantId, String username);

    /** Locks the account until the caller transaction completes; requires an active transaction. */
    boolean lockAccount(Long tenantId, Long accountId);

    UserAccountReference requireAccount(Long tenantId, Long accountId);
}
