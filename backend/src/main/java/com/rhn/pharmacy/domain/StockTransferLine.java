package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;

@Entity
@Table(name = "stock_transfer_lines")
public class StockTransferLine {
    @Id private Long id; @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "stock_transfer_id", nullable = false) private Long stockTransferId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "source_stock_item_id", nullable = false) private Long sourceStockItemId;
    @Column(name = "destination_stock_item_id", nullable = false) private Long destinationStockItemId;
    @Column(name = "requested_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal requestedQuantity;
    @Column(name = "approved_quantity", precision = 28, scale = 8) private BigDecimal approvedQuantity;
    @Column(name = "dispatched_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal dispatchedQuantity;
    @Column(name = "received_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal receivedQuantity;
    @Column(name = "damaged_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal damagedQuantity;
    @Column(name = "base_unit_code", nullable = false) private String baseUnitCode;
    @Column(name = "line_status", nullable = false) private String lineStatus;
    @Column(name = "discrepancy_reason") private String discrepancyReason;
    protected StockTransferLine() {}
    public StockTransferLine(Long tenantId, Long transferId, int sortOrder, Long sourceItemId, Long destinationItemId,
                             BigDecimal requestedQuantity, String baseUnitCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockTransferId = transferId; this.sortOrder = sortOrder;
        this.sourceStockItemId = sourceItemId; this.destinationStockItemId = destinationItemId;
        this.requestedQuantity = requestedQuantity; this.dispatchedQuantity = BigDecimal.ZERO;
        this.receivedQuantity = BigDecimal.ZERO; this.damagedQuantity = BigDecimal.ZERO;
        this.baseUnitCode = baseUnitCode; this.lineStatus = "REQUESTED";
    }
    public void approve(BigDecimal quantity) {
        if (quantity == null || quantity.signum() < 0 || quantity.compareTo(requestedQuantity) > 0) throw new IllegalStateException("调拨批准数量必须在零和申请数量之间");
        approvedQuantity = quantity; lineStatus = quantity.signum() == 0 ? "REJECTED" : "APPROVED";
    }
    public void markPicking() { if (!"APPROVED".equals(lineStatus)) throw new IllegalStateException("未批准明细不能拣货"); lineStatus = "PICKING"; }
    public void markDispatched() { if (!"PICKING".equals(lineStatus)) throw new IllegalStateException("未拣货明细不能调出"); dispatchedQuantity = approvedQuantity; lineStatus = "IN_TRANSIT"; }
    public void complete(BigDecimal received, BigDecimal damaged, String reason) {
        if (!"IN_TRANSIT".equals(lineStatus) || received == null || damaged == null || received.signum() < 0 || damaged.signum() < 0 || received.add(damaged).compareTo(dispatchedQuantity) != 0) throw new IllegalStateException("调入数量与破损数量之和必须等于调出数量");
        if (damaged.signum() > 0 && (reason == null || reason.isBlank())) throw new IllegalStateException("存在破损差异时必须填写原因");
        receivedQuantity = received; damagedQuantity = damaged; discrepancyReason = reason; lineStatus = "COMPLETED";
    }
    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long stockTransferId() { return stockTransferId; } public int sortOrder() { return sortOrder; }
    public Long sourceStockItemId() { return sourceStockItemId; } public Long destinationStockItemId() { return destinationStockItemId; }
    public BigDecimal requestedQuantity() { return requestedQuantity; } public BigDecimal approvedQuantity() { return approvedQuantity; }
    public BigDecimal dispatchedQuantity() { return dispatchedQuantity; } public BigDecimal receivedQuantity() { return receivedQuantity; }
    public BigDecimal damagedQuantity() { return damagedQuantity; } public String baseUnitCode() { return baseUnitCode; }
    public String lineStatus() { return lineStatus; } public String discrepancyReason() { return discrepancyReason; }
}
