package com.rhn.shared.idempotency;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Shared formatting for deterministic, bounded idempotency command codes. */
public final class CommandCodes {
    private static final int MAX_LENGTH = 128;

    private CommandCodes() {
    }

    public static String prefixed(String prefix, String value) {
        String command = prefix + value;
        return command.length() <= MAX_LENGTH ? command : prefix + sha256(value);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 digest is unavailable", exception);
        }
    }
}
