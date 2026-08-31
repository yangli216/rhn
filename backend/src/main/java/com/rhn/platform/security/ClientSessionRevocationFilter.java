package com.rhn.platform.security;

import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.web.CorrelationIdFilter;
import com.rhn.shared.api.ApiError;
import com.rhn.shared.json.JsonCodec;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.regex.Pattern;

class ClientSessionRevocationFilter extends OncePerRequestFilter {
    static final String HEADER = "X-Client-Session-Id";
    private static final Pattern VALID_ID = Pattern.compile("[A-Za-z0-9._:-]{8,128}");
    private final SessionRevocationStore revocations;
    private final JsonCodec jsonCodec;

    ClientSessionRevocationFilter(SessionRevocationStore revocations, JsonCodec jsonCodec) {
        this.revocations = revocations; this.jsonCodec = jsonCodec;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/")
                || ("DELETE".equals(request.getMethod()) && "/api/session".equals(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            chain.doFilter(request, response);
            return;
        }
        String clientSessionId = request.getHeader(HEADER);
        if (clientSessionId == null || !VALID_ID.matcher(clientSessionId).matches()) {
            write(response, request, HttpServletResponse.SC_UNAUTHORIZED,
                    "CLIENT_SESSION_REQUIRED", "客户端会话标识缺失或格式不正确，请重新登录");
            return;
        }
        if (revocations.isRevoked(TenantContext.requireTenantId(), clientSessionId)) {
            write(response, request, HttpServletResponse.SC_UNAUTHORIZED,
                    "SESSION_TERMINATED", "当前会话已被管理员下线，请重新登录");
            return;
        }
        chain.doFilter(request, response);
    }

    private void write(HttpServletResponse response, HttpServletRequest request, int status,
                       String code, String message) throws IOException {
        Object correlationId = request.getAttribute(CorrelationIdFilter.ATTRIBUTE_NAME);
        response.setStatus(status); response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(jsonCodec.write(new ApiError(code, message,
                correlationId == null ? "" : correlationId.toString(), Instant.now(), List.of())));
    }
}
