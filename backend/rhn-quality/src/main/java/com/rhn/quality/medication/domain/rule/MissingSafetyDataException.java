package com.rhn.quality.medication.domain.rule;

public class MissingSafetyDataException extends RuntimeException {
    public MissingSafetyDataException() {
        super("Required medication safety input is unavailable");
    }
}
