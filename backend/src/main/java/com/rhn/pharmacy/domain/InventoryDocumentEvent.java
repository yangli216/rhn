package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "inventory_document_events")
public class InventoryDocumentEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "document_type", nullable = false) private String documentType;
    @Column(name = "document_id", nullable = false) private Long documentId;
    @Column(name = "document_no", nullable = false) private String documentNo;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "from_status") private String fromStatus;
    @Column(name = "to_status", nullable = false) private String toStatus;
    @Column private String reason;
    @Column(name = "correlation_id") private String correlationId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    @Column(name = "occurred_by", nullable = false) private Long occurredBy;

    protected InventoryDocumentEvent() {}

    public InventoryDocumentEvent(Long tenantId, Long organizationId, String documentType, Long documentId, String documentNo,
                                  String eventType, String fromStatus, String toStatus, Long actorId,
                                  String reason, String correlationId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId; this.documentType = documentType;
        this.documentId = documentId; this.documentNo = documentNo; this.eventType = eventType;
        this.fromStatus = fromStatus; this.toStatus = toStatus; this.occurredAt = Instant.now();
        this.occurredBy = actorId; this.reason = reason; this.correlationId = correlationId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public String documentType() { return documentType; }
    public Long documentId() { return documentId; }
    public String documentNo() { return documentNo; }
    public String eventType() { return eventType; }
    public String fromStatus() { return fromStatus; }
    public String toStatus() { return toStatus; }
    public Instant occurredAt() { return occurredAt; }
    public Long occurredBy() { return occurredBy; }
    public String reason() { return reason; }
    public String correlationId() { return correlationId; }
}
