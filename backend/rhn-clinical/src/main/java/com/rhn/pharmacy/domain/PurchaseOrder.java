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
@Table(name = "RHN_SUP_PURCH_ORDER")
public class PurchaseOrder {
    @Id @Column(name = "ID_PURCH_ORDER") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_SUPPL", nullable = false) private Long supplierId;
    @Column(name = "CD_ORDER_NO", nullable = false) private String orderNo;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DA_ORDER", nullable = false) private LocalDate orderDate;
    @Column(name = "DA_EXPCTD") private LocalDate expectedDate;
    @Column(name = "DT_SUBMTD") private Instant submittedAt;
    @Column(name = "ID_USER_SUBMTD") private Long submittedBy;
    @Column(name = "DT_APRVD") private Instant approvedAt;
    @Column(name = "ID_USER_APRVD") private Long approvedBy;
    @Column(name = "DES_APRVL_REASON") private String approvalReason;
    @Column(name = "DES_PURCH_ORDER") private String description;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

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
