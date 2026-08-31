package com.rhn.platform.security;

import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

class RefreshLoginAuthenticationFilter extends OncePerRequestFilter {
    private final RefreshLoginSessionService refreshLogin;
    private final IdentityAccessDirectory identityAccessDirectory;

    RefreshLoginAuthenticationFilter(RefreshLoginSessionService refreshLogin,
                                     IdentityAccessDirectory identityAccessDirectory) {
        this.refreshLogin = refreshLogin;
        this.identityAccessDirectory = identityAccessDirectory;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        return !refreshLogin.enabled() || !request.getRequestURI().startsWith("/api/")
                || (authorization != null && !authorization.isBlank());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Long tenantId = TenantContext.requireTenantId();
        var saved = refreshLogin.find(request, tenantId);
        if (saved.isPresent()) {
            var account = identityAccessDirectory.findActiveAccount(tenantId, saved.get().username())
                    .filter(value -> saved.get().userId().equals(value.id()));
            if (account.isPresent()) {
                RhnUserDetails principal = new RhnUserDetails(account.get());
                var authentication = UsernamePasswordAuthenticationToken.authenticated(
                        principal, null, principal.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } else {
                refreshLogin.invalidateCurrent(request, response, tenantId);
            }
        }
        chain.doFilter(request, response);
    }
}
