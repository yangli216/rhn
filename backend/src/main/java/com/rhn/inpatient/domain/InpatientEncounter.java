package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "encounters")
public class InpatientEncounter {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_no", nullable = false) private String encounterNo;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "episode_id") private Long episodeId;
    @Column(name = "service_location_id") private Long serviceLocationId;
    @Column(name = "encounter_class", nullable = false) private String encounterClass;
    @Column(name = "clinician_id") private String clinicianId;
    @Column(nullable = false) private String status;
    @Column(name = "registered_at", nullable = false) private Instant registeredAt;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Version @Column(nullable = false) private long version;

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
