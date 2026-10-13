package com.rhn.platform.numbering.api;

import java.time.LocalDate;
import java.util.Map;

/** Generate on the server, persist once, and return the persisted number on idempotent replay. */
public interface BusinessNumberGenerator {
    String next(String businessCode);
    String next(String businessCode, BusinessNumberContext context);
    Map<String, BusinessNumberRule> rules();
    BusinessNumberSequence inspect(String businessCode, BusinessNumberContext context);
    /** Preview is pure formatting: it does not reserve/consume a Redis sequence. */
    String preview(String businessCode, LocalDate date, long sequence);
}
