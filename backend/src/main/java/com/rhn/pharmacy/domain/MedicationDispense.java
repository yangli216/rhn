package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "medication_dispenses")
public class MedicationDispense {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "task_id", nullable = false) private Long taskId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "original_dispense_id") private Long originalDispenseId;
    @Column(name = "dispense_no", nullable = false) private String dispenseNo;
    @Column(name = "dispense_type", nullable = false) private String dispenseType;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "dispenser_practitioner_id", nullable = false) private Long dispenserPractitionerId;
    @Column(name = "dispenser_user_id", nullable = false) private Long dispenserUserId;
    @Column(name = "dispenser_assignment_id", nullable = false) private Long dispenserAssignmentId;
    @Column(name = "checker_practitioner_id") private Long checkerPractitionerId;
    @Column(name = "checker_user_id") private Long checkerUserId;
    @Column(name = "checker_assignment_id") private Long checkerAssignmentId;
    @Column(name = "checked_at") private Instant checkedAt;
    @Column(name = "operation_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal operationQuantity;
    @Column(name = "operation_unit_code", nullable = false) private String operationUnitCode;
    @Column private String description;

    protected MedicationDispense() {}

    public MedicationDispense(Long tenantId, Long taskId, Long residentId, Long encounterId, Long stockSiteId,
                              Long originalDispenseId, String dispenseNo, String dispenseType, Instant occurredAt,
                              Long dispenserPractitionerId, Long dispenserUserId, Long dispenserAssignmentId,
                              Long checkerPractitionerId, Long checkerUserId, Long checkerAssignmentId,
                              BigDecimal operationQuantity, String operationUnitCode, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.taskId = taskId; this.residentId = residentId;
        this.encounterId = encounterId; this.stockSiteId = stockSiteId; this.originalDispenseId = originalDispenseId;
        this.dispenseNo = dispenseNo; this.dispenseType = dispenseType; this.occurredAt = occurredAt;
        this.dispenserPractitionerId = dispenserPractitionerId; this.dispenserUserId = dispenserUserId;
        this.dispenserAssignmentId = dispenserAssignmentId; this.checkerPractitionerId = checkerPractitionerId;
        this.checkerUserId = checkerUserId; this.checkerAssignmentId = checkerAssignmentId;
        this.checkedAt = checkerPractitionerId == null ? null : Instant.now();
        this.operationQuantity = operationQuantity; this.operationUnitCode = operationUnitCode;
        this.description = description;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long taskId() { return taskId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long originalDispenseId() { return originalDispenseId; }
    public String dispenseNo() { return dispenseNo; }
    public String dispenseType() { return dispenseType; }
    public Instant occurredAt() { return occurredAt; }
    public Long dispenserPractitionerId() { return dispenserPractitionerId; }
    public Long dispenserUserId() { return dispenserUserId; }
    public Long dispenserAssignmentId() { return dispenserAssignmentId; }
    public Long checkerPractitionerId() { return checkerPractitionerId; }
    public Long checkerUserId() { return checkerUserId; }
    public Long checkerAssignmentId() { return checkerAssignmentId; }
    public Instant checkedAt() { return checkedAt; }
    public BigDecimal operationQuantity() { return operationQuantity; }
    public String operationUnitCode() { return operationUnitCode; }
    public String description() { return description; }
}
