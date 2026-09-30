package com.rhn.diagnostics.domain;

public enum DiagnosticExecutionTaskStatus {
    WAITING_SETTLEMENT,
    READY,
    COLLECTED,
    IN_PROGRESS,
    COMPLETED,
    EXCEPTION,
    CANCELLED
}
