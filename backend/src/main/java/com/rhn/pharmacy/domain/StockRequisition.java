package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_STOCK_REQ")
public class StockRequisition {
    @Id @Column(name = "ID_STOCK_REQ") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_STOCK_SITE_SRC", nullable = false) private Long sourceSiteId;
    @Column(name = "ID_DEPT_REQUESTING", nullable = false) private Long requestingDepartmentId;
    @Column(name = "ID_STOCK_SITE_DESTINATION") private Long destinationSiteId;
    @Column(name = "CD_REQ_NO", nullable = false) private String requisitionNo;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_REQUESTED", nullable = false) private Instant requestedAt;
    @Column(name = "ID_USER_REQUESTED", nullable = false) private Long requestedBy;
    @Column(name = "DT_APPROVED") private Instant approvedAt;
    @Column(name = "ID_USER_APPROVED") private Long approvedBy;
    @Column(name = "DT_PICKED") private Instant pickedAt;
    @Column(name = "ID_USER_PICKED") private Long pickedBy;
    @Column(name = "DT_ISSUED") private Instant issuedAt;
    @Column(name = "ID_USER_ISSUED") private Long issuedBy;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "DES_STOCK_REQ") private String description;
    @Column(name = "ID_INV_TXN") private Long inventoryTransactionId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected StockRequisition() {}

    public StockRequisition(Long tenantId, Long organizationId, Long sourceSiteId, Long requestingDepartmentId,
                            Long destinationSiteId, String requisitionNo, String requestCode, Instant requestedAt,
                            String reason, String description, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.sourceSiteId = sourceSiteId; this.requestingDepartmentId = requestingDepartmentId;
        this.destinationSiteId = destinationSiteId; this.requisitionNo = requisitionNo; this.requestCode = requestCode;
        this.status = "DRAFT"; this.requestedAt = requestedAt; this.requestedBy = actorId; this.reason = reason;
        this.description = description; this.createdAt = Instant.now(); this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public void submit(Long actorId) { require("DRAFT"); status = "SUBMITTED"; touch(actorId); }
    public void approve(Long actorId, String reason) {
        require("SUBMITTED"); status = "APPROVED"; approvedAt = Instant.now(); approvedBy = actorId;
        if (reason != null && !reason.isBlank()) this.reason = reason; touch(actorId);
    }
    public void reject(Long actorId, String reason) {
        require("SUBMITTED"); status = "REJECTED"; approvedAt = Instant.now(); approvedBy = actorId;
        this.reason = reason; touch(actorId);
    }
    public void markPicking(Long actorId) {
        require("APPROVED"); status = "PICKING"; pickedAt = Instant.now(); pickedBy = actorId; touch(actorId);
    }
    public void markIssued(Long actorId, Long transactionId) {
        require("PICKING"); status = "ISSUED"; issuedAt = Instant.now(); issuedBy = actorId;
        inventoryTransactionId = transactionId; touch(actorId);
    }
    private void require(String expected) {
        if (!expected.equals(status)) throw new IllegalStateException("请领单状态不允许当前操作");
    }
    private void touch(Long actorId) { updatedAt = Instant.now(); updatedBy = actorId; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long sourceSiteId() { return sourceSiteId; }
    public Long requestingDepartmentId() { return requestingDepartmentId; }
    public Long destinationSiteId() { return destinationSiteId; }
    public String requisitionNo() { return requisitionNo; }
    public String requestCode() { return requestCode; }
    public String status() { return status; }
    public Instant requestedAt() { return requestedAt; }
    public Long requestedBy() { return requestedBy; }
    public Instant approvedAt() { return approvedAt; }
    public Long approvedBy() { return approvedBy; }
    public Instant pickedAt() { return pickedAt; }
    public Long pickedBy() { return pickedBy; }
    public Instant issuedAt() { return issuedAt; }
    public Long issuedBy() { return issuedBy; }
    public String reason() { return reason; }
    public String description() { return description; }
    public Long inventoryTransactionId() { return inventoryTransactionId; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
