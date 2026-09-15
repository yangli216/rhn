package com.rhn.platform.security;

import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.web.CorrelationIdFilter;
import com.rhn.shared.api.ApiError;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

/**
 * Replaces login-wide authorities with the permissions effective in the selected work context.
 * It runs after HTTP Basic authentication and before controller/method authorization.
 */
class WorkContextAuthorizationFilter extends OncePerRequestFilter {
    private final IdentityAccessDirectory identityAccessDirectory;
    private final WorkContextDirectory workContextDirectory;
    private final JsonCodec jsonCodec;

    WorkContextAuthorizationFilter(IdentityAccessDirectory identityAccessDirectory,
                                   WorkContextDirectory workContextDirectory,
                                   JsonCodec jsonCodec) {
        this.identityAccessDirectory = identityAccessDirectory;
        this.workContextDirectory = workContextDirectory;
        this.jsonCodec = jsonCodec;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/") || WorkContextRequest.current() == null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }
        Long tenantId = TenantContext.requireTenantId();
        AccountIdentity identity = accountIdentity(authentication, tenantId);
        if (identity == null) {
            writeForbidden(request, response, "WORK_CONTEXT_ACCOUNT_REQUIRED", "当前登录账号不能使用业务工作上下文");
            return;
        }
        WorkContextRequest.Selection selection = WorkContextRequest.current();
        try {
            var authorities = workContextDirectory.authoritiesFor(tenantId, identity.userId(),
                            selection.organizationId(), selection.departmentId()).stream()
                    .sorted().map(SimpleGrantedAuthority::new).toList();
            UsernamePasswordAuthenticationToken contextual = new UsernamePasswordAuthenticationToken(
                    authentication.getPrincipal(), authentication.getCredentials(), authorities);
            contextual.setDetails(authentication.getDetails());
            SecurityContextHolder.getContext().setAuthentication(contextual);
            filterChain.doFilter(request, response);
        } catch (BusinessException exception) {
            writeForbidden(request, response, exception.code(), exception.getMessage());
        }
    }

    private AccountIdentity accountIdentity(Authentication authentication, Long tenantId) {
        if (authentication.getPrincipal() instanceof RhnUserDetails value) {
            return new AccountIdentity(value.userId());
        }
        if (authentication.getPrincipal() instanceof RhnPrincipal value) {
            return new AccountIdentity(value.userId());
        }
        return identityAccessDirectory.findActiveAccount(tenantId, authentication.getName())
                .map(account -> new AccountIdentity(account.id())).orElse(null);
    }

    private void writeForbidden(HttpServletRequest request, HttpServletResponse response,
                                String code, String message) throws IOException {
        Object correlationId = request.getAttribute(CorrelationIdFilter.ATTRIBUTE_NAME);
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(jsonCodec.write(new ApiError(code, message,
                correlationId == null ? "" : correlationId.toString(), Instant.now(), List.of())));
    }

    private record AccountIdentity(Long userId) {
    }
}
