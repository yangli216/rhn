package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "ward_med_return_lines")
public class WardMedicationReturnLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "return_request_id", nullable = false) private Long returnRequestId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "original_dispense_id", nullable = false) private Long originalDispenseId;
    @Column(name = "original_dispense_line_id", nullable = false) private Long originalDispenseLineId;
    @Column(name = "dispense_task_line_id", nullable = false) private Long dispenseTaskLineId;
    @Column(name = "medication_name_snapshot", nullable = false) private String medicationNameSnapshot;
    @Column(name = "requested_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal requestedQuantity;
    @Column(name = "unit_code", nullable = false) private String unitCode;
    @Column(name = "requested_base_quantity", nullable = false, precision = 28, scale = 8)
    private BigDecimal requestedBaseQuantity;
    @Column(name = "base_unit_code", nullable = false) private String baseUnitCode;
    @Column(name = "disposition") private String disposition;
    @Column(name = "stock_return_id") private Long stockReturnId;
    @Column(name = "return_dispense_id") private Long returnDispenseId;

    protected WardMedicationReturnLine() {
    }

    public WardMedicationReturnLine(WardMedicationReturnRequest request, Long medicationRequestId,
                                    Long originalDispenseId, Long originalDispenseLineId,
                                    Long dispenseTaskLineId, String medicationNameSnapshot,
                                    BigDecimal requestedQuantity, String unitCode,
                                    BigDecimal requestedBaseQuantity, String baseUnitCode) {
        this.id = GlobalIds.next();
        this.tenantId = request.tenantId();
        this.returnRequestId = request.id();
        this.requestId = medicationRequestId;
        this.originalDispenseId = originalDispenseId;
        this.originalDispenseLineId = originalDispenseLineId;
        this.dispenseTaskLineId = dispenseTaskLineId;
        this.medicationNameSnapshot = medicationNameSnapshot;
        this.requestedQuantity = requestedQuantity;
        this.unitCode = unitCode;
        this.requestedBaseQuantity = requestedBaseQuantity;
        this.baseUnitCode = baseUnitCode;
    }

    public void complete(String disposition, Long stockReturnId, Long returnDispenseId) {
        this.disposition = disposition;
        this.stockReturnId = stockReturnId;
        this.returnDispenseId = returnDispenseId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long returnRequestId() { return returnRequestId; }
    public Long requestId() { return requestId; }
    public Long originalDispenseId() { return originalDispenseId; }
    public Long originalDispenseLineId() { return originalDispenseLineId; }
    public Long dispenseTaskLineId() { return dispenseTaskLineId; }
    public String medicationNameSnapshot() { return medicationNameSnapshot; }
    public BigDecimal requestedQuantity() { return requestedQuantity; }
    public String unitCode() { return unitCode; }
    public BigDecimal requestedBaseQuantity() { return requestedBaseQuantity; }
    public String baseUnitCode() { return baseUnitCode; }
    public String disposition() { return disposition; }
    public Long stockReturnId() { return stockReturnId; }
    public Long returnDispenseId() { return returnDispenseId; }
}
