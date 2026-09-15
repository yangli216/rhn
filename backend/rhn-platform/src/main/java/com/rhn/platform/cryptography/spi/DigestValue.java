package com.rhn.platform.cryptography.spi;

public record DigestValue(String algorithm, byte[] value) {
    public DigestValue {
        value = value.clone();
    }

    @Override
    public byte[] value() {
        return value.clone();
    }
}
