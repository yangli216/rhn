package com.rhn.platform.cryptography.spi;

import com.rhn.platform.cryptography.api.ProtectionProfile;

import java.time.Instant;

public record SigningCommand(
        Long tenantId,
        Long actorId,
        String actor,
        ProtectionProfile profile,
        byte[] statement,
        Instant requestedAt
) {
    public SigningCommand {
        statement = statement.clone();
    }

    @Override
    public byte[] statement() {
        return statement.clone();
    }
}
