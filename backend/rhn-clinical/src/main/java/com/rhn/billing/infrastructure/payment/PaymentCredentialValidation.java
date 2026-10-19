package com.rhn.billing.infrastructure.payment;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Map;

final class PaymentCredentialValidation {
    private PaymentCredentialValidation() {}
    static String key(String value) { return value.replaceAll("-----[^\\r\\n]+-----", "").replaceAll("\\s", ""); }
    static RSAPrivateCrtKey privateKey(String value) throws Exception {
        var privateKey = (RSAPrivateCrtKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(key(value))));
        if (privateKey.getModulus().bitLength() < 2048) throw new IllegalArgumentException("RSA key too short");
        return privateKey;
    }
    static void publicKey(String value) throws Exception {
        var publicKey = (RSAKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(key(value))));
        if (publicKey.getModulus().bitLength() < 2048) throw new IllegalArgumentException("RSA key too short");
    }
    static X509Certificate certificate(String value) throws Exception {
        var certificate = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        certificate.checkValidity();
        if (!(certificate.getPublicKey() instanceof RSAKey key) || key.getModulus().bitLength() < 2048) throw new IllegalArgumentException("Invalid RSA certificate");
        return certificate;
    }
    static void rootCertificates(String value) throws Exception {
        var certificates = CertificateFactory.getInstance("X.509").generateCertificates(new ByteArrayInputStream(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        for (var item : certificates) {
            var certificate = (X509Certificate) item;
            if (!(certificate.getPublicKey() instanceof RSAKey key) || key.getModulus().bitLength() < 2048) continue;
            try { certificate.checkValidity(); return; } catch (java.security.cert.CertificateException ignored) { /* Bundles may retain unrelated expired roots. */ }
        }
        throw new IllegalArgumentException("No currently valid RSA root certificate");
    }
    static void p12(String encoded, String password) throws Exception {
        var store = KeyStore.getInstance("PKCS12");
        store.load(new ByteArrayInputStream(Base64.getDecoder().decode(encoded)), password.toCharArray());
        boolean found = false;
        for (var aliases = store.aliases(); aliases.hasMoreElements();) {
            String alias = aliases.nextElement();
            if (store.isKeyEntry(alias)) {
                var certificate = (X509Certificate) store.getCertificate(alias); certificate.checkValidity();
                if (!(store.getKey(alias, password.toCharArray()) instanceof RSAKey key) || key.getModulus().bitLength() < 2048) throw new IllegalArgumentException("Invalid merchant key");
                found = true;
            }
        }
        if (!found) throw new IllegalArgumentException("Merchant private key missing");
    }
    static void deploymentFile(Map<String, String> values, String key, String path, boolean binary) {
        if (path == null || path.isBlank()) return;
        try {
            if (Files.size(Path.of(path)) > 131072) return;
            values.put(key, binary ? Base64.getEncoder().encodeToString(Files.readAllBytes(Path.of(path))) : Files.readString(Path.of(path)));
        } catch (Exception ignored) { /* Administration reports a missing credential without exposing a path. */ }
    }
    static String identity(Map<String, String> values, String key) {
        String value = values.get(key);
        if (value == null || value.isBlank() || value.length() > 128 || !value.equals(value.trim())) throw new IllegalArgumentException("Invalid merchant identity");
        return value;
    }
}
