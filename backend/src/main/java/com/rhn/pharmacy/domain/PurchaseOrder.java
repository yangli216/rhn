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
@Table(name = "purchase_orders")
public class PurchaseOrder {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "supplier_id", nullable = false) private Long supplierId;
    @Column(name = "order_no", nullable = false) private String orderNo;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(nullable = false) private String status;
    @Column(name = "order_date", nullable = false) private LocalDate orderDate;
    @Column(name = "expected_date") private LocalDate expectedDate;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "submitted_by") private Long submittedBy;
    @Column(name = "approved_at") private Instant approvedAt;
    @Column(name = "approved_by") private Long approvedBy;
    @Column(name = "approval_reason") private String approvalReason;
    @Column private String description;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected PurchaseOrder() {}

    public PurchaseOrder(Long tenantId, Long organizationId, Long stockSiteId, Long supplierId,
                         String orderNo, String requestCode, LocalDate orderDate, LocalDate expectedDate,
                         String description, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.stockSiteId = stockSiteId; this.supplierId = supplierId; this.orderNo = orderNo;
        this.requestCode = requestCode; this.status = "DRAFT"; this.orderDate = orderDate;
        this.expectedDate = expectedDate; this.description = description; this.createdAt = Instant.now();
        this.createdBy = actorId; this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public void submit(Long actorId) {
        requireStatus("DRAFT"); status = "SUBMITTED"; submittedAt = Instant.now(); submittedBy = actorId;
        touch(actorId);
    }

    public void approve(Long actorId, String reason) {
        requireStatus("SUBMITTED"); status = "APPROVED"; approvedAt = Instant.now(); approvedBy = actorId;
        approvalReason = reason; touch(actorId);
    }

    public void reject(Long actorId, String reason) {
        requireStatus("SUBMITTED"); status = "REJECTED"; approvedAt = Instant.now(); approvedBy = actorId;
        approvalReason = reason; touch(actorId);
    }

    public void updateReceiptProgress(boolean complete, Long actorId) {
        if (!"APPROVED".equals(status) && !"PARTIALLY_RECEIVED".equals(status)) {
            throw new IllegalStateException("采购订单当前状态不能接收入库");
        }
        status = complete ? "COMPLETED" : "PARTIALLY_RECEIVED"; touch(actorId);
    }

    private void requireStatus(String expected) {
        if (!expected.equals(status)) throw new IllegalStateException("采购订单状态不允许当前操作");
    }
    private void touch(Long actorId) { updatedAt = Instant.now(); updatedBy = actorId; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long supplierId() { return supplierId; }
    public String orderNo() { return orderNo; }
    public String requestCode() { return requestCode; }
    public String status() { return status; }
    public LocalDate orderDate() { return orderDate; }
    public LocalDate expectedDate() { return expectedDate; }
    public Instant submittedAt() { return submittedAt; }
    public Long submittedBy() { return submittedBy; }
    public Instant approvedAt() { return approvedAt; }
    public Long approvedBy() { return approvedBy; }
    public String approvalReason() { return approvalReason; }
    public String description() { return description; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
