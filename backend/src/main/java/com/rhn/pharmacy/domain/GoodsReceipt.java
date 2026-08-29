package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "goods_receipts")
public class GoodsReceipt {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "purchase_order_id", nullable = false) private Long purchaseOrderId;
    @Column(name = "supplier_id", nullable = false) private Long supplierId;
    @Column(name = "receipt_no", nullable = false) private String receiptNo;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(name = "delivery_note_no") private String deliveryNoteNo;
    @Column(nullable = false) private String status;
    @Column(name = "received_at", nullable = false) private Instant receivedAt;
    @Column(name = "received_by", nullable = false) private Long receivedBy;
    @Column(name = "inspected_at") private Instant inspectedAt;
    @Column(name = "inspected_by") private Long inspectedBy;
    @Column(name = "posted_at") private Instant postedAt;
    @Column(name = "posted_by") private Long postedBy;
    @Column private String description;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected GoodsReceipt() {}

    public GoodsReceipt(Long tenantId, Long organizationId, Long stockSiteId, Long purchaseOrderId,
                        Long supplierId, String receiptNo, String requestCode, String deliveryNoteNo,
                        Instant receivedAt, String description, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.stockSiteId = stockSiteId; this.purchaseOrderId = purchaseOrderId; this.supplierId = supplierId;
        this.receiptNo = receiptNo; this.requestCode = requestCode; this.deliveryNoteNo = deliveryNoteNo;
        this.status = "RECEIVED"; this.receivedAt = receivedAt; this.receivedBy = actorId;
        this.description = description; this.createdAt = Instant.now(); this.createdBy = actorId;
        this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public void beginInspection(Long actorId) {
        requireStatus("RECEIVED"); status = "INSPECTING"; touch(actorId);
    }

    public void completeInspection(boolean anyAccepted, boolean anyRejected, Long actorId) {
        requireStatus("INSPECTING");
        status = anyAccepted ? (anyRejected ? "PARTIALLY_ACCEPTED" : "ACCEPTED") : "REJECTED";
        inspectedAt = Instant.now(); inspectedBy = actorId; touch(actorId);
    }

    public void markPosted(Long actorId) {
        if (!"ACCEPTED".equals(status) && !"PARTIALLY_ACCEPTED".equals(status)) {
            throw new IllegalStateException("只有验收通过的到货单可以入库");
        }
        status = "POSTED"; postedAt = Instant.now(); postedBy = actorId; touch(actorId);
    }

    private void requireStatus(String expected) {
        if (!expected.equals(status)) throw new IllegalStateException("到货验收单状态不允许当前操作");
    }
    private void touch(Long actorId) { updatedAt = Instant.now(); updatedBy = actorId; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long purchaseOrderId() { return purchaseOrderId; }
    public Long supplierId() { return supplierId; }
    public String receiptNo() { return receiptNo; }
    public String requestCode() { return requestCode; }
    public String deliveryNoteNo() { return deliveryNoteNo; }
    public String status() { return status; }
    public Instant receivedAt() { return receivedAt; }
    public Long receivedBy() { return receivedBy; }
    public Instant inspectedAt() { return inspectedAt; }
    public Long inspectedBy() { return inspectedBy; }
    public Instant postedAt() { return postedAt; }
    public Long postedBy() { return postedBy; }
    public String description() { return description; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
