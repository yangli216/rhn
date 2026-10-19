package com.rhn.platform.cryptography.spi;

public enum SignatureFormat {
    /** SM3withSM2 (DER) directly over the RHN evidence statement bytes. */
    SM2_STATEMENT,
    /**
     * SM3withSM2 (DER) over a vendor envelope that embeds the statement digest, e.g. a CA platform that
     * signs its own request body. The envelope is stored and the adapter proves it binds the digest.
     */
    SM2_ENVELOPE
}
