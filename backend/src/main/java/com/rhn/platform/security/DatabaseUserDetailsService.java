package com.rhn.platform.security;

import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.tenant.TenantContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(prefix = "rhn.security", name = "dev-user-enabled", havingValue = "false", matchIfMissing = true)
class DatabaseUserDetailsService implements UserDetailsService {
    private final IdentityAccessDirectory identityAccessDirectory;

    DatabaseUserDetailsService(IdentityAccessDirectory identityAccessDirectory) {
        this.identityAccessDirectory = identityAccessDirectory;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return identityAccessDirectory.findActiveAccount(TenantContext.requireTenantId(), username)
                .map(RhnUserDetails::new)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid username or password"));
    }
}
