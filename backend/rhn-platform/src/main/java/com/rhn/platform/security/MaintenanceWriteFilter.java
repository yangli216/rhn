package com.rhn.platform.security;

import com.rhn.platform.maintenance.api.MaintenanceWriteGuard;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.api.ApiError;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Set;

@Component
public class MaintenanceWriteFilter extends OncePerRequestFilter {
    private final MaintenanceWriteGuard guard;
    private final JsonCodec json;
    public MaintenanceWriteFilter(MaintenanceWriteGuard guard, JsonCodec json) { this.guard = guard; this.json = json; }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken
                || !uri.startsWith("/api/") || Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod())
                || uri.startsWith("/api/platform/maintenance/") || uri.equals("/api/platform/maintenance")
                || uri.startsWith("/api/session/") || uri.equals("/api/session");
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        MaintenanceWriteGuard.Permit permit;
        try { permit = guard.enter(TenantContext.requireTenantId()); }
        catch (BusinessException error) {
            response.setStatus(error.status().value());
            response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
            response.getWriter().write(json.write(new ApiError(error.code(), error.getMessage(), "",
                    Instant.now(), List.of())));
            return;
        }
        try (permit) { chain.doFilter(request, response); }
    }
}
