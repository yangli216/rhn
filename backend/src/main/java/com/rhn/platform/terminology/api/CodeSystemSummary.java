package com.rhn.platform.terminology.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.time.LocalDate;

public record CodeSystemSummary(
        Long id, long revision, String code, String name, String version,
        @DictionaryBinding("BD_MASTER_STATUS") String sdStatus,
        LocalDate effectiveFrom, LocalDate effectiveTo, String publisher
) {}
