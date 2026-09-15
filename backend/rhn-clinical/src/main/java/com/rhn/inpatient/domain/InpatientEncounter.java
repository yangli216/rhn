package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_ENC")
public class InpatientEncounter {
    @Id @Column(name = "ID_ENC") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "CD_ENC_NO", nullable = false) private String encounterNo;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_CARE_EPISODE") private Long episodeId;
    @Column(name = "ID_SVC_LOC") private Long serviceLocationId;
    @Column(name = "SD_ENC_CLASS", nullable = false) private String encounterClass;
    @Column(name = "ID_CLINICIAN") private String clinicianId;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_REGISTERED", nullable = false) private Instant registeredAt;
    @Column(name = "DT_STARTED") private Instant startedAt;
    @Column(name = "DT_COMPLETED") private Instant completedAt;
    @Version @Column(name = "REVISION", nullable = false) private long version;

    protected InpatientEncounter() {
    }

    public InpatientEncounter(Long tenantId, Long residentId, String encounterNo, Long organizationId,
                              Long departmentId, Long episodeId, Long serviceLocationId, Long practitionerId) {
        this(tenantId, residentId, encounterNo, organizationId, departmentId, episodeId,
                serviceLocationId, practitionerId, Instant.now());
    }

    public InpatientEncounter(Long tenantId, Long residentId, String encounterNo, Long organizationId,
                              Long departmentId, Long episodeId, Long serviceLocationId, Long practitionerId,
                              Instant admittedAt) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.residentId = residentId;
        this.encounterNo = encounterNo;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.episodeId = episodeId;
        this.serviceLocationId = serviceLocationId;
        this.encounterClass = "INPATIENT";
        this.clinicianId = practitionerId == null ? null : practitionerId.toString();
        this.status = "IN_PROGRESS";
        this.registeredAt = admittedAt;
        this.startedAt = registeredAt;
    }

    public void moveTo(Long departmentId, Long serviceLocationId) {
        if (!"IN_PROGRESS".equals(status)) throw new IllegalStateException("NOT_IN_PROGRESS");
        this.departmentId = departmentId;
        this.serviceLocationId = serviceLocationId;
    }

    public void complete() {
        if (!"IN_PROGRESS".equals(status)) throw new IllegalStateException("NOT_IN_PROGRESS");
        this.status = "COMPLETED";
        this.completedAt = Instant.now();
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public String encounterNo() { return encounterNo; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long episodeId() { return episodeId; }
    public Long serviceLocationId() { return serviceLocationId; }
    public String status() { return status; }
    public Instant completedAt() { return completedAt; }
}
