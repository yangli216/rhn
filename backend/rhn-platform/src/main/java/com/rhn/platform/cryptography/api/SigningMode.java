package com.rhn.platform.cryptography.api;

/** How a personal CA signing order reaches the signer. */
public enum SigningMode {
    /** Browser signs with a UKey; the result is submitted back to RHN. */
    CLIENT_TOKEN(SignatureChannel.CLIENT_TOKEN),
    /** Order is pushed to the bound signer's phone app. */
    PUSH(SignatureChannel.MOBILE_COSIGN),
    /** Order shows a QR code; whoever scans claims it, and must be the bound signer. */
    QR_CLAIM(SignatureChannel.MOBILE_COSIGN),
    /** Signed without interaction under an active signer-granted auto-sign session. */
    AUTO(SignatureChannel.MOBILE_COSIGN);

    private final SignatureChannel channel;

    SigningMode(SignatureChannel channel) {
        this.channel = channel;
    }

    public SignatureChannel channel() { return channel; }
}
