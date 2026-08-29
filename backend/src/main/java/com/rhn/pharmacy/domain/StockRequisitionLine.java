package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;

@Entity
@Table(name = "stock_requisition_lines")
public class StockRequisitionLine {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "stock_requisition_id", nullable = false) private Long stockRequisitionId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "stock_item_id", nullable = false) private Long stockItemId;
    @Column(name = "requested_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal requestedQuantity;
    @Column(name = "approved_quantity", precision = 28, scale = 8) private BigDecimal approvedQuantity;
    @Column(name = "issued_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal issuedQuantity;
    @Column(name = "base_unit_code", nullable = false) private String baseUnitCode;
    @Column(name = "line_status", nullable = false) private String lineStatus;
    @Column private String description;

    protected StockRequisitionLine() {}

    public StockRequisitionLine(Long tenantId, Long requisitionId, int sortOrder, Long stockItemId,
                                BigDecimal requestedQuantity, String baseUnitCode, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.stockRequisitionId = requisitionId;
        this.sortOrder = sortOrder; this.stockItemId = stockItemId; this.requestedQuantity = requestedQuantity;
        this.issuedQuantity = BigDecimal.ZERO; this.baseUnitCode = baseUnitCode; this.lineStatus = "REQUESTED";
        this.description = description;
    }
    public void approve(BigDecimal quantity) {
        if (quantity == null || quantity.signum() < 0 || quantity.compareTo(requestedQuantity) > 0) {
            throw new IllegalStateException("批准数量必须在零和申请数量之间");
        }
        approvedQuantity = quantity; lineStatus = quantity.signum() == 0 ? "REJECTED" : "APPROVED";
    }
    public void markPicking() {
        if (!"APPROVED".equals(lineStatus)) throw new IllegalStateException("未批准的请领明细不能拣货");
        lineStatus = "PICKING";
    }
    public void markIssued() {
        if (!"PICKING".equals(lineStatus)) throw new IllegalStateException("未完成拣货的请领明细不能出库");
        issuedQuantity = approvedQuantity; lineStatus = "ISSUED";
    }
    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long stockRequisitionId() { return stockRequisitionId; }
    public int sortOrder() { return sortOrder; }
    public Long stockItemId() { return stockItemId; }
    public BigDecimal requestedQuantity() { return requestedQuantity; }
    public BigDecimal approvedQuantity() { return approvedQuantity; }
    public BigDecimal issuedQuantity() { return issuedQuantity; }
    public String baseUnitCode() { return baseUnitCode; }
    public String lineStatus() { return lineStatus; }
    public String description() { return description; }
}
