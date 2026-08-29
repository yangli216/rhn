package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "charge_items")
public class ChargeItem {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "patient_account_id", nullable = false) private Long patientAccountId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "request_id") private Long requestId;
    @Column(name = "care_event_id") private Long careEventId;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "source_type", nullable = false) private String sourceType;
    @Column(name = "source_id", nullable = false) private Long sourceId;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(nullable = false) private String status;
    @Column(nullable = false, precision = 28, scale = 8) private BigDecimal quantity;
    @Column(name = "unit_code", nullable = false) private String unitCode;
    @Column(name = "unit_price", nullable = false, precision = 24, scale = 6) private BigDecimal unitPrice;
    @Column(name = "total_amount", nullable = false, precision = 24, scale = 6) private BigDecimal totalAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "price_id") private Long priceId;
    @Column(name = "price_revision") private Long priceRevision;
    @Column(name = "price_type") private String priceType;
    @Column(name = "item_code_snapshot", nullable = false) private String itemCodeSnapshot;
    @Column(name = "item_name_snapshot", nullable = false) private String itemNameSnapshot;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "entered_by", nullable = false) private Long enteredBy;
    @Column(name = "reverses_charge_item_id") private Long reversesChargeItemId;

    protected ChargeItem() {}

    public ChargeItem(Long tenantId, Long patientAccountId, Long residentId, Long encounterId, Long requestId,
                      Long catalogItemId, String sourceType, Long sourceId, String requestCode,
                      BigDecimal quantity, String unitCode, BigDecimal unitPrice, BigDecimal totalAmount,
                      String currencyCode, Long priceId, Long priceRevision, String priceType,
                      String itemCodeSnapshot, String itemNameSnapshot, Instant occurredAt,
                      Long enteredBy, Long reversesChargeItemId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.patientAccountId = patientAccountId;
        this.residentId = residentId; this.encounterId = encounterId; this.requestId = requestId;
        this.catalogItemId = catalogItemId; this.sourceType = sourceType; this.sourceId = sourceId;
        this.requestCode = requestCode; this.status = "POSTED"; this.quantity = quantity;
        this.unitCode = unitCode; this.unitPrice = unitPrice; this.totalAmount = totalAmount;
        this.currencyCode = currencyCode; this.priceId = priceId; this.priceRevision = priceRevision;
        this.priceType = priceType; this.itemCodeSnapshot = itemCodeSnapshot;
        this.itemNameSnapshot = itemNameSnapshot; this.occurredAt = occurredAt; this.enteredBy = enteredBy;
        this.reversesChargeItemId = reversesChargeItemId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long patientAccountId() { return patientAccountId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long requestId() { return requestId; }
    public Long catalogItemId() { return catalogItemId; }
    public String sourceType() { return sourceType; }
    public Long sourceId() { return sourceId; }
    public String requestCode() { return requestCode; }
    public String status() { return status; }
    public BigDecimal quantity() { return quantity; }
    public String unitCode() { return unitCode; }
    public BigDecimal unitPrice() { return unitPrice; }
    public BigDecimal totalAmount() { return totalAmount; }
    public String currencyCode() { return currencyCode; }
    public Long priceId() { return priceId; }
    public Long priceRevision() { return priceRevision; }
    public String priceType() { return priceType; }
    public String itemCodeSnapshot() { return itemCodeSnapshot; }
    public String itemNameSnapshot() { return itemNameSnapshot; }
    public Instant occurredAt() { return occurredAt; }
    public Long enteredBy() { return enteredBy; }
    public Long reversesChargeItemId() { return reversesChargeItemId; }
}
