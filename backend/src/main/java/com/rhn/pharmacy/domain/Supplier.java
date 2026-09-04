package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_SUP_SUPPL")
public class Supplier {
    @Id @Column(name = "ID_SUPPL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "CD_SUPPL", nullable = false) private String code;
    @Column(name = "NA_SUPPL", nullable = false) private String name;
    @Column(name = "CD_UNIFIED_CREDIT") private String unifiedCreditCode;
    @Column(name = "CD_LICENSE_NO") private String licenseNo;
    @Column(name = "DA_LICENSE_VALID_TO") private LocalDate licenseValidTo;
    @Column(name = "NA_CONTACT") private String contactName;
    @Column(name = "CONTACT_PHONE") private String contactPhone;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected Supplier() {}

    public Supplier(Long tenantId, Long organizationId, String code, String name, String unifiedCreditCode,
                    String licenseNo, LocalDate licenseValidTo, String contactName, String contactPhone,
                    LocalDate validFrom, LocalDate validTo, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.code = code; this.name = name; this.unifiedCreditCode = unifiedCreditCode;
        this.licenseNo = licenseNo; this.licenseValidTo = licenseValidTo; this.contactName = contactName;
        this.contactPhone = contactPhone; this.status = "ACTIVE"; this.validFrom = validFrom; this.validTo = validTo;
        this.createdAt = Instant.now(); this.createdBy = actorId; this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public void update(long expectedRevision, Long actorId, String code, String name, String unifiedCreditCode,
                       String licenseNo, LocalDate licenseValidTo, String contactName, String contactPhone,
                       LocalDate validFrom, LocalDate validTo, String status) {
        requireRevision(expectedRevision);
        this.code = code; this.name = name; this.unifiedCreditCode = unifiedCreditCode;
        this.licenseNo = licenseNo; this.licenseValidTo = licenseValidTo; this.contactName = contactName;
        this.contactPhone = contactPhone; this.validFrom = validFrom; this.validTo = validTo; this.status = status;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision);
        this.status = status; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("供应商已被其他用户修改，请刷新后重试");
    }

    public boolean effective(LocalDate date) {
        return "ACTIVE".equals(status) && !date.isBefore(validFrom) && (validTo == null || !date.isAfter(validTo))
                && (licenseValidTo == null || !date.isAfter(licenseValidTo));
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public String code() { return code; }
    public String name() { return name; }
    public String unifiedCreditCode() { return unifiedCreditCode; }
    public String licenseNo() { return licenseNo; }
    public LocalDate licenseValidTo() { return licenseValidTo; }
    public String contactName() { return contactName; }
    public String contactPhone() { return contactPhone; }
    public String status() { return status; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
}
