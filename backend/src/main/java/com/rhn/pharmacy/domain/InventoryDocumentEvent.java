package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_INV_DOC_EVT")
public class InventoryDocumentEvent {
    @Id @Column(name = "ID_INV_DOC_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "SD_DOC_TYPE", nullable = false) private String documentType;
    @Column(name = "ID_DOC", nullable = false) private Long documentId;
    @Column(name = "CD_DOC_NO", nullable = false) private String documentNo;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_FROM_STATUS") private String fromStatus;
    @Column(name = "SD_TO_STATUS", nullable = false) private String toStatus;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "ID_CORRELATION") private String correlationId;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;
    @Column(name = "ID_USER_OCCURRED", nullable = false) private Long occurredBy;

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
