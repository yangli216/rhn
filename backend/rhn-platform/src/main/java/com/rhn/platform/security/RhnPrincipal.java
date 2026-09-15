package com.rhn.platform.security;

import java.security.Principal;

public record RhnPrincipal(Long userId, Long tenantId, String username) implements Principal {
    @Override
    public String getName() {
        return username;
    }
}
