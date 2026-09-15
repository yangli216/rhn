package com.rhn.quality.medication.application;

import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.shared.json.JsonCodec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Snapshot constructor sorts item identities and normalizes decimal scales; saved JSON strings are hashed verbatim. */
public final class PrescriptionSafetyHasher {
    private PrescriptionSafetyHasher() {}

    public static String hash(PrescriptionSafetySnapshot snapshot, JsonCodec json) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(json.write(snapshot).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required", exception);
        }
    }
}
