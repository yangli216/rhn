package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Set;

@Entity
@Table(name = "inventory_trace_codes")
public class InventoryTraceCode {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "stock_bin_id") private Long stockBinId;
    @Column(name = "stock_item_id", nullable = false) private Long stockItemId;
    @Column(name = "stock_lot_id") private Long stockLotId;
    @Column(name = "goods_receipt_line_id") private Long goodsReceiptLineId;
    @Column(name = "trace_code", nullable = false) private String traceCode;
    @Column(name = "normalized_code", nullable = false) private String normalizedCode;
    @Column(name = "product_code_snapshot", nullable = false) private String productCodeSnapshot;
    @Column(name = "product_name_snapshot", nullable = false) private String productNameSnapshot;
    @Column(name = "lot_no_snapshot", nullable = false) private String lotNoSnapshot;
    @Column(name = "package_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal packageQuantity;
    @Column(name = "base_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal baseQuantity;
    @Column(name = "remaining_base_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal remainingBaseQuantity;
    @Column(nullable = false) private String status;
    @Column(name = "current_document_type") private String currentDocumentType;
    @Column(name = "current_document_id") private Long currentDocumentId;
    @Column(name = "current_document_no") private String currentDocumentNo;
    @Column(name = "received_at") private Instant receivedAt;
    @Column(name = "issued_at") private Instant issuedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected InventoryTraceCode() {}

    public InventoryTraceCode(Long tenantId, Long organizationId, Long stockSiteId, Long stockItemId,
                              Long goodsReceiptLineId, String traceCode, String normalizedCode,
                              String productCodeSnapshot, String productNameSnapshot, String lotNoSnapshot,
                              BigDecimal packageQuantity, BigDecimal baseQuantity, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.stockSiteId = stockSiteId; this.stockItemId = stockItemId;
        this.goodsReceiptLineId = goodsReceiptLineId; this.traceCode = traceCode;
        this.normalizedCode = normalizedCode; this.productCodeSnapshot = productCodeSnapshot;
        this.productNameSnapshot = productNameSnapshot; this.lotNoSnapshot = lotNoSnapshot;
        this.packageQuantity = packageQuantity;
        this.baseQuantity = baseQuantity; this.remainingBaseQuantity = baseQuantity; this.status = "PENDING_RECEIPT";
        this.createdAt = Instant.now(); this.createdBy = actorId; this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public void receive(Long binId, Long lotId, Long documentId, String documentNo, Instant occurredAt, Long actorId) {
        require("PENDING_RECEIPT"); stockBinId = binId; stockLotId = lotId; status = "AVAILABLE";
        currentDocumentType = "GOODS_RECEIPT"; currentDocumentId = documentId; currentDocumentNo = documentNo;
        receivedAt = occurredAt; touch(actorId);
    }

    public void issue(String documentType, Long documentId, String documentNo, Long actorId) {
        require("AVAILABLE");
        if (remainingBaseQuantity.compareTo(baseQuantity) != 0) throw new IllegalStateException("已拆零追溯包装不能按整包装出库");
        remainingBaseQuantity = BigDecimal.ZERO; status = "ISSUED"; currentDocumentType = documentType;
        currentDocumentId = documentId; currentDocumentNo = documentNo; stockBinId = null;
        issuedAt = Instant.now(); touch(actorId);
    }

    public void openForSplit(String documentType, Long documentId, String documentNo, Long actorId) {
        require("AVAILABLE"); status = "OPENED"; currentDocumentType = documentType;
        currentDocumentId = documentId; currentDocumentNo = documentNo; touch(actorId);
    }

    public void consumePartial(BigDecimal quantity, String documentType, Long documentId,
                               String documentNo, Instant occurredAt, Long actorId) {
        if (!Set.of("OPENED", "PARTIALLY_ISSUED").contains(status) || quantity == null
                || quantity.signum() <= 0 || remainingBaseQuantity.compareTo(quantity) < 0) {
            throw new IllegalStateException("追溯包装剩余量不足或当前状态不允许拆零消耗");
        }
        remainingBaseQuantity = remainingBaseQuantity.subtract(quantity);
        status = remainingBaseQuantity.signum() == 0 ? "ISSUED" : "PARTIALLY_ISSUED";
        currentDocumentType = documentType; currentDocumentId = documentId; currentDocumentNo = documentNo;
        if (remainingBaseQuantity.signum() == 0) { stockBinId = null; issuedAt = occurredAt; }
        touch(actorId);
    }

    public void restorePartial(Long binId, BigDecimal quantity, String documentType, Long documentId,
                               String documentNo, Long actorId) {
        if (!Set.of("PARTIALLY_ISSUED", "ISSUED").contains(status) || quantity == null
                || quantity.signum() <= 0 || remainingBaseQuantity.add(quantity).compareTo(baseQuantity) > 0) {
            throw new IllegalStateException("追溯包装可恢复数量不足或当前状态不允许退回");
        }
        remainingBaseQuantity = remainingBaseQuantity.add(quantity); stockBinId = binId;
        status = remainingBaseQuantity.compareTo(baseQuantity) == 0 ? "OPENED" : "PARTIALLY_ISSUED";
        currentDocumentType = documentType; currentDocumentId = documentId; currentDocumentNo = documentNo;
        touch(actorId);
    }

    public void dispatch(Long documentId, String documentNo, Long actorId) {
        require("AVAILABLE"); status = "IN_TRANSIT"; currentDocumentType = "STOCK_TRANSFER";
        currentDocumentId = documentId; currentDocumentNo = documentNo; stockBinId = null; touch(actorId);
    }

    public void transferReceive(Long siteId, Long binId, Long stockItemId, String targetStatus,
                                Long documentId, String documentNo, Long actorId) {
        require("IN_TRANSIT"); if (!"AVAILABLE".equals(targetStatus) && !"DAMAGED".equals(targetStatus)) {
            throw new IllegalStateException("调拨追溯码目标状态不受支持");
        }
        this.stockSiteId = siteId; this.stockBinId = binId; this.stockItemId = stockItemId; this.status = targetStatus;
        this.currentDocumentType = "STOCK_TRANSFER"; this.currentDocumentId = documentId;
        this.currentDocumentNo = documentNo; touch(actorId);
    }

    public void returnFromDispense(Long binId, String targetStatus, Long documentId, String documentNo, Long actorId) {
        require("ISSUED");
        if (!Set.of("AVAILABLE", "QUARANTINED", "DAMAGED").contains(targetStatus)) {
            throw new IllegalStateException("退药追溯码目标状态不受支持");
        }
        remainingBaseQuantity = baseQuantity; stockBinId = binId; status = targetStatus; currentDocumentType = "MEDICATION_RETURN";
        currentDocumentId = documentId; currentDocumentNo = documentNo; touch(actorId);
    }

    private void require(String expected) {
        if (!expected.equals(status)) throw new IllegalStateException("追溯码当前状态不允许此操作：" + status);
    }
    private void touch(Long actorId) { updatedAt = Instant.now(); updatedBy = actorId; }

    public Long id() { return id; } public long revision() { return revision; }
    public Long tenantId() { return tenantId; } public Long organizationId() { return organizationId; }
    public Long stockSiteId() { return stockSiteId; } public Long stockBinId() { return stockBinId; }
    public Long stockItemId() { return stockItemId; } public Long stockLotId() { return stockLotId; }
    public Long goodsReceiptLineId() { return goodsReceiptLineId; } public String traceCode() { return traceCode; }
    public String normalizedCode() { return normalizedCode; } public BigDecimal packageQuantity() { return packageQuantity; }
    public String productCodeSnapshot() { return productCodeSnapshot; }
    public String productNameSnapshot() { return productNameSnapshot; } public String lotNoSnapshot() { return lotNoSnapshot; }
    public BigDecimal baseQuantity() { return baseQuantity; } public BigDecimal remainingBaseQuantity() { return remainingBaseQuantity; }
    public String status() { return status; }
    public String currentDocumentType() { return currentDocumentType; } public Long currentDocumentId() { return currentDocumentId; }
    public String currentDocumentNo() { return currentDocumentNo; } public Instant receivedAt() { return receivedAt; }
    public Instant issuedAt() { return issuedAt; } public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; } public Long updatedBy() { return updatedBy; }
}
