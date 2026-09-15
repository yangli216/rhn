package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.math.BigDecimal;

@Entity
@Table(name = "RHN_SUP_INV_TRACE_EVT")
public class InventoryTraceEvent {
    @Id @Column(name = "ID_INV_TRACE_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_INV_TRACE_CODE", nullable = false) private Long traceCodeId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_FROM_STATUS") private String fromStatus;
    @Column(name = "SD_TO_STATUS", nullable = false) private String toStatus;
    @Column(name = "ID_STOCK_SITE_FROM") private Long fromSiteId;
    @Column(name = "ID_STOCK_SITE_TO") private Long toSiteId;
    @Column(name = "ID_STOCK_BIN_FROM") private Long fromBinId;
    @Column(name = "ID_STOCK_BIN_TO") private Long toBinId;
    @Column(name = "SD_DOC_TYPE", nullable = false) private String documentType;
    @Column(name = "ID_DOC", nullable = false) private Long documentId;
    @Column(name = "CD_DOC_NO", nullable = false) private String documentNo;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "QTY_DELTA", nullable = false, precision = 28, scale = 8) private BigDecimal quantityDelta;
    @Column(name = "BALANCE_AFTER", nullable = false, precision = 28, scale = 8) private BigDecimal balanceAfter;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_OCCURRED", nullable = false) private Long occurredBy;

    protected InventoryTraceEvent() {}
    public InventoryTraceEvent(Long tenantId, Long organizationId, Long traceCodeId, String eventType,
                               String fromStatus, String toStatus, Long fromSiteId, Long toSiteId,
                               Long fromBinId, Long toBinId, String documentType, Long documentId,
                               String documentNo, String reason, BigDecimal quantityDelta,
                               BigDecimal balanceAfter, Long actorId) {
        this(tenantId, organizationId, traceCodeId, eventType, fromStatus, toStatus, fromSiteId, toSiteId,
                fromBinId, toBinId, documentType, documentId, documentNo, reason, quantityDelta,
                balanceAfter, Instant.now(), actorId);
    }
    public InventoryTraceEvent(Long tenantId, Long organizationId, Long traceCodeId, String eventType,
                               String fromStatus, String toStatus, Long fromSiteId, Long toSiteId,
                               Long fromBinId, Long toBinId, String documentType, Long documentId,
                               String documentNo, String reason, BigDecimal quantityDelta,
                               BigDecimal balanceAfter, Instant occurredAt, Long actorId) {
        id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.traceCodeId = traceCodeId; this.eventType = eventType; this.fromStatus = fromStatus;
        this.toStatus = toStatus; this.fromSiteId = fromSiteId; this.toSiteId = toSiteId;
        this.fromBinId = fromBinId; this.toBinId = toBinId; this.documentType = documentType;
        this.documentId = documentId; this.documentNo = documentNo; this.reason = reason;
        this.quantityDelta = quantityDelta; this.balanceAfter = balanceAfter;
        this.occurredAt = occurredAt; this.occurredBy = actorId;
    }
    public Long id() { return id; } public Long traceCodeId() { return traceCodeId; }
    public String eventType() { return eventType; } public String fromStatus() { return fromStatus; }
    public String toStatus() { return toStatus; } public Long fromSiteId() { return fromSiteId; }
    public Long toSiteId() { return toSiteId; } public Long fromBinId() { return fromBinId; }
    public Long toBinId() { return toBinId; } public String documentType() { return documentType; }
    public Long documentId() { return documentId; } public String documentNo() { return documentNo; }
    public String reason() { return reason; } public Instant occurredAt() { return occurredAt; }
    public BigDecimal quantityDelta() { return quantityDelta; } public BigDecimal balanceAfter() { return balanceAfter; }
    public Long occurredBy() { return occurredBy; }
}
