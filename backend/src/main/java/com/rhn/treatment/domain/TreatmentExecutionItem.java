package com.rhn.treatment.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "treatment_execution_items")
public class TreatmentExecutionItem {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "task_id", nullable = false) private Long taskId;
    @Column(name = "source_type", nullable = false) private String sourceType;
    @Column(name = "source_id", nullable = false) private Long sourceId;
    @Column(name = "parent_source_id") private Long parentSourceId;
    @Column(name = "request_no", nullable = false) private String requestNo;
    @Column(name = "item_code_snapshot", nullable = false) private String itemCodeSnapshot;
    @Column(name = "item_name_snapshot", nullable = false) private String itemNameSnapshot;
    @Column(name = "dose_value", precision = 28, scale = 8) private BigDecimal doseValue;
    @Column(name = "dose_unit") private String doseUnit;
    @Column(name = "route_code") private String routeCode;
    @Column(name = "frequency_code") private String frequencyCode;
    @Column(name = "frequency_id") private Long frequencyId;
    @Column(name = "frequency_name_snapshot") private String frequencyNameSnapshot;
    @Lob @Column(name = "frequency_rule_snapshot") private String frequencyRuleSnapshot;
    @Column(name = "duration_value", precision = 12, scale = 3) private BigDecimal durationValue;
    @Column(name = "duration_unit") private String durationUnit;
    @Column(name = "skin_test_required", nullable = false) private boolean skinTestRequired;
    @Column(name = "settlement_required", nullable = false) private boolean settlementRequired;
    @Column(name = "settlement_id") private Long settlementId;
    @Column(name = "fulfillment_required", nullable = false) private boolean fulfillmentRequired;
    @Column(name = "fulfillment_id") private Long fulfillmentId;
    @Column(name = "fulfillment_status") private String fulfillmentStatus;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected TreatmentExecutionItem() {}

    public TreatmentExecutionItem(Long tenantId, Long taskId, String sourceType, Long sourceId,
                                  Long parentSourceId, String requestNo, String itemCode, String itemName,
                                  BigDecimal doseValue, String doseUnit, String routeCode, String frequencyCode,
                                  Long frequencyId, String frequencyName, String frequencyRule,
                                  BigDecimal durationValue, String durationUnit, boolean skinTestRequired,
                                  boolean settlementRequired, boolean fulfillmentRequired, Instant createdAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.taskId = taskId;
        this.sourceType = sourceType; this.sourceId = sourceId; this.parentSourceId = parentSourceId;
        this.requestNo = requestNo; this.itemCodeSnapshot = itemCode; this.itemNameSnapshot = itemName;
        this.doseValue = doseValue; this.doseUnit = doseUnit; this.routeCode = routeCode;
        this.frequencyCode = frequencyCode; this.frequencyId = frequencyId;
        this.frequencyNameSnapshot = frequencyName; this.frequencyRuleSnapshot = frequencyRule;
        this.durationValue = durationValue; this.durationUnit = durationUnit;
        this.skinTestRequired = skinTestRequired; this.settlementRequired = settlementRequired;
        this.fulfillmentRequired = fulfillmentRequired; this.createdAt = createdAt;
        this.fulfillmentStatus = fulfillmentRequired ? "PENDING" : "NOT_REQUIRED";
    }

    public void authorize(Long settlementId) { this.settlementId = settlementId; }
    public void reverseAuthorization() { this.settlementId = null; }
    public void fulfill(Long fulfillmentId, String status) {
        this.fulfillmentId = fulfillmentId; this.fulfillmentStatus = status == null ? "COMPLETED" : status;
    }
    public void reverseFulfillment(String status) {
        this.fulfillmentId = null; this.fulfillmentStatus = status == null ? "PENDING" : status;
    }
    public void cancel(Instant occurredAt) { this.cancelledAt = occurredAt; }
    public boolean cancelled() { return cancelledAt != null; }
    public boolean settled() { return !settlementRequired || settlementId != null; }
    public boolean fulfilled() { return !fulfillmentRequired || fulfillmentId != null; }
    public boolean ready() { return !cancelled() && settled() && fulfilled(); }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long taskId() { return taskId; }
    public String sourceType() { return sourceType; }
    public Long sourceId() { return sourceId; }
    public Long parentSourceId() { return parentSourceId; }
    public String requestNo() { return requestNo; }
    public String itemCodeSnapshot() { return itemCodeSnapshot; }
    public String itemNameSnapshot() { return itemNameSnapshot; }
    public BigDecimal doseValue() { return doseValue; }
    public String doseUnit() { return doseUnit; }
    public String routeCode() { return routeCode; }
    public String frequencyCode() { return frequencyCode; }
    public Long frequencyId() { return frequencyId; }
    public String frequencyNameSnapshot() { return frequencyNameSnapshot; }
    public String frequencyRuleSnapshot() { return frequencyRuleSnapshot; }
    public BigDecimal durationValue() { return durationValue; }
    public String durationUnit() { return durationUnit; }
    public boolean skinTestRequired() { return skinTestRequired; }
    public boolean settlementRequired() { return settlementRequired; }
    public Long settlementId() { return settlementId; }
    public boolean fulfillmentRequired() { return fulfillmentRequired; }
    public Long fulfillmentId() { return fulfillmentId; }
    public String fulfillmentStatus() { return fulfillmentStatus; }
    public Instant createdAt() { return createdAt; }
}
