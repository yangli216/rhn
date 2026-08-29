package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.math.BigDecimal;

@Entity
@Table(name = "inventory_trace_events")
public class InventoryTraceEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "trace_code_id", nullable = false) private Long traceCodeId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "from_status") private String fromStatus;
    @Column(name = "to_status", nullable = false) private String toStatus;
    @Column(name = "from_site_id") private Long fromSiteId;
    @Column(name = "to_site_id") private Long toSiteId;
    @Column(name = "from_bin_id") private Long fromBinId;
    @Column(name = "to_bin_id") private Long toBinId;
    @Column(name = "document_type", nullable = false) private String documentType;
    @Column(name = "document_id", nullable = false) private Long documentId;
    @Column(name = "document_no", nullable = false) private String documentNo;
    private String reason;
    @Column(name = "quantity_delta", nullable = false, precision = 28, scale = 8) private BigDecimal quantityDelta;
    @Column(name = "balance_after", nullable = false, precision = 28, scale = 8) private BigDecimal balanceAfter;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "occurred_by", nullable = false) private Long occurredBy;

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
