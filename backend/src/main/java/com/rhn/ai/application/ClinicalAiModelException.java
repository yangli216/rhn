package com.rhn.ai.application;

public final class ClinicalAiModelException extends RuntimeException {
    public ClinicalAiModelException(String message) {
        super(message);
    }

    public ClinicalAiModelException(String message, Throwable cause) {
        super(message, cause);
    }
}
