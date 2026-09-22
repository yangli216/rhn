package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_GOOD_RCPT")
public class GoodsReceipt {
    @Id @Column(name = "ID_GOOD_RCPT") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_PURCH_ORDER", nullable = false) private Long purchaseOrderId;
    @Column(name = "ID_SUPPL", nullable = false) private Long supplierId;
    @Column(name = "CD_RCPT_NO", nullable = false) private String receiptNo;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Column(name = "CD_DELIV_NOTE_NO") private String deliveryNoteNo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_RECVD", nullable = false) private Instant receivedAt;
    @Column(name = "ID_USER_RECVD", nullable = false) private Long receivedBy;
    @Column(name = "DT_INSPTD") private Instant inspectedAt;
    @Column(name = "ID_USER_INSPTD") private Long inspectedBy;
    @Column(name = "DT_POSTED") private Instant postedAt;
    @Column(name = "ID_USER_POSTED") private Long postedBy;
    @Column(name = "DES_GOOD_RCPT") private String description;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

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
