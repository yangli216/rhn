package com.rhn.billing.application.reconciliation;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.HexFormat;
final class ReconciliationFingerprints {
 private ReconciliationFingerprints(){}
 static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
}
