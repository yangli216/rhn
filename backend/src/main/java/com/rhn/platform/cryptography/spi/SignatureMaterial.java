package com.rhn.platform.cryptography.spi;

import java.time.Instant;

public record SignatureMaterial(
        String signatureAlgorithm,
        String keyId,
        SignerType signerType,
        Long signerSubjectId,
        String signerName,
        String signatureValue,
        String verificationMaterial,
        String certificateSerial,
        String certificateIssuer,
        Instant signedAt,
        String timestampAuthority,
        String timestampToken
) {}
