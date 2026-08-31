package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Entity
@Table(name = "ward_delivery_lines")
public class WardDeliveryLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "delivery_id", nullable = false) private Long deliveryId;
    @Column(name = "dispense_id", nullable = false) private Long dispenseId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "resident_name_snapshot", nullable = false) private String residentNameSnapshot;
    @Column(name = "medication_name_snapshot", nullable = false) private String medicationNameSnapshot;
    @Column(name = "expected_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal expectedQuantity;
    @Column(name = "received_quantity", nullable = false, precision = 28, scale = 8) private BigDecimal receivedQuantity;
    @Column(name = "unit_code", nullable = false) private String unitCode;
    @Column(nullable = false) private String status;
    @Column(name = "discrepancy_code") private String discrepancyCode;
    @Column(name = "discrepancy_note") private String discrepancyNote;

    protected WardDeliveryLine() {}

    public WardDeliveryLine(Long tenantId, Long deliveryId, Long dispenseId, Long residentId, Long encounterId,
                            String residentNameSnapshot, String medicationNameSnapshot,
                            BigDecimal expectedQuantity, String unitCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.deliveryId = deliveryId;
        this.dispenseId = dispenseId; this.residentId = residentId; this.encounterId = encounterId;
        this.residentNameSnapshot = residentNameSnapshot; this.medicationNameSnapshot = medicationNameSnapshot;
        this.expectedQuantity = expectedQuantity; this.receivedQuantity = BigDecimal.ZERO;
        this.unitCode = unitCode; this.status = "PENDING";
    }

    public boolean receive(BigDecimal quantity, String exceptionCode, String note) {
        if (quantity == null || quantity.signum() < 0 || quantity.compareTo(expectedQuantity) > 0) {
            throw badRequest("WARD_DELIVERY_RECEIPT_QUANTITY_INVALID", "病区签收数量必须在零到应收数量之间");
        }
        String code = clean(exceptionCode);
        if (quantity.compareTo(expectedQuantity) == 0 && code == null) {
            status = "MATCHED"; discrepancyCode = null; discrepancyNote = null;
        } else if (quantity.compareTo(expectedQuantity) < 0) {
            status = "SHORTAGE"; discrepancyCode = code == null ? "SHORTAGE" : code; discrepancyNote = clean(note);
        } else {
            status = "REJECTED"; discrepancyCode = code; discrepancyNote = clean(note);
        }
        receivedQuantity = quantity;
        if (!"MATCHED".equals(status) && discrepancyNote == null) {
            throw badRequest("WARD_DELIVERY_DISCREPANCY_NOTE_REQUIRED", "签收数量或实物不一致时必须填写差异说明");
        }
        return !"MATCHED".equals(status);
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long deliveryId() { return deliveryId; }
    public Long dispenseId() { return dispenseId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public String residentNameSnapshot() { return residentNameSnapshot; }
    public String medicationNameSnapshot() { return medicationNameSnapshot; }
    public BigDecimal expectedQuantity() { return expectedQuantity; }
    public BigDecimal receivedQuantity() { return receivedQuantity; }
    public String unitCode() { return unitCode; }
    public String status() { return status; }
    public String discrepancyCode() { return discrepancyCode; }
    public String discrepancyNote() { return discrepancyNote; }
}
