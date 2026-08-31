package com.rhn.outpatient.encounter;

import com.rhn.shared.api.BusinessException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "encounters")
class Encounter {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "resident_id", nullable = false)
    private Long residentId;
    @Column(name = "encounter_no", nullable = false)
    private String encounterNo;
    @Column(name = "organization_id", nullable = false)
    private Long organizationId;
    @Column(name = "department_id", nullable = false)
    private Long departmentId;
    @Column(name = "registration_id")
    private Long registrationId;
    @Column(name = "schedule_id")
    private Long scheduleId;
    @Column(name = "appointment_id")
    private Long appointmentId;
    @Column(name = "registration_source")
    private String registrationSource;
    @Column(name = "visit_type")
    private String visitType;
    @Column(name = "encounter_class", nullable = false)
    private String encounterClass;
    @Column(name = "clinician_id")
    private String clinicianId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EncounterStatus status;
    @Column(name = "chief_complaint")
    private String chiefComplaint;
    private Integer systolic;
    private Integer diastolic;
    @Column(name = "registered_at", nullable = false)
    private Instant registeredAt;
    @Column(name = "started_at")
    private Instant startedAt;
    @Column(name = "completed_at")
    private Instant completedAt;
    @Column(name = "termination_code")
    private String terminationCode;
    @Column(name = "termination_reason")
    private String terminationReason;
    @Column(name = "terminated_at")
    private Instant terminatedAt;
    @Column(name = "terminated_by")
    private Long terminatedBy;
    @Version
    private long version;

    protected Encounter() {
    }

    Encounter(Long tenantId, Long residentId, String encounterNo, Long organizationId, Long departmentId) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.residentId = residentId;
        this.encounterNo = encounterNo;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.encounterClass = "OUTPATIENT";
        this.status = EncounterStatus.REGISTERED;
        this.registeredAt = Instant.now();
    }

    void start(String clinicianId) {
        requireStatus(EncounterStatus.REGISTERED, "只有已挂号就诊可以开始接诊");
        this.status = EncounterStatus.IN_PROGRESS;
        this.clinicianId = clinicianId;
        this.startedAt = Instant.now();
    }

    void bindRegistration(Long registrationId, Long scheduleId, Long appointmentId,
                          String registrationSource, String visitType) {
        this.registrationId = registrationId;
        this.scheduleId = scheduleId;
        this.appointmentId = appointmentId;
        this.registrationSource = registrationSource;
        this.visitType = visitType;
    }

    void recordClinicalData(String chiefComplaint, Integer systolic, Integer diastolic) {
        requireStatus(EncounterStatus.IN_PROGRESS, "只有接诊中的就诊可以记录病历");
        this.chiefComplaint = chiefComplaint;
        this.systolic = systolic;
        this.diastolic = diastolic;
    }

    void suspend() {
        requireStatus(EncounterStatus.IN_PROGRESS, "只有接诊中的就诊可以暂挂");
        this.status = EncounterStatus.SUSPENDED;
    }

    void resume(String clinicianId) {
        requireStatus(EncounterStatus.SUSPENDED, "只有已暂挂的就诊可以恢复接诊");
        this.status = EncounterStatus.IN_PROGRESS;
        this.clinicianId = clinicianId;
    }

    void complete() {
        requireStatus(EncounterStatus.IN_PROGRESS, "只有接诊中的就诊可以完成");
        this.status = EncounterStatus.COMPLETED;
        this.completedAt = Instant.now();
    }

    void transfer() {
        requireStatus(EncounterStatus.SUSPENDED, "只有等待转科接收的就诊可以完成转科");
        this.status = EncounterStatus.TRANSFERRED;
        this.completedAt = Instant.now();
    }

    void cancelBeforeService() {
        requireStatus(EncounterStatus.REGISTERED, "只有未开始接诊的挂号可以退号");
        this.status = EncounterStatus.CANCELLED;
    }

    void terminate(String code, String reason, Long actorId) {
        if (status != EncounterStatus.IN_PROGRESS && status != EncounterStatus.SUSPENDED) {
            throw new BusinessException("ENCOUNTER_NOT_TERMINABLE", "只有接诊中或已暂挂的就诊可以终止",
                    HttpStatus.CONFLICT);
        }
        this.status = EncounterStatus.TERMINATED;
        this.terminationCode = code;
        this.terminationReason = reason;
        this.terminatedAt = Instant.now();
        this.terminatedBy = actorId;
    }

    private void requireStatus(EncounterStatus expected, String message) {
        if (status != expected) {
            throw new BusinessException("ENCOUNTER_STATE_INVALID", message, HttpStatus.CONFLICT);
        }
    }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long residentId() { return residentId; }
    String encounterNo() { return encounterNo; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
    Long registrationId() { return registrationId; }
    Long scheduleId() { return scheduleId; }
    Long appointmentId() { return appointmentId; }
    String registrationSource() { return registrationSource; }
    String visitType() { return visitType; }
    String encounterClass() { return encounterClass; }
    String clinicianId() { return clinicianId; }
    EncounterStatus status() { return status; }
    String chiefComplaint() { return chiefComplaint; }
    Integer systolic() { return systolic; }
    Integer diastolic() { return diastolic; }
    Instant registeredAt() { return registeredAt; }
    Instant startedAt() { return startedAt; }
    Instant completedAt() { return completedAt; }
    String terminationCode() { return terminationCode; }
    String terminationReason() { return terminationReason; }
    Instant terminatedAt() { return terminatedAt; }
    Long terminatedBy() { return terminatedBy; }
    long version() { return version; }
}
