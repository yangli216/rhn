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
@Table(name = "RHN_SUP_DISP_ROUTE")
public class DispenseRoute {
    @Id @Column(name = "ID_DISP_ROUTE") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "CD_DISP_ROUTE", nullable = false) private String code;
    @Column(name = "NA_DISP_ROUTE", nullable = false) private String name;
    @Column(name = "SD_CARE_SETTING", nullable = false) private String careSetting;
    @Column(name = "ID_DEPT_SRC") private Long sourceDepartmentId;
    @Column(name = "SD_MED_TYPE") private String medicationType;
    @Column(name = "ID_STOCK_SITE_TARGET", nullable = false) private Long targetStockSiteId;
    @Column(name = "FG_ACTIVE", nullable = false) private boolean active;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DES_DISP_ROUTE") private String description;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected DispenseRoute() {}

    public DispenseRoute(Long tenantId, Long organizationId, String code, String name,
                         String careSetting, Long sourceDepartmentId, String medicationType, Long targetStockSiteId,
                         boolean active, LocalDate validFrom, LocalDate validTo,
                         String description, Long actorId) {
        id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.code = code; this.name = name; this.careSetting = careSetting;
        this.sourceDepartmentId = sourceDepartmentId;
        this.medicationType = medicationType; this.targetStockSiteId = targetStockSiteId;
        this.active = active; this.validFrom = validFrom; this.validTo = validTo;
        this.description = description; createdAt = Instant.now(); createdBy = actorId;
        updatedAt = createdAt; updatedBy = actorId;
    }

    public void update(String name, String careSetting, Long sourceDepartmentId, String medicationType,
                       Long targetStockSiteId, boolean active, LocalDate validFrom,
                       LocalDate validTo, String description, Long actorId) {
        this.name = name; this.careSetting = careSetting; this.sourceDepartmentId = sourceDepartmentId;
        this.medicationType = medicationType; this.targetStockSiteId = targetStockSiteId;
        this.active = active; this.validFrom = validFrom; this.validTo = validTo;
        this.description = description; updatedAt = Instant.now(); updatedBy = actorId;
    }

    public boolean effective(LocalDate date) {
        return active && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date));
    }

    public boolean matches(String requestedCareSetting, Long departmentId, String type) {
        return careSetting.equals(requestedCareSetting)
                && (sourceDepartmentId == null || sourceDepartmentId.equals(departmentId))
                && (medicationType == null || medicationType.equals(type));
    }

    public int specificity() {
        return (medicationType == null ? 0 : 2) + (sourceDepartmentId == null ? 0 : 1);
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public String code() { return code; }
    public String name() { return name; }
    public String careSetting() { return careSetting; }
    public Long sourceDepartmentId() { return sourceDepartmentId; }
    public String medicationType() { return medicationType; }
    public Long targetStockSiteId() { return targetStockSiteId; }
    public boolean active() { return active; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
    public String description() { return description; }
    public Instant updatedAt() { return updatedAt; }
}
