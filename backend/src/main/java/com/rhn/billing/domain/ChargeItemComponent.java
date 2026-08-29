package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "charge_item_components")
public class ChargeItemComponent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "charge_item_id", nullable = false) private Long chargeItemId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(name = "catalog_item_id") private Long catalogItemId;
    @Column(name = "item_code_snapshot") private String itemCodeSnapshot;
    @Column(name = "item_name_snapshot", nullable = false) private String itemNameSnapshot;
    @Column(name = "body_site_code") private String bodySiteCode;
    @Column(nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(name = "unit_code") private String unitCode;
    @Column(name = "unit_factor", precision = 28, scale = 8) private BigDecimal unitFactor;
    @Column(name = "unit_price", nullable = false, precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(nullable = false, precision = 24, scale = 6) private BigDecimal amount;

    protected ChargeItemComponent() {}

    public ChargeItemComponent(Long tenantId, Long chargeItemId, Long catalogItemId, String itemCodeSnapshot,
                               String itemNameSnapshot, BigDecimal quantity, String unitCode,
                               BigDecimal unitFactor, BigDecimal unitPrice, BigDecimal amount) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.chargeItemId = chargeItemId; this.lineNo = 1;
        this.catalogItemId = catalogItemId; this.itemCodeSnapshot = itemCodeSnapshot;
        this.itemNameSnapshot = itemNameSnapshot; this.quantity = quantity; this.unitCode = unitCode;
        this.unitFactor = unitFactor; this.unitPrice = unitPrice; this.amount = amount;
    }
}
