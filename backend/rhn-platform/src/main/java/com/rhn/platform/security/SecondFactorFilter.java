package com.rhn.platform.security;

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
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

/**
 * Rejects password-only authentication (HTTP Basic, or a session issued after a password alone) for
 * accounts the tenant's second-factor policy covers. Such accounts complete the CA proof under
 * {@code /api/session/ca-login/**} with their password credentials and continue on the session it issues.
 */
class SecondFactorFilter extends OncePerRequestFilter {
    static final String CA_LOGIN_PATH = "/api/session/ca-login/";
    private final SecondFactorPolicy policy;
    private final JsonCodec jsonCodec;

    SecondFactorFilter(SecondFactorPolicy policy, JsonCodec jsonCodec) {
        this.policy = policy;
        this.jsonCodec = jsonCodec;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return !uri.startsWith("/api/") || uri.startsWith(CA_LOGIN_PATH)
                || ("DELETE".equals(request.getMethod()) && "/api/session".equals(uri));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            chain.doFilter(request, response);
            return;
        }
        if (request.getAttribute(RefreshLoginAuthenticationFilter.SESSION_ATTRIBUTE) instanceof RefreshLoginSession session
                && session.multiFactor()) {
            chain.doFilter(request, response);
            return;
        }
        List<String> authorities = authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
        Object correlationId = request.getAttribute(CorrelationIdFilter.ATTRIBUTE_NAME);
        boolean required;
        try {
            required = !policy.exempt(authentication.getName())
                    && policy.required(TenantContext.requireTenantId(), authorities);
        } catch (BusinessException error) {
            // Policy lookup runs outside MVC, so an unknown tenant must be answered here instead of surfacing as a 500.
            response.setStatus(error.status().value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(jsonCodec.write(new ApiError(error.code(), error.getMessage(),
                    correlationId == null ? "" : correlationId.toString(), Instant.now(), List.of())));
            return;
        }
        if (!required) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(jsonCodec.write(new ApiError("SECOND_FACTOR_REQUIRED",
                "当前账号需要扫码或证书完成第二步认证", correlationId == null ? "" : correlationId.toString(),
                Instant.now(), List.of())));
    }
}
