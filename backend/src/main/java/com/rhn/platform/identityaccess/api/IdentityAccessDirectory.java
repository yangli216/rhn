package com.rhn.platform.identityaccess.api;

import java.util.Optional;

public interface IdentityAccessDirectory {
    Optional<AuthenticatedAccount> findActiveAccount(Long tenantId, String username);

    UserAccountReference requireAccount(Long tenantId, Long accountId);
}
