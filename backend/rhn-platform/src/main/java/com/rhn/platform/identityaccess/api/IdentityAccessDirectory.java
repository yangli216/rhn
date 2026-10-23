package com.rhn.platform.identityaccess.api;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface IdentityAccessDirectory {
    Optional<AuthenticatedAccount> findActiveAccount(Long tenantId, String username);

    /** Locks the account until the caller transaction completes; requires an active transaction. */
    boolean lockAccount(Long tenantId, Long accountId);

    UserAccountReference requireAccount(Long tenantId, Long accountId);

    /** Accounts bound to the given practitioners, regardless of status, so historical operators stay resolvable. */
    List<UserAccountReference> findAccountsByPractitioners(Long tenantId, Collection<Long> practitionerIds);
}
