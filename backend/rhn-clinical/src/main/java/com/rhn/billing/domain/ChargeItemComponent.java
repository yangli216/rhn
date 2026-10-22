package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BIL_CHARGE_ITEM_COMP")
public class ChargeItemComponent {
    @Id @Column(name = "ID_CHARGE_ITEM_COMP") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CHARGE_ITEM", nullable = false) private Long chargeItemId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Column(name = "CD_ITEM_SNAP") private String itemCodeSnapshot;
    @Column(name = "NA_ITEM_SNAP", nullable = false) private String itemNameSnapshot;
    @Column(name = "CD_BODY_SITE") private String bodySiteCode;
    @Column(name = "QTY_COMP", nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(name = "CD_UNIT") private String unitCode;
    @Column(name = "UNIT_FACTOR", precision = 28, scale = 8) private BigDecimal unitFactor;
    @Column(name = "PRICE_UNIT", nullable = false, precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "AMT_COMP", nullable = false, precision = 24, scale = 6) private BigDecimal amount;

    protected ChargeItemComponent() {}

    public ChargeItemComponent(Long tenantId, Long chargeItemId, Long catalogItemId, String itemCodeSnapshot,
                               String itemNameSnapshot, BigDecimal quantity, String unitCode,
                               BigDecimal unitFactor, BigDecimal unitPrice, BigDecimal amount) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.chargeItemId = chargeItemId; this.lineNo = 1;
        this.catalogItemId = catalogItemId; this.itemCodeSnapshot = itemCodeSnapshot;
        this.itemNameSnapshot = itemNameSnapshot; this.quantity = quantity; this.unitCode = unitCode;
        this.unitFactor = unitFactor; this.unitPrice = unitPrice; this.amount = amount;
    }

    /** 带行号与检查部位的收费构成；按部位计价的检查每个部位一行。 */
    public ChargeItemComponent(Long tenantId, Long chargeItemId, int lineNo, Long catalogItemId, String itemCodeSnapshot,
                               String itemNameSnapshot, String bodySiteCode, BigDecimal quantity, String unitCode,
                               BigDecimal unitFactor, BigDecimal unitPrice, BigDecimal amount) {
        this(tenantId, chargeItemId, catalogItemId, itemCodeSnapshot, itemNameSnapshot, quantity, unitCode,
                unitFactor, unitPrice, amount);
        this.lineNo = lineNo;
        this.bodySiteCode = bodySiteCode;
    }

    public int lineNo() { return lineNo; }
    public String bodySiteCode() { return bodySiteCode; }
    public BigDecimal quantity() { return quantity; }
    public BigDecimal amount() { return amount; }
}
