package com.rhn.platform.cryptography.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

/** Binding between an RHN account and its signer identity (and certificate) at one CA vendor. */
@Entity
@Table(name = "RHN_SYS_CA_SIGNER")
public class CaSigner {
    @Id @Column(name = "ID_CA_SIGNER") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_USER", nullable = false) private Long userId;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "CD_CA_VENDOR", nullable = false) private String vendorCode;
    @Column(name = "ID_EXT_SIGNER", nullable = false) private String externalSignerId;
    @Enumerated(EnumType.STRING) @Column(name = "SD_MEDIUM", nullable = false) private CaSignerMedium medium;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private CaSignerStatus status;
    @Column(name = "HASH_CERT") private String certificateFingerprint;
    @Column(name = "CD_CERT_SERIAL") private String certificateSerial;
    @Column(name = "CERT_ISSUER") private String certificateIssuer;
    @Column(name = "DES_CERT_SUBJ") private String certificateSubject;
    @Column(name = "DT_CERT_FROM") private Instant certificateNotBefore;
    @Column(name = "DT_CERT_TO") private Instant certificateNotAfter;
    @Column(name = "ID_USER_BOUND", nullable = false) private Long boundBy;
    @Column(name = "DT_BOUND", nullable = false) private Instant boundAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected CaSigner() {
    }

    public CaSigner(Long id, Long tenantId, Long userId, Long practitionerId, String vendorCode,
                    String externalSignerId, CaSignerMedium medium, Long boundBy, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.userId = userId;
        this.practitionerId = practitionerId;
        this.vendorCode = vendorCode;
        this.externalSignerId = externalSignerId;
        this.medium = medium;
        this.status = CaSignerStatus.ACTIVE;
        this.boundBy = boundBy;
        this.boundAt = now;
        this.updatedAt = now;
    }

    public void certificate(CertificateMaterial certificate, Instant now) {
        this.certificateFingerprint = certificate.fingerprint();
        this.certificateSerial = certificate.serialNumber();
        this.certificateIssuer = certificate.issuer();
        this.certificateSubject = certificate.subject();
        this.certificateNotBefore = certificate.notBefore();
        this.certificateNotAfter = certificate.notAfter();
        this.updatedAt = now;
    }

    public void status(CaSignerStatus status, Instant now) {
        this.status = status;
        this.updatedAt = now;
    }

    public boolean usableAt(Instant instant) {
        return status == CaSignerStatus.ACTIVE
                && (certificateNotAfter == null || certificateNotAfter.isAfter(instant))
                && (certificateNotBefore == null || !certificateNotBefore.isAfter(instant));
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long userId() { return userId; }
    public Long practitionerId() { return practitionerId; }
    public String vendorCode() { return vendorCode; }
    public String externalSignerId() { return externalSignerId; }
    public CaSignerMedium medium() { return medium; }
    public CaSignerStatus status() { return status; }
    public String certificateFingerprint() { return certificateFingerprint; }
    public String certificateSerial() { return certificateSerial; }
    public String certificateIssuer() { return certificateIssuer; }
    public String certificateSubject() { return certificateSubject; }
    public Instant certificateNotBefore() { return certificateNotBefore; }
    public Instant certificateNotAfter() { return certificateNotAfter; }
    public Long boundBy() { return boundBy; }
    public Instant boundAt() { return boundAt; }
    public Instant updatedAt() { return updatedAt; }
}
