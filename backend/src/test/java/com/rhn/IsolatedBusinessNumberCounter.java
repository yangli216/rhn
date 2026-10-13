package com.rhn;

import com.rhn.platform.numbering.application.BusinessNumberCounter;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import java.util.concurrent.ConcurrentHashMap;

/** Test-only isolated allocator; real Redis concurrency is tested separately on a private random port. */
@Component
@Primary
@Profile("test")
public class IsolatedBusinessNumberCounter implements BusinessNumberCounter {
    private final ConcurrentHashMap<String, Long> values = new ConcurrentHashMap<>();
    @Override public synchronized long next(String key, long maximum) {
        long current = current(key);
        if (current >= maximum) return -1;
        values.put(key, current + 1);
        return current + 1;
    }
    @Override public long current(String key) { return values.getOrDefault(key, 0L); }
}
