package com.rhn.platform.security;

import com.rhn.shared.id.GlobalIds;
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
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
class WorkContextFilter extends OncePerRequestFilter {
    static final String ORGANIZATION_HEADER = "X-Organization-Id";
    static final String DEPARTMENT_HEADER = "X-Department-Id";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            Long organizationId = parse(request.getHeader(ORGANIZATION_HEADER));
            Long departmentId = parse(request.getHeader(DEPARTMENT_HEADER));
            if (departmentId != null && organizationId == null) {
                response.sendError(HttpServletResponse.SC_BAD_REQUEST, "X-Department-Id requires X-Organization-Id");
                return;
            }
            if (organizationId != null) WorkContextRequest.set(organizationId, departmentId);
            filterChain.doFilter(request, response);
        } catch (IllegalArgumentException exception) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid work context identifier");
        } finally {
            WorkContextRequest.clear();
        }
    }

    private Long parse(String value) {
        return value == null || value.isBlank() ? null : GlobalIds.parseExternal(value);
    }
}
