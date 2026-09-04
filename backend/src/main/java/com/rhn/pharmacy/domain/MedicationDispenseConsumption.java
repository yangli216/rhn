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
@Table(name = "RHN_SUP_INP_MED_CONSUME")
public class MedicationDispenseConsumption {
    @Id @Column(name = "ID_INP_MED_CONSUME") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "SD_CONSUMER_TYPE", nullable = false) private String consumerType;
    @Column(name = "ID_INP_ORDER_TASK", nullable = false) private Long consumerId;
    @Column(name = "ID_DISP_TASK_LINE_DISP", nullable = false) private Long dispenseTaskLineId;
    @Column(name = "ID_MED_DISP", nullable = false) private Long dispenseId;
    @Column(name = "ID_MED_DISP_LINE", nullable = false) private Long dispenseLineId;
    @Column(name = "QTY_CONSUMED", nullable = false, precision = 28, scale = 8)
    private BigDecimal consumedQuantity;
    @Column(name = "CD_DISP_UNIT", nullable = false) private String dispenseUnitCode;
    @Column(name = "QTY_CONSUMED_BASE", nullable = false, precision = 28, scale = 8)
    private BigDecimal consumedBaseQuantity;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DT_CONSUMED", nullable = false) private Instant consumedAt;
    @Column(name = "ID_USER_CONSUMED", nullable = false) private Long consumedBy;

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
