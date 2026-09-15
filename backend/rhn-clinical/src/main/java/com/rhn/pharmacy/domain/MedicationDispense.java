package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_MED_DISP")
public class MedicationDispense {
    @Id @Column(name = "ID_MED_DISP") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DISP_TASK", nullable = false) private Long taskId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_MED_DISP_ORIGINAL") private Long originalDispenseId;
    @Column(name = "CD_DISP_NO", nullable = false) private String dispenseNo;
    @Column(name = "SD_DISP_TYPE", nullable = false) private String dispenseType;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;
    @Column(name = "ID_DISPENSER_PRACT", nullable = false) private Long dispenserPractitionerId;
    @Column(name = "ID_DISPENSER_USER", nullable = false) private Long dispenserUserId;
    @Column(name = "ID_DISPENSER_ASSIGN", nullable = false) private Long dispenserAssignmentId;
    @Column(name = "ID_CHECKER_PRACT") private Long checkerPractitionerId;
    @Column(name = "ID_CHECKER_USER") private Long checkerUserId;
    @Column(name = "ID_CHECKER_ASSIGN") private Long checkerAssignmentId;
    @Column(name = "DT_CHECKED") private Instant checkedAt;
    @Column(name = "QTY_OPERATION", nullable = false, precision = 28, scale = 8) private BigDecimal operationQuantity;
    @Column(name = "CD_OPERATION_UNIT", nullable = false) private String operationUnitCode;
    @Column(name = "DES_MED_DISP") private String description;

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
