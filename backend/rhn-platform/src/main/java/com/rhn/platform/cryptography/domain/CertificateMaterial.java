package com.rhn.platform.cryptography.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/** Append-only certificate store keyed by fingerprint, so evidence stays verifiable after rotation. */
@Entity
@Table(name = "RHN_AUD_CRYPTO_CERT")
public class CertificateMaterial {
    @Id @Column(name = "ID_CRYPTO_CERT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "HASH_CERT", nullable = false) private String fingerprint;
    @Column(name = "CD_CA_VENDOR", nullable = false) private String vendorCode;
    @Column(name = "CD_CERT_SERIAL", nullable = false) private String serialNumber;
    @Column(name = "CERT_ISSUER", nullable = false) private String issuer;
    @Column(name = "DES_CERT_SUBJ", nullable = false) private String subject;
    @Column(name = "DT_CERT_FROM", nullable = false) private Instant notBefore;
    @Column(name = "DT_CERT_TO", nullable = false) private Instant notAfter;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "DES_CERT_DER", nullable = false) private String derBase64;
    @Column(name = "DT_RECDD", nullable = false) private Instant recordedAt;

    protected CertificateMaterial() {
    }

    public CertificateMaterial(Long id, Long tenantId, String fingerprint, String vendorCode, String serialNumber,
                               String issuer, String subject, Instant notBefore, Instant notAfter,
                               String derBase64, Instant recordedAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.fingerprint = fingerprint;
        this.vendorCode = vendorCode;
        this.serialNumber = serialNumber;
        this.issuer = issuer;
        this.subject = subject;
        this.notBefore = notBefore;
        this.notAfter = notAfter;
        this.derBase64 = derBase64;
        this.recordedAt = recordedAt;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String fingerprint() { return fingerprint; }
    public String vendorCode() { return vendorCode; }
    public String serialNumber() { return serialNumber; }
    public String issuer() { return issuer; }
    public String subject() { return subject; }
    public Instant notBefore() { return notBefore; }
    public Instant notAfter() { return notAfter; }
    public String derBase64() { return derBase64; }
    public Instant recordedAt() { return recordedAt; }
}
