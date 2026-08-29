package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "insurance_claim_lines")
public class InsuranceClaimLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "claim_id", nullable = false) private Long claimId;
    @Column(name = "settlement_line_id", nullable = false) private Long settlementLineId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(name = "item_code", nullable = false) private String itemCode;
    @Column(name = "insurance_item_code", nullable = false) private String insuranceItemCode;
    @Column(name = "item_name_snapshot", nullable = false) private String itemNameSnapshot;
    @Column(name = "category_code", nullable = false) private String categoryCode;
    @Column(nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(name = "unit_price", nullable = false, precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "claimed_amount", nullable = false, precision = 24, scale = 6) private BigDecimal claimedAmount;
    @Column(name = "approved_amount", precision = 24, scale = 6) private BigDecimal approvedAmount;
    @Column(name = "rejection_code") private String rejectionCode;
    @Column(name = "trace_attributes_json") private String traceAttributesJson;

    protected InsuranceClaimLine() {}
    public InsuranceClaimLine(Long tenantId, Long claimId, Long settlementLineId, int lineNo, String itemCode,
                              String insuranceItemCode, String itemName, String categoryCode, BigDecimal quantity,
                              BigDecimal unitPrice, BigDecimal claimedAmount, String traceAttributesJson) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.claimId = claimId; this.settlementLineId = settlementLineId;
        this.lineNo = lineNo; this.itemCode = itemCode; this.insuranceItemCode = insuranceItemCode;
        this.itemNameSnapshot = itemName; this.categoryCode = categoryCode; this.quantity = quantity;
        this.unitPrice = unitPrice; this.claimedAmount = claimedAmount; this.traceAttributesJson = traceAttributesJson;
    }
    public Long id() { return id; } public Long settlementLineId() { return settlementLineId; } public int lineNo() { return lineNo; }
    public String itemCode() { return itemCode; } public String insuranceItemCode() { return insuranceItemCode; }
    public String itemName() { return itemNameSnapshot; } public String categoryCode() { return categoryCode; }
    public BigDecimal quantity() { return quantity; } public BigDecimal unitPrice() { return unitPrice; }
    public BigDecimal claimedAmount() { return claimedAmount; } public BigDecimal approvedAmount() { return approvedAmount; }
    public String rejectionCode() { return rejectionCode; } public String traceAttributesJson() { return traceAttributesJson; }
}
