package com.rhn.shared.id;

import cn.hutool.core.lang.Snowflake;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Date;
import java.util.regex.Pattern;

/**
 * Generates positive, time-ordered 63-bit identifiers for entity primary keys.
 *
 * <p>The epoch and bit layout are persistent data contracts and must not be changed after production use.
 */
public final class GlobalIds {
    public static final Instant EPOCH = Instant.parse("2026-01-01T00:00:00Z");
    public static final long MAX_NODE_ID = 31;
    private static final Pattern EXTERNAL_ID = Pattern.compile("[1-9][0-9]{0,18}");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static volatile Snowflake snowflake = generator(0, 0);

    private GlobalIds() {
    }

    static synchronized void configure(long workerId, long dataCenterId) {
        validateNodeId("workerId", workerId);
        validateNodeId("dataCenterId", dataCenterId);
        snowflake = generator(workerId, dataCenterId);
    }

    public static long next() {
        long id = snowflake.nextId();
        if (id <= 0) throw new IllegalStateException("Snowflake identifier must be a positive signed bigint");
        return id;
    }

    public static String external(long id) {
        if (id <= 0) throw new IllegalArgumentException("Identifier must be positive");
        return Long.toString(id);
    }

    public static long parseExternal(String value) {
        if (value == null || !EXTERNAL_ID.matcher(value).matches()) {
            throw new IllegalArgumentException("Identifier must contain 1 to 19 decimal digits");
        }
        long id = Long.parseLong(value);
        if (id <= 0) throw new IllegalArgumentException("Identifier must be positive");
        return id;
    }

    public static String randomSuffix(int length) {
        if (length < 1 || length > 12) throw new IllegalArgumentException("Suffix length must be between 1 and 12");
        String value = Long.toUnsignedString(RANDOM.nextLong(), 36).toUpperCase(java.util.Locale.ROOT);
        return value.length() >= length ? value.substring(value.length() - length)
                : "0".repeat(length - value.length()) + value;
    }

    private static Snowflake generator(long workerId, long dataCenterId) {
        return new Snowflake(Date.from(EPOCH), workerId, dataCenterId, false);
    }

    private static void validateNodeId(String name, long value) {
        if (value < 0 || value > MAX_NODE_ID) {
            throw new IllegalArgumentException(name + " must be between 0 and " + MAX_NODE_ID);
        }
    }
}
