package com.rhn.platform.cryptography.infrastructure;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.X509v3CertificateBuilder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Provider;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.Locale;

/**
 * SM2/SM3 primitives backed by an unregistered BouncyCastle provider instance, so payment SDKs that
 * manage their own JCA providers are unaffected. SM2 signatures use the default user ID
 * {@code 1234567812345678} (GB/T 32918 / GM/T 0009), which is what CA middleware produces by default.
 */
public final class SmCrypto {
    public static final String SM3 = "SM3";
    public static final String SHA_256 = "SHA-256";
    public static final String SM2_SIGNATURE = "SM3withSM2";
    private static final Provider BC = new BouncyCastleProvider();
    private static final SecureRandom RANDOM = new SecureRandom();

    private SmCrypto() {
    }

    public static byte[] digest(String algorithm, byte[] content) {
        String normalized = normalizeDigest(algorithm);
        try {
            MessageDigest digest = SM3.equals(normalized)
                    ? MessageDigest.getInstance(SM3, BC)
                    : MessageDigest.getInstance(SHA_256);
            return digest.digest(content == null ? new byte[0] : content);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot calculate " + normalized + " digest", exception);
        }
    }

    public static boolean supportsDigest(String algorithm) {
        if (algorithm == null) return false;
        String value = algorithm.trim().toUpperCase(Locale.ROOT);
        return SM3.equals(value) || "SHA-256".equals(value) || "SHA256".equals(value);
    }

    public static String sm3Hex(byte[] content) {
        return HexFormat.of().withUpperCase().formatHex(digest(SM3, content));
    }

    public static KeyPair generateKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC", BC);
            generator.initialize(new ECGenParameterSpec("sm2p256v1"), RANDOM);
            return generator.generateKeyPair();
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot generate SM2 key pair", exception);
        }
    }

    public static byte[] sign(PrivateKey privateKey, byte[] data) {
        try {
            Signature signature = Signature.getInstance(SM2_SIGNATURE, BC);
            signature.initSign(privateKey, RANDOM);
            signature.update(data);
            return signature.sign();
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot create SM2 signature", exception);
        }
    }

    public static boolean verify(PublicKey publicKey, byte[] data, byte[] signatureValue) {
        try {
            Signature signature = Signature.getInstance(SM2_SIGNATURE, BC);
            signature.initVerify(publicKey);
            signature.update(data);
            return signature.verify(signatureValue);
        } catch (Exception exception) {
            return false;
        }
    }

    public static PrivateKey privateKey(byte[] pkcs8) {
        try {
            return KeyFactory.getInstance("EC", BC).generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid SM2 private key", exception);
        }
    }

    public static PublicKey publicKey(byte[] x509) {
        try {
            return KeyFactory.getInstance("EC", BC).generatePublic(new X509EncodedKeySpec(x509));
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid SM2 public key", exception);
        }
    }

    /** Derives the public key of an SM2 PKCS#8 private key. */
    public static PublicKey publicKeyOf(PrivateKey privateKey) {
        try {
            var bcKey = (org.bouncycastle.jce.interfaces.ECPrivateKey) privateKey;
            var spec = bcKey.getParameters();
            var point = spec.getG().multiply(bcKey.getD()).normalize();
            return KeyFactory.getInstance("EC", BC).generatePublic(
                    new org.bouncycastle.jce.spec.ECPublicKeySpec(point, spec));
        } catch (Exception exception) {
            throw new IllegalArgumentException("Cannot derive SM2 public key", exception);
        }
    }

    public static X509Certificate certificate(byte[] der) {
        try {
            return (X509Certificate) CertificateFactory.getInstance("X.509", BC)
                    .generateCertificate(new ByteArrayInputStream(der));
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid X.509 certificate", exception);
        }
    }

    public static X509Certificate certificate(String base64Der) {
        return certificate(Base64.getMimeDecoder().decode(base64Der));
    }

    public static byte[] encoded(X509Certificate certificate) {
        try {
            return certificate.getEncoded();
        } catch (Exception exception) {
            throw new IllegalArgumentException("Cannot encode certificate", exception);
        }
    }

    /** Certificate fingerprint used as the stable binding key: upper-case hex SM3 of the DER encoding. */
    public static String fingerprint(X509Certificate certificate) {
        return sm3Hex(encoded(certificate));
    }

    public static boolean issuedBy(X509Certificate certificate, X509Certificate issuer) {
        try {
            if (!certificate.getIssuerX500Principal().equals(issuer.getSubjectX500Principal())) return false;
            certificate.verify(issuer.getPublicKey(), BC);
            return true;
        } catch (Exception exception) {
            return false;
        }
    }

    public static boolean validAt(X509Certificate certificate, Instant instant) {
        try {
            certificate.checkValidity(Date.from(instant));
            return true;
        } catch (Exception exception) {
            return false;
        }
    }

    /** Digital-signature or non-repudiation key usage; certificates without the extension are rejected. */
    public static boolean allowsSigning(X509Certificate certificate) {
        boolean[] usage = certificate.getKeyUsage();
        return usage != null && (usage[0] || usage[1]);
    }

    /** Issues an SM2 certificate. Used by development CA simulation only, never by production adapters. */
    public static X509Certificate issue(String subjectDn, PublicKey subjectKey, String issuerDn,
                                        PrivateKey issuerKey, Instant notBefore, Instant notAfter,
                                        boolean authority) {
        try {
            X509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(new X500Name(issuerDn),
                    new BigInteger(127, RANDOM), Date.from(notBefore), Date.from(notAfter),
                    new X500Name(subjectDn), subjectKey);
            builder.addExtension(Extension.basicConstraints, true, new BasicConstraints(authority));
            builder.addExtension(Extension.keyUsage, true, authority
                    ? new KeyUsage(KeyUsage.keyCertSign | KeyUsage.cRLSign)
                    : new KeyUsage(KeyUsage.digitalSignature | KeyUsage.nonRepudiation));
            var signer = new JcaContentSignerBuilder(SM2_SIGNATURE).setProvider(BC).build(issuerKey);
            return new JcaX509CertificateConverter().setProvider(BC).getCertificate(builder.build(signer));
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot issue SM2 certificate", exception);
        }
    }

    private static String normalizeDigest(String algorithm) {
        if (!supportsDigest(algorithm)) {
            throw new IllegalArgumentException("Unsupported digest algorithm: " + algorithm);
        }
        String value = algorithm.trim().toUpperCase(Locale.ROOT);
        return SM3.equals(value) ? SM3 : SHA_256;
    }
}
