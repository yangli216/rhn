package com.rhn.platform.security;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import com.rhn.shared.json.JsonCodec;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RefreshLoginSessionServiceTest {
    private static final Long TENANT = 10L;
    private static final String TOKEN = "a".repeat(43);
    private static final Duration IDLE = Duration.ofMinutes(30);
    private static final Duration MAX = Duration.ofHours(12);

    private final InMemoryRefreshLoginSessionStore store = new InMemoryRefreshLoginSessionStore();
    private final RefreshLoginSessionService service =
            new RefreshLoginSessionService(store, true, IDLE, MAX, "RHN_LOGIN", false);

    @Test
    void issued_cookie_lives_for_the_absolute_limit_and_session_records_its_first_access() {
        MockHttpServletResponse response = new MockHttpServletResponse();

        service.issue(new MockHttpServletRequest(), response, TENANT, 7L, "doctor", LoginMethods.PASSWORD);

        String cookie = response.getHeader(HttpHeaders.SET_COOKIE);
        assertThat(cookie).contains("Max-Age=" + MAX.toSeconds());
        String token = cookie.substring("RHN_LOGIN=".length(), cookie.indexOf(';'));
        RefreshLoginSession saved = store.find(TENANT, token).orElseThrow();
        assertThat(saved.lastAccessedAt()).isEqualTo(saved.createdAt());
        assertThat(saved.expiresAt()).isEqualTo(saved.createdAt().plus(MAX));
    }

    @Test
    void use_within_the_idle_window_renews_the_last_access() {
        Instant now = Instant.now();
        store.save(TOKEN, session(now.minus(Duration.ofHours(2)), now.minus(Duration.ofMinutes(20))), IDLE);

        RefreshLoginSession found = service.find(request(), TENANT).orElseThrow();

        assertThat(found.lastAccessedAt()).isCloseTo(now, within());
        assertThat(store.find(TENANT, TOKEN).orElseThrow().lastAccessedAt()).isEqualTo(found.lastAccessedAt());
    }

    @Test
    void recent_access_is_not_rewritten_on_every_request() {
        Instant lastAccess = Instant.now().minusSeconds(10);
        store.save(TOKEN, session(lastAccess.minus(Duration.ofHours(1)), lastAccess), IDLE);

        assertThat(service.find(request(), TENANT).orElseThrow().lastAccessedAt()).isEqualTo(lastAccess);
    }

    @Test
    void session_idle_past_the_timeout_ends_and_is_deleted() {
        Instant now = Instant.now();
        store.save(TOKEN, session(now.minus(Duration.ofHours(1)), now.minus(IDLE).minusSeconds(1)), IDLE);

        assertThat(service.find(request(), TENANT)).isEmpty();
        assertThat(store.find(TENANT, TOKEN)).isEmpty();
    }

    @Test
    void continuous_use_still_ends_at_the_absolute_limit() {
        Instant now = Instant.now();
        store.save(TOKEN, new RefreshLoginSession(TENANT, 7L, "doctor", now.minus(MAX), now.minusSeconds(1),
                LoginMethods.PASSWORD, now.minusSeconds(5)), IDLE);

        assertThat(service.find(request(), TENANT)).isEmpty();
        assertThat(store.find(TENANT, TOKEN)).isEmpty();
    }

    @Test
    void session_stored_before_sliding_renewal_counts_idle_time_from_creation() {
        Instant now = Instant.now();
        store.save(TOKEN, new RefreshLoginSession(TENANT, 7L, "doctor", now.minus(Duration.ofHours(1)),
                now.plus(Duration.ofHours(7)), LoginMethods.PASSWORD, null), IDLE);

        assertThat(service.find(request(), TENANT)).isEmpty();
    }

    @Test
    void renewal_never_restores_a_session_deleted_meanwhile() {
        Instant now = Instant.now();
        RefreshLoginSession session = session(now.minus(Duration.ofHours(1)), now.minus(Duration.ofMinutes(5)));

        assertThat(store.renew(TOKEN, session.accessedAt(now), IDLE)).isFalse();
        assertThat(store.find(TENANT, TOKEN)).isEmpty();
    }

    @Test
    void rejects_an_idle_timeout_longer_than_the_absolute_limit() {
        assertThatThrownBy(() -> new RefreshLoginSessionService(store, true, Duration.ofHours(13), MAX,
                "RHN_LOGIN", false)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void redis_renewal_only_updates_an_existing_key_and_user_index_outlives_its_sessions() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> values = mock(ValueOperations.class);
        @SuppressWarnings("unchecked")
        SetOperations<String, String> sets = mock(SetOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(redis.opsForSet()).thenReturn(sets);
        JsonCodec json = mock(JsonCodec.class);
        when(json.write(org.mockito.ArgumentMatchers.any())).thenReturn("{}");
        RedisRefreshLoginSessionStore redisStore = new RedisRefreshLoginSessionStore(redis, json, "rhn:login-sessions");
        Instant now = Instant.now();
        RefreshLoginSession session = session(now, now);
        String userKey = "rhn:login-sessions:{10}:user:7";

        when(redis.getExpire(userKey, TimeUnit.SECONDS)).thenReturn(MAX.toSeconds() + 60);
        redisStore.save(TOKEN, session, IDLE);
        verify(redis, never()).expire(eq(userKey), org.mockito.ArgumentMatchers.any(Duration.class));

        when(redis.getExpire(userKey, TimeUnit.SECONDS)).thenReturn(60L);
        redisStore.save(TOKEN, session, IDLE);
        verify(redis).expire(eq(userKey), org.mockito.ArgumentMatchers.any(Duration.class));

        when(values.setIfPresent(anyString(), anyString(), eq(IDLE))).thenReturn(false);
        assertThat(redisStore.renew(TOKEN, session, IDLE)).isFalse();
        verify(values).setIfPresent("rhn:login-sessions:{10}:session:" + TOKEN, "{}", IDLE);
    }

    private static RefreshLoginSession session(Instant createdAt, Instant lastAccessedAt) {
        return new RefreshLoginSession(TENANT, 7L, "doctor", createdAt, createdAt.plus(MAX),
                LoginMethods.PASSWORD, lastAccessedAt);
    }

    private static MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("RHN_LOGIN", TOKEN));
        return request;
    }

    private static org.assertj.core.data.TemporalUnitOffset within() {
        return new org.assertj.core.data.TemporalUnitWithinOffset(5, ChronoUnit.SECONDS);
    }
}
