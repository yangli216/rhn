package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Entity
@Table(name = "RHN_SUP_WARD_DELIV_LINE")
public class WardDeliveryLine {
    @Id @Column(name = "ID_WARD_DELIV_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_WARD_DELIV", nullable = false) private Long deliveryId;
    @Column(name = "ID_MED_DISP", nullable = false) private Long dispenseId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "NA_PAT_SNAP", nullable = false) private String residentNameSnapshot;
    @Column(name = "NA_MED_SNAP", nullable = false) private String medicationNameSnapshot;
    @Column(name = "QTY_EXPCTD", nullable = false, precision = 28, scale = 8) private BigDecimal expectedQuantity;
    @Column(name = "QTY_RECVD", nullable = false, precision = 28, scale = 8) private BigDecimal receivedQuantity;
    @Column(name = "CD_UNIT", nullable = false) private String unitCode;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private WardDeliveryLineStatus status;
    @Column(name = "CD_DSCRPN") private String discrepancyCode;
    @Column(name = "DES_DSCRPN_NOTE") private String discrepancyNote;

    protected WardDeliveryLine() {}

    public WardDeliveryLine(Long tenantId, Long deliveryId, Long dispenseId, Long residentId, Long encounterId,
                            String residentNameSnapshot, String medicationNameSnapshot,
                            BigDecimal expectedQuantity, String unitCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.deliveryId = deliveryId;
        this.dispenseId = dispenseId; this.residentId = residentId; this.encounterId = encounterId;
        this.residentNameSnapshot = residentNameSnapshot; this.medicationNameSnapshot = medicationNameSnapshot;
        this.expectedQuantity = expectedQuantity; this.receivedQuantity = BigDecimal.ZERO;
        this.unitCode = unitCode; this.status = WardDeliveryLineStatus.PENDING;
    }

    public boolean receive(BigDecimal quantity, String exceptionCode, String note) {
        if (quantity == null || quantity.signum() < 0 || quantity.compareTo(expectedQuantity) > 0) {
            throw badRequest("WARD_DELIVERY_RECEIPT_QUANTITY_INVALID", "病区签收数量必须在零到应收数量之间");
        }
        String code = Strings.trimToNull(exceptionCode);
        if (quantity.compareTo(expectedQuantity) == 0 && code == null) {
            status = WardDeliveryLineStatus.MATCHED; discrepancyCode = null; discrepancyNote = null;
        } else if (quantity.compareTo(expectedQuantity) < 0) {
            status = WardDeliveryLineStatus.SHORTAGE; discrepancyCode = code == null ? "SHORTAGE" : code; discrepancyNote = Strings.trimToNull(note);
        } else {
            status = WardDeliveryLineStatus.REJECTED; discrepancyCode = code; discrepancyNote = Strings.trimToNull(note);
        }
        receivedQuantity = quantity;
        if (status != WardDeliveryLineStatus.MATCHED && discrepancyNote == null) {
            throw badRequest("WARD_DELIVERY_DISCREPANCY_NOTE_REQUIRED", "签收数量或实物不一致时必须填写差异说明");
        }
        return status != WardDeliveryLineStatus.MATCHED;
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
    public WardDeliveryLineStatus status() { return status; }
    public String discrepancyCode() { return discrepancyCode; }
    public String discrepancyNote() { return discrepancyNote; }
}
