package com.rhn.platform.numbering.application;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RedisBusinessNumberCounterTest {
    @Test
    @SuppressWarnings("unchecked")
    void inspection_never_creates_a_key_or_resets_corrupt_data() {
        var redis = mock(StringRedisTemplate.class);
        var values = (ValueOperations<String, String>) mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        var counter = new RedisBusinessNumberCounter(redis);
        assertThat(counter.current("missing")).isZero();
        when(values.get("used")).thenReturn("42");
        assertThat(counter.current("used")).isEqualTo(42);
        for (String corrupt : java.util.List.of("-1", "garbage", "01", "1000000000000")) {
            when(values.get("bad")).thenReturn(corrupt);
            assertThatThrownBy(() -> counter.current("bad")).isInstanceOf(IllegalStateException.class);
        }
        verify(values).get("missing"); verify(values).get("used"); verify(values, times(4)).get("bad");
        verifyNoMoreInteractions(values);
    }
}
