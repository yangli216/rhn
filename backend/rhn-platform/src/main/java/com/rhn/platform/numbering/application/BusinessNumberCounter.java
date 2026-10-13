package com.rhn.platform.numbering.application;

public interface BusinessNumberCounter {
    /** Returns -1 on exhausted capacity. Never wraps, decrements or releases consumed numbers. */
    long next(String key, long maximum);
    /** Read the last consumed sequence; absent keys return zero. Never creates or increments a key. */
    long current(String key);
}
