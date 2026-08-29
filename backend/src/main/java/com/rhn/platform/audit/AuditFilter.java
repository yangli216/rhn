package com.rhn.platform.audit;

import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.web.CorrelationIdFilter;
import com.rhn.shared.context.ExecutionContextProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(0)
class AuditFilter extends OncePerRequestFilter {
    private final AuditLogService auditLogService;
    private final ExecutionContextProvider executionContextProvider;

    AuditFilter(AuditLogService auditLogService, ExecutionContextProvider executionContextProvider) {
        this.auditLogService = auditLogService;
        this.executionContextProvider = executionContextProvider;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            filterChain.doFilter(request, response);
        } finally {
            String actor = resolveActor(request);
            Object correlationId = request.getAttribute(CorrelationIdFilter.ATTRIBUTE_NAME);
            auditLogService.record(TenantContext.currentTenantId().orElse(null), actor, request.getMethod(),
                    request.getRequestURI(), response.getStatus(), correlationId == null ? "" : correlationId.toString());
        }
    }

    private String resolveActor(HttpServletRequest request) {
        try {
            return executionContextProvider.requireCurrent().actor();
        } catch (RuntimeException exception) {
            // Auditing must never replace the business response (for example, when a forged work context is rejected).
            return request.getRemoteUser() == null ? "anonymous" : request.getRemoteUser();
        }
    }
}
