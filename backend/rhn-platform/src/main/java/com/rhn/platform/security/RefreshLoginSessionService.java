package com.rhn.platform.security;

import com.rhn.shared.context.ExecutionContext;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class RefreshLoginSessionService {
    private static final Pattern VALID_TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private final RefreshLoginSessionStore sessions;
    private final SecureRandom secureRandom = new SecureRandom();
    private final boolean enabled;
    private final Duration ttl;
    private final String cookieName;
    private final boolean cookieSecure;

    RefreshLoginSessionService(RefreshLoginSessionStore sessions,
                               @Value("${rhn.security.refresh-login.enabled:false}") boolean enabled,
                               @Value("${rhn.security.refresh-login.ttl:PT8H}") Duration ttl,
                               @Value("${rhn.security.refresh-login.cookie-name:RHN_LOGIN}") String cookieName,
                               @Value("${rhn.security.refresh-login.cookie-secure:true}") boolean cookieSecure) {
        this.sessions = sessions;
        this.enabled = enabled;
        this.ttl = ttl;
        this.cookieName = cookieName;
        this.cookieSecure = cookieSecure;
    }

    public boolean enabled() {
        return enabled;
    }

    void ensureIssued(HttpServletRequest request, HttpServletResponse response, ExecutionContext context) {
        if (!enabled || context.subjectId() == null) return;
        String currentToken = token(request).orElse(null);
        if (currentToken != null) {
            Optional<RefreshLoginSession> current = sessions.find(context.tenantId(), currentToken);
            if (current.filter(value -> context.subjectId().equals(value.userId())).isPresent()) return;
            sessions.delete(context.tenantId(), currentToken);
        }
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = Instant.now();
        sessions.save(token, new RefreshLoginSession(context.tenantId(), context.subjectId(), context.actor(),
                now, now.plus(ttl)), ttl);
        writeCookie(response, token, ttl);
    }

    Optional<RefreshLoginSession> find(HttpServletRequest request, Long tenantId) {
        if (!enabled) return Optional.empty();
        return token(request).flatMap(value -> sessions.find(tenantId, value));
    }

    void invalidateCurrent(HttpServletRequest request, HttpServletResponse response, Long tenantId) {
        token(request).ifPresent(value -> sessions.delete(tenantId, value));
        clearCookie(response);
    }

    public void invalidateUser(Long tenantId, Long userId) {
        if (enabled) sessions.deleteByUser(tenantId, userId);
    }

    void clearCookie(HttpServletResponse response) {
        writeCookie(response, "", Duration.ZERO);
    }

    private Optional<String> token(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return Optional.empty();
        for (Cookie cookie : cookies) {
            if (cookieName.equals(cookie.getName()) && cookie.getValue() != null
                    && VALID_TOKEN.matcher(cookie.getValue()).matches()) {
                return Optional.of(cookie.getValue());
            }
        }
        return Optional.empty();
    }

    private void writeCookie(HttpServletResponse response, String value, Duration maxAge) {
        ResponseCookie cookie = ResponseCookie.from(cookieName, value)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Strict")
                .path("/")
                .maxAge(maxAge)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
