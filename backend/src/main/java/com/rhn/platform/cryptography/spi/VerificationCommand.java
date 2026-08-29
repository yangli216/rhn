package com.rhn.platform.cryptography.spi;

public record VerificationCommand(
        byte[] statement,
        String signatureAlgorithm,
        String keyId,
        String signatureValue,
        String verificationMaterial,
        String certificateSerial,
        String certificateIssuer,
        String timestampAuthority,
        String timestampToken
) {
    public VerificationCommand {
        statement = statement.clone();
    }

    @Override
    public byte[] statement() {
        return statement.clone();
    }
}
