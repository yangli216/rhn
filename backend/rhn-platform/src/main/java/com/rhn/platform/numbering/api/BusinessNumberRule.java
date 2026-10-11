package com.rhn.platform.numbering.api;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** Immutable rule. Width is a capacity limit, never truncates or wraps a sequence. */
public record BusinessNumberRule(String prefix, String suffix, String dateFormat,
                                 Integer sequenceWidth, BusinessNumberScope scope) {
    public BusinessNumberRule {
        prefix = prefix == null ? "" : prefix;
        suffix = suffix == null ? "" : suffix;
        if (!prefix.matches("[A-Za-z0-9._/-]{0,16}") || !suffix.matches("[A-Za-z0-9._/-]{0,16}")) {
            throw new IllegalArgumentException("Business number prefix/suffix must contain up to 16 ASCII code characters");
        }
        dateFormat = dateFormat == null ? "yyMMdd" : switch (dateFormat.toLowerCase(Locale.ROOT)) {
            case "yymmdd" -> "yyMMdd";
            case "yyyymmdd" -> "yyyyMMdd";
            default -> throw new IllegalArgumentException("Business number date-format must be yyMMdd or yyyyMMdd");
        };
        sequenceWidth = sequenceWidth == null ? 5 : sequenceWidth;
        if (sequenceWidth < 1 || sequenceWidth > 12) throw new IllegalArgumentException("Business number sequence-width must be 1..12");
        scope = scope == null ? BusinessNumberScope.TENANT : scope;
    }

    public long maximumSequence() {
        return Long.parseLong("9".repeat(sequenceWidth));
    }

    public String format(LocalDate date, long sequence) {
        if (date == null || date.getYear() < 2000 || date.getYear() > 2099) {
            throw new IllegalArgumentException("Business number date must be in 2000..2099");
        }
        if (sequence < 1 || sequence > maximumSequence()) throw new IllegalArgumentException("Business number sequence exceeds configured capacity");
        String value = Long.toString(sequence);
        return prefix + date.format(DateTimeFormatter.ofPattern(dateFormat, Locale.ROOT))
                + "0".repeat(sequenceWidth - value.length()) + value + suffix;
    }
}
