package com.rhn.platform.printing.api;

public record StandardPrintCommand(
        String taskCode,
        PrintSourceRef source,
        String purpose,
        int copies,
        String idempotencyKey
) {}
