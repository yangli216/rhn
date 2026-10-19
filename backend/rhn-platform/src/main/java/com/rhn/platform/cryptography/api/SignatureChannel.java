package com.rhn.platform.cryptography.api;

/** Where the private key that produced an evidence signature lives. */
public enum SignatureChannel {
    /** Application key of the system provider. */
    SYSTEM,
    /** Personal certificate on a UKey; signed in the browser through vendor middleware. */
    CLIENT_TOKEN,
    /** Personal certificate split between the signer's phone and the CA (co-signing / cloud certificate). */
    MOBILE_COSIGN
}
