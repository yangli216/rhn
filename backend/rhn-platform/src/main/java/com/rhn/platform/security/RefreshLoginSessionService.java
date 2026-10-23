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
    /** Upper bound on how stale the stored last access may get, so busy sessions are not rewritten every request. */
    private static final Duration MAX_RENEWAL_INTERVAL = Duration.ofMinutes(1);
    private final RefreshLoginSessionStore sessions;
    private final SecureRandom secureRandom = new SecureRandom();
    private final boolean enabled;
    private final Duration idleTimeout;
    private final Duration maxLifetime;
    private final Duration renewalInterval;
    private final String cookieName;
    private final boolean cookieSecure;

    RefreshLoginSessionService(RefreshLoginSessionStore sessions,
                               @Value("${rhn.security.refresh-login.enabled:false}") boolean enabled,
                               @Value("${rhn.security.refresh-login.idle-timeout:PT30M}") Duration idleTimeout,
                               @Value("${rhn.security.refresh-login.max-lifetime:PT12H}") Duration maxLifetime,
                               @Value("${rhn.security.refresh-login.cookie-name:RHN_LOGIN}") String cookieName,
                               @Value("${rhn.security.refresh-login.cookie-secure:true}") boolean cookieSecure) {
        this.sessions = sessions;
        this.enabled = enabled;
        if (idleTimeout.isNegative() || idleTimeout.isZero() || maxLifetime.compareTo(idleTimeout) < 0) {
            throw new IllegalArgumentException("Refresh login needs 0 < idle-timeout <= max-lifetime");
        }
        this.idleTimeout = idleTimeout;
        this.maxLifetime = maxLifetime;
        Duration fraction = idleTimeout.dividedBy(10);
        this.renewalInterval = fraction.compareTo(MAX_RENEWAL_INTERVAL) < 0 ? fraction : MAX_RENEWAL_INTERVAL;
        this.cookieName = cookieName;
        this.cookieSecure = cookieSecure;
    }

    public boolean enabled() {
        return enabled;
    }

    /** Issues a password session unless the request already carries one of the same account; true when issued. */
    boolean ensureIssued(HttpServletRequest request, HttpServletResponse response, ExecutionContext context) {
        if (!enabled || context.subjectId() == null) return false;
        String currentToken = token(request).orElse(null);
        if (currentToken != null) {
            Optional<RefreshLoginSession> current = active(context.tenantId(), currentToken);
            if (current.filter(value -> context.subjectId().equals(value.userId())).isPresent()) return false;
        }
        issue(request, response, context.tenantId(), context.subjectId(), context.actor(), LoginMethods.PASSWORD);
        return true;
    }

    /** Replaces any session the request carries with a new one established by {@code authenticationMethod}. */
    void issue(HttpServletRequest request, HttpServletResponse response, Long tenantId, Long userId,
               String username, String authenticationMethod) {
        if (!enabled) throw new IllegalStateException("Refresh login is disabled");
        token(request).ifPresent(value -> sessions.delete(tenantId, value));
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = Instant.now();
        sessions.save(token, new RefreshLoginSession(tenantId, userId, username, now, now.plus(maxLifetime),
                authenticationMethod, now), idleTimeout);
        // The cookie lives for the absolute limit; the server ends the session earlier once it sits idle.
        writeCookie(response, token, maxLifetime);
    }

    boolean cookieSecure() {
        return cookieSecure;
    }

    Optional<RefreshLoginSession> find(HttpServletRequest request, Long tenantId) {
        if (!enabled) return Optional.empty();
        return token(request).flatMap(value -> active(tenantId, value));
    }

    /**
     * Returns the session while it is within both the idle timeout and the absolute lifetime, renewing its idle
     * window; a session past either limit is deleted.
     */
    private Optional<RefreshLoginSession> active(Long tenantId, String token) {
        Optional<RefreshLoginSession> saved = sessions.find(tenantId, token);
        if (saved.isEmpty()) return saved;
        RefreshLoginSession session = saved.get();
        Instant now = Instant.now();
        if (!session.expiresAt().isAfter(now) || !session.lastActivity().plus(idleTimeout).isAfter(now)) {
            // 只删除判定时读到的快照，避免并发续期后把刚续期的会话误删。
            sessions.deleteIfUnchanged(tenantId, token, session);
            return Optional.empty();
        }
        if (Duration.between(session.lastActivity(), now).compareTo(renewalInterval) < 0) return saved;
        RefreshLoginSession renewed = session.accessedAt(now);
        Duration remaining = Duration.between(now, session.expiresAt());
        // Renew only a session that still exists, so a concurrent logout or forced sign-out is never undone.
        if (!sessions.renew(token, renewed, remaining.compareTo(idleTimeout) < 0 ? remaining : idleTimeout)) {
            return Optional.empty();
        }
        return Optional.of(renewed);
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
