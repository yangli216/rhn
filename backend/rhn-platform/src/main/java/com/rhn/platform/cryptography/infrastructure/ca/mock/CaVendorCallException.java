package com.rhn.platform.cryptography.infrastructure.ca.mock;

/**
 * A vendor call that did not produce a confirmed answer. {@code retryable} is true for transport problems
 * (timeout, HTTP 5xx, non-JSON reply) whose outcome is unknown; a business rejection carries the vendor's
 * {@code errorCode}. The signing worker retries any such failure with backoff and never treats it as a
 * confirmed order outcome. Messages never contain credentials or payloads.
 */
public class CaVendorCallException extends RuntimeException {
    private final String errorCode;
    private final boolean retryable;

    public CaVendorCallException(String errorCode, String message, boolean retryable, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.retryable = retryable;
    }

    public String errorCode() { return errorCode; }

    public boolean retryable() { return retryable; }
}
