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
@Table(name = "suppliers")
public class Supplier {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "unified_credit_code") private String unifiedCreditCode;
    @Column(name = "license_no") private String licenseNo;
    @Column(name = "license_valid_to") private LocalDate licenseValidTo;
    @Column(name = "contact_name") private String contactName;
    @Column(name = "contact_phone") private String contactPhone;
    @Column(nullable = false) private String status;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

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
