package com.rhn.platform.security;

import com.rhn.platform.identityaccess.api.AuthenticatedAccount;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

final class RhnUserDetails implements UserDetails {
    private final AuthenticatedAccount account;
    private final List<GrantedAuthority> authorities;

    RhnUserDetails(AuthenticatedAccount account) {
        this.account = account;
        this.authorities = account.authorities().stream().map(SimpleGrantedAuthority::new)
                .map(GrantedAuthority.class::cast).toList();
    }

    Long userId() { return account.id(); }
    Long tenantId() { return account.tenantId(); }
    Long practitionerId() { return account.practitionerId(); }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() { return authorities; }
    @Override public String getPassword() { return account.passwordHash(); }
    @Override public String getUsername() { return account.username(); }
}
