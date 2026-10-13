package com.rhn.platform.numbering.application;

public interface BusinessNumberCounter {
    /** Returns -1 on exhausted capacity. Never wraps, decrements or releases consumed numbers. */
    long next(String key, long maximum);
    /** Allocate above a previously issued floor, atomically with incrementing the target counter. */
    default long next(String key, long maximum, long minimum) {
        if (minimum != 0) throw new UnsupportedOperationException("Counter must support historical sequence floors");
        return next(key, maximum);
    }
    /** Read the last consumed sequence; absent keys return zero. Never creates or increments a key. */
    long current(String key);
}
