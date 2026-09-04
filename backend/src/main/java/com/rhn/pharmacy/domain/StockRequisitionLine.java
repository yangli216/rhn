package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_SUP_STOCK_REQ_LINE")
public class StockRequisitionLine {
    @Id @Column(name = "ID_STOCK_REQ_LINE") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STOCK_REQ", nullable = false) private Long stockRequisitionId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "ID_STOCK_ITEM", nullable = false) private Long stockItemId;
    @Column(name = "QTY_REQUESTED", nullable = false, precision = 28, scale = 8) private BigDecimal requestedQuantity;
    @Column(name = "QTY_APPROVED", precision = 28, scale = 8) private BigDecimal approvedQuantity;
    @Column(name = "QTY_ISSUED", nullable = false, precision = 28, scale = 8) private BigDecimal issuedQuantity;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "SD_LINE_STATUS", nullable = false) private String lineStatus;
    @Column(name = "DES_STOCK_REQ_LINE") private String description;

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
