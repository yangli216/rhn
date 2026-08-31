package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/** Immutable allocation of one pharmacy issue line to a downstream medication administration fact. */
@Entity
@Table(name = "inpatient_med_consumptions")
public class MedicationDispenseConsumption {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "consumer_type", nullable = false) private String consumerType;
    @Column(name = "order_task_id", nullable = false) private Long consumerId;
    @Column(name = "dispense_task_line_id", nullable = false) private Long dispenseTaskLineId;
    @Column(name = "dispense_id", nullable = false) private Long dispenseId;
    @Column(name = "dispense_line_id", nullable = false) private Long dispenseLineId;
    @Column(name = "consumed_quantity", nullable = false, precision = 28, scale = 8)
    private BigDecimal consumedQuantity;
    @Column(name = "dispense_unit_code", nullable = false) private String dispenseUnitCode;
    @Column(name = "consumed_base_quantity", nullable = false, precision = 28, scale = 8)
    private BigDecimal consumedBaseQuantity;
    @Column(name = "base_unit_code", nullable = false) private String baseUnitCode;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "consumed_at", nullable = false) private Instant consumedAt;
    @Column(name = "consumed_by", nullable = false) private Long consumedBy;

    protected MedicationDispenseConsumption() {
    }

    public MedicationDispenseConsumption(Long tenantId, Long requestId, String consumerType, Long consumerId,
                                         Long dispenseTaskLineId, Long dispenseId, Long dispenseLineId,
                                         BigDecimal consumedQuantity, String dispenseUnitCode,
                                         BigDecimal consumedBaseQuantity, String baseUnitCode,
                                         String commandCode, Long consumedBy) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.requestId = requestId;
        this.consumerType = consumerType;
        this.consumerId = consumerId;
        this.dispenseTaskLineId = dispenseTaskLineId;
        this.dispenseId = dispenseId;
        this.dispenseLineId = dispenseLineId;
        this.consumedQuantity = consumedQuantity;
        this.dispenseUnitCode = dispenseUnitCode;
        this.consumedBaseQuantity = consumedBaseQuantity;
        this.baseUnitCode = baseUnitCode;
        this.commandCode = commandCode;
        this.consumedAt = Instant.now();
        this.consumedBy = consumedBy;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long requestId() { return requestId; }
    public String consumerType() { return consumerType; }
    public Long consumerId() { return consumerId; }
    public Long dispenseTaskLineId() { return dispenseTaskLineId; }
    public Long dispenseId() { return dispenseId; }
    public Long dispenseLineId() { return dispenseLineId; }
    public BigDecimal consumedQuantity() { return consumedQuantity; }
    public String dispenseUnitCode() { return dispenseUnitCode; }
    public BigDecimal consumedBaseQuantity() { return consumedBaseQuantity; }
    public String baseUnitCode() { return baseUnitCode; }
    public String commandCode() { return commandCode; }
    public Instant consumedAt() { return consumedAt; }
}
