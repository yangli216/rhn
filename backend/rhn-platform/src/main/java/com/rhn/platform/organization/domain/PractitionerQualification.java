package com.rhn.platform.organization.domain;

import com.rhn.shared.api.StaleRevisionException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

/** Current professional title, practice registration and prescribing rights of one practitioner. */
@Entity
@Table(name = "RHN_SYS_PRACT_QUALIF")
public class PractitionerQualification {
    @Id @Column(name = "ID_PRACT_QUALIF") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PRACT", nullable = false) private Long practitionerId;
    @Column(name = "SD_PROF_TITLE") private String professionalTitle;
    @Column(name = "SD_PRACT_CAT") private String practiceCategory;
    @Column(name = "CD_PRACT_CERT") private String practiceCertificateCode;
    @Column(name = "CD_QUALIF_CERT") private String qualificationCertificateCode;
    @Column(name = "CD_INSUR_PRACT") private String insurancePractitionerCode;
    @Column(name = "FG_RX", nullable = false) private boolean prescribing;
    @Column(name = "FG_NARC_RX", nullable = false) private boolean narcoticPrescribing;
    @Column(name = "SD_ANTIMIC_RX_LEVEL") private String antimicrobialLevel;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;
    @Version @Column(name = "REVISION", nullable = false) private long revision;

    protected PractitionerQualification() {
    }

    public PractitionerQualification(Long tenantId, Long practitionerId, Long actorId) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.practitionerId = practitionerId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    /** Narcotic and antimicrobial rights are extensions of the ordinary prescribing right. */
    public void update(String professionalTitle, String practiceCategory, String practiceCertificateCode,
                       String qualificationCertificateCode, String insurancePractitionerCode, boolean prescribing,
                       boolean narcoticPrescribing, String antimicrobialLevel, Long actorId) {
        if (!prescribing && (narcoticPrescribing || antimicrobialLevel != null)) {
            throw new IllegalArgumentException("narcotic or antimicrobial rights require the prescribing right");
        }
        this.professionalTitle = professionalTitle;
        this.practiceCategory = practiceCategory;
        this.practiceCertificateCode = practiceCertificateCode;
        this.qualificationCertificateCode = qualificationCertificateCode;
        this.insurancePractitionerCode = insurancePractitionerCode;
        this.prescribing = prescribing;
        this.narcoticPrescribing = narcoticPrescribing;
        this.antimicrobialLevel = antimicrobialLevel;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw new StaleRevisionException(revision, "执业资质已被其他用户修改，请刷新后重试");
        }
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long practitionerId() { return practitionerId; }
    public String professionalTitle() { return professionalTitle; }
    public String practiceCategory() { return practiceCategory; }
    public String practiceCertificateCode() { return practiceCertificateCode; }
    public String qualificationCertificateCode() { return qualificationCertificateCode; }
    public String insurancePractitionerCode() { return insurancePractitionerCode; }
    public boolean prescribing() { return prescribing; }
    public boolean narcoticPrescribing() { return narcoticPrescribing; }
    public String antimicrobialLevel() { return antimicrobialLevel; }
    public Instant updatedAt() { return updatedAt; }
    public long revision() { return revision; }
}
