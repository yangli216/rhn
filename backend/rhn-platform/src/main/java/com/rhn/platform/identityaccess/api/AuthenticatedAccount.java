package com.rhn.platform.identityaccess.api;

import java.util.Set;

public record AuthenticatedAccount(
        Long id,
        Long tenantId,
        Long practitionerId,
        String username,
        String passwordHash,
        Set<String> authorities
) {
    public AuthenticatedAccount {
        authorities = Set.copyOf(authorities);
    }
}
