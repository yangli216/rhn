package com.rhn.platform.numbering.api;

import java.time.LocalDate;

/** A read-only snapshot, not a reservation; another request may consume the next number. */
public record BusinessNumberSequence(LocalDate businessDate, String zoneId, String scopeKey,
                                     long currentSequence, Long nextSequence, long maximumSequence,
                                     String nextNumber) {}
