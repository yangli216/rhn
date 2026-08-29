package com.rhn.platform.tenant;

import com.rhn.shared.api.ApiError;
import com.rhn.shared.json.JsonCodec;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TenantContextFilter extends OncePerRequestFilter {
    public static final String TENANT_HEADER = "X-Tenant-Id";
    private final JsonCodec jsonCodec;

    public TenantContextFilter(JsonCodec jsonCodec) {
        this.jsonCodec = jsonCodec;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String rawTenantId = request.getHeader(TENANT_HEADER);
        try {
            if (rawTenantId == null || rawTenantId.isBlank()) {
                writeError(response, "TENANT_REQUIRED", "缺少租户标识");
                return;
            }
            TenantContext.set(com.rhn.shared.id.GlobalIds.parseExternal(rawTenantId));
            filterChain.doFilter(request, response);
        } catch (IllegalArgumentException exception) {
            writeError(response, "TENANT_INVALID", "租户标识格式不正确");
        } finally {
            TenantContext.clear();
        }
    }

    private void writeError(HttpServletResponse response, String code, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(jsonCodec.write(new ApiError(code, message, "", Instant.now(), List.of())));
    }
}
