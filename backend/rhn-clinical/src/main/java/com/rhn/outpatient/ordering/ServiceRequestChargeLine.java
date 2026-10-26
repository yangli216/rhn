package com.rhn.outpatient.ordering;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** 检查申请开立时快照的一条收费明细；计费按行生成收费事项，物价项、数量与价格来源均不随基础数据变化。 */
@Entity
@Table(name = "RHN_EX_SVC_REQ_CHG")
class ServiceRequestChargeLine {
    @Id @Column(name = "ID_SVC_REQ_CHG") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "SD_CHG_ROLE", nullable = false) private String role;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "CD_ITEM_SNAP", nullable = false) private String itemCode;
    @Column(name = "NA_ITEM_SNAP", nullable = false) private String itemName;
    @Column(name = "CD_UNIT", nullable = false) private String unitCode;
    @Column(name = "QTY_CHARGE", nullable = false) private BigDecimal quantity;
    @Column(name = "ID_PRICE") private Long priceId;
    @Column(name = "SN_PRICE_VER") private Long priceRevision;
    @Column(name = "SD_PRICE_TYPE") private String priceType;
    @Column(name = "PRICE_UNIT", nullable = false) private BigDecimal unitPrice;
    @Column(name = "AMT_TOTAL", nullable = false) private BigDecimal totalAmount;
    @Column(name = "CD_CCY", nullable = false) private String currencyCode;
    @Column(name = "SD_ACCTG_CAT") private String accountingCategory;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected ServiceRequestChargeLine() {}

    ServiceRequestChargeLine(Long tenantId, Long requestId, int lineNo, PricedLine line) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.requestId = requestId;
        this.lineNo = lineNo;
        this.role = line.role();
        this.catalogItemId = line.catalogItemId();
        this.itemCode = line.itemCode();
        this.itemName = line.itemName();
        this.unitCode = line.unitCode();
        this.quantity = line.quantity();
        this.priceId = line.priceId();
        this.priceRevision = line.priceRevision();
        this.priceType = line.priceType();
        this.unitPrice = line.unitPrice();
        this.totalAmount = line.totalAmount();
        this.currencyCode = line.currencyCode();
        this.accountingCategory = line.accountingCategory();
        this.createdAt = Instant.now();
    }

    /** 开立前已定价的收费明细；金额等于单价乘数量。 */
    record PricedLine(String role, Long catalogItemId, String itemCode, String itemName, String unitCode,
                      BigDecimal quantity, Long priceId, Long priceRevision, String priceType,
                      BigDecimal unitPrice, BigDecimal totalAmount, String currencyCode, String accountingCategory) {}

    /** 计费事件 chargeLines 中的一行。 */
    Map<String, Object> eventFact() {
        Map<String, Object> fact = new LinkedHashMap<>();
        fact.put("lineNo", lineNo);
        fact.put("role", role);
        fact.put("catalogItemId", catalogItemId);
        fact.put("itemCode", itemCode);
        fact.put("itemName", itemName);
        fact.put("chargeUnit", unitCode);
        fact.put("quantity", quantity);
        if (priceId != null) fact.put("priceId", priceId);
        if (priceRevision != null) fact.put("priceRevision", priceRevision);
        if (priceType != null) fact.put("priceType", priceType);
        fact.put("unitPrice", unitPrice);
        fact.put("totalAmount", totalAmount);
        if (accountingCategory != null) fact.put("accountingCategory", accountingCategory);
        return fact;
    }

    Long requestId() { return requestId; } int lineNo() { return lineNo; } String role() { return role; }
    Long catalogItemId() { return catalogItemId; } BigDecimal totalAmount() { return totalAmount; }
}
