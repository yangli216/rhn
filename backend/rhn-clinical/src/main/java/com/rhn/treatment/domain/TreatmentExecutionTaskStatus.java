package com.rhn.treatment.domain;

public enum TreatmentExecutionTaskStatus {
    WAITING_SETTLEMENT,
    WAITING_DISPENSE,
    WAITING_SKIN_TEST,
    READY,
    IN_PROGRESS,
    COMPLETED,
    CANCELLED,
    EXCEPTION
}
