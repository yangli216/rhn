package com.rhn.platform.numbering.application;

import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class RedisBusinessNumberCounter implements BusinessNumberCounter {
    private static final DefaultRedisScript<Long> NEXT = script();
    private final StringRedisTemplate redis;

    public RedisBusinessNumberCounter(StringRedisTemplate redis) { this.redis = redis; }

    @Override
    public long next(String key, long maximum) { return next(key, maximum, 0); }

    @Override
    public long next(String key, long maximum, long minimum) {
        if (key == null || key.isBlank() || maximum < 1 || maximum > 999_999_999_999L || minimum < 0 || minimum > 999_999_999_999L) throw new IllegalArgumentException("Invalid sequence request");
        Long value = redis.execute(NEXT, List.of(key), Long.toString(maximum), Long.toString(minimum));
        if (value == null || value == 0 || value < -1 || value > maximum) throw new IllegalStateException("Redis returned an invalid business sequence");
        return value;
    }

    @Override
    public long current(String key) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("Invalid sequence key");
        String value = redis.opsForValue().get(key);
        if (value == null) return 0;
        if (!value.matches("[1-9][0-9]{0,11}")) throw new IllegalStateException("Invalid persisted business sequence");
        return Long.parseLong(value);
    }

    private static DefaultRedisScript<Long> script() {
        var script = new DefaultRedisScript<Long>();
        script.setLocation(new ClassPathResource("numbering/next-business-number.lua"));
        script.setResultType(Long.class);
        return script;
    }
}
