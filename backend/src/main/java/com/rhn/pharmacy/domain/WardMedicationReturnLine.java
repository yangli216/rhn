package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_SUP_WARD_MED_RETURN_LINE")
public class WardMedicationReturnLine {
    @Id @Column(name = "ID_WARD_MED_RETURN_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_WARD_MED_RETURN_REQ", nullable = false) private Long returnRequestId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_MED_DISP_ORIGINAL", nullable = false) private Long originalDispenseId;
    @Column(name = "ID_MED_DISP_LINE_ORIGINAL", nullable = false) private Long originalDispenseLineId;
    @Column(name = "ID_DISP_TASK_LINE", nullable = false) private Long dispenseTaskLineId;
    @Column(name = "NA_MED_SNAP", nullable = false) private String medicationNameSnapshot;
    @Column(name = "QTY_REQUESTED", nullable = false, precision = 28, scale = 8) private BigDecimal requestedQuantity;
    @Column(name = "CD_UNIT", nullable = false) private String unitCode;
    @Column(name = "QTY_REQUESTED_BASE", nullable = false, precision = 28, scale = 8)
    private BigDecimal requestedBaseQuantity;
    @Column(name = "CD_BASE_UNIT", nullable = false) private String baseUnitCode;
    @Column(name = "SD_DISPOSITION") private String disposition;
    @Column(name = "ID_STOCK_RETURN") private Long stockReturnId;
    @Column(name = "ID_MED_DISP_RETURN") private Long returnDispenseId;

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
