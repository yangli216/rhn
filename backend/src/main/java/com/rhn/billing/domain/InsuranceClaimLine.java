package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_INS_CLAIM_LINE")
public class InsuranceClaimLine {
    @Id @Column(name = "ID_INS_CLAIM_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INS_CLAIM", nullable = false) private Long claimId;
    @Column(name = "ID_STL_LINE", nullable = false) private Long settlementLineId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "CD_ITEM", nullable = false) private String itemCode;
    @Column(name = "CD_INS_ITEM", nullable = false) private String insuranceItemCode;
    @Column(name = "NA_ITEM_SNAP", nullable = false) private String itemNameSnapshot;
    @Column(name = "CD_CAT", nullable = false) private String categoryCode;
    @Column(name = "QTY_CLAIM", nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(name = "PRICE_UNIT", nullable = false, precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "AMT_CLAIMED", nullable = false, precision = 24, scale = 6) private BigDecimal claimedAmount;
    @Column(name = "AMT_APPROVED", precision = 24, scale = 6) private BigDecimal approvedAmount;
    @Column(name = "CD_REJECTION") private String rejectionCode;
    @Column(name = "JSON_TRACE_ATTR") private String traceAttributesJson;

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
