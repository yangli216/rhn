package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_VIS_SVC_LOC")
public class ServiceLocation {
    @Id @Column(name = "ID_SVC_LOC") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "ID_SVC_LOC_PARENT") private Long parentId;
    @Column(name = "CD_SVC_LOC", nullable = false) private String code;
    @Column(name = "NA_SVC_LOC", nullable = false) private String name;
    @Column(name = "SD_LOC_TYPE", nullable = false) private String locationType;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ServiceLocation() {
    }

    public ServiceLocation(Long tenantId, Long organizationId, Long departmentId, Long parentId,
                           String code, String name, String locationType, int sortOrder, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.parentId = parentId;
        this.code = code;
        this.name = name;
        this.locationType = locationType;
        this.sortOrder = sortOrder;
        this.status = "ACTIVE";
        this.validFrom = LocalDate.now();
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long parentId() { return parentId; }
    public String code() { return code; }
    public String name() { return name; }
    public String locationType() { return locationType; }
    public int sortOrder() { return sortOrder; }
    public String status() { return status; }
}
