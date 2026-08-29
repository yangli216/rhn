package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "stock_requisitions")
public class StockRequisition {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "source_site_id", nullable = false) private Long sourceSiteId;
    @Column(name = "requesting_department_id", nullable = false) private Long requestingDepartmentId;
    @Column(name = "destination_site_id") private Long destinationSiteId;
    @Column(name = "requisition_no", nullable = false) private String requisitionNo;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(nullable = false) private String status;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "requested_by", nullable = false) private Long requestedBy;
    @Column(name = "approved_at") private Instant approvedAt;
    @Column(name = "approved_by") private Long approvedBy;
    @Column(name = "picked_at") private Instant pickedAt;
    @Column(name = "picked_by") private Long pickedBy;
    @Column(name = "issued_at") private Instant issuedAt;
    @Column(name = "issued_by") private Long issuedBy;
    @Column private String reason;
    @Column private String description;
    @Column(name = "inventory_transaction_id") private Long inventoryTransactionId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

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
