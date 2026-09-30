package com.rhn.pharmacy.domain;

public enum DispenseTaskLineStatus {
    PENDING,
    READY,
    REJECTED,
    PICKING,
    READY_TO_DISPENSE,
    PARTIAL,
    COMPLETED,
    RETURNED,
    CANCELLED
}
