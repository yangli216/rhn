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
@Table(name = "RHN_EX_TREAT_EXEC_ITEM")
public class TreatmentExecutionItem {
    @Id @Column(name = "ID_TREAT_EXEC_ITEM") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_TREAT_EXEC_TASK", nullable = false) private Long taskId;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "ID_CARE_REQ_SRC", nullable = false) private Long sourceId;
    @Column(name = "ID_CARE_REQ_PARENT_SRC") private Long parentSourceId;
    @Column(name = "CD_REQ_NO", nullable = false) private String requestNo;
    @Column(name = "CD_ITEM_SNAP", nullable = false) private String itemCodeSnapshot;
    @Column(name = "NA_ITEM_SNAP", nullable = false) private String itemNameSnapshot;
    @Column(name = "QTY_DOSE_VAL", precision = 28, scale = 8) private BigDecimal doseValue;
    @Column(name = "DOSE_UNIT") private String doseUnit;
    @Column(name = "CD_ROUTE") private String routeCode;
    @Column(name = "CD_FREQ") private String frequencyCode;
    @Column(name = "ID_ORDER_FREQ") private Long frequencyId;
    @Column(name = "NA_FREQ_SNAP") private String frequencyNameSnapshot;
    @Lob @Column(name = "FREQUENCY_RULE_SNAPSHOT") private String frequencyRuleSnapshot;
    @Column(name = "QTY_DURATION_VAL", precision = 12, scale = 3) private BigDecimal durationValue;
    @Column(name = "DURATION_UNIT") private String durationUnit;
    @Column(name = "FG_SKIN_TEST_REQUIRED", nullable = false) private boolean skinTestRequired;
    @Column(name = "FG_STL_REQUIRED", nullable = false) private boolean settlementRequired;
    @Column(name = "ID_STL") private Long settlementId;
    @Column(name = "FG_FULFILL_REQUIRED", nullable = false) private boolean fulfillmentRequired;
    @Column(name = "ID_FULFILL") private Long fulfillmentId;
    @Column(name = "SD_FULFILL_STATUS") private String fulfillmentStatus;
    @Column(name = "DT_CANCELLED") private Instant cancelledAt;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

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
