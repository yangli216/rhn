package com.rhn.platform.cryptography.domain;

public enum SigningOrderStatus {
    /** Persisted with the business transaction; not yet sent to the vendor. */
    PENDING(false),
    AWAITING_SIGNER(false),
    /** Vendor reports signed; the signature still has to be fetched and verified locally. */
    SIGNED(false),
    VERIFIED(true),
    REJECTED(true),
    EXPIRED(true),
    CANCELLED(true),
    FAILED(true),
    /** Signed, then voided by the signer in the vendor app; the evidence row is kept. */
    VOIDED_BY_SIGNER(true);

    private final boolean terminal;

    SigningOrderStatus(boolean terminal) {
        this.terminal = terminal;
    }

    public boolean terminal() { return terminal; }
}
