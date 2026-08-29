package com.rhn.platform.integration.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "external_messages")
public class ExternalMessage {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "endpoint_code", nullable = false) private String endpointCode;
    @Column(nullable = false) private String direction;
    @Column(name = "message_type", nullable = false) private String messageType;
    @Column(name = "business_message_id", nullable = false) private String businessMessageId;
    @Column(name = "correlation_id") private String correlationId;
    @Column(nullable = false) private String status;
    @Lob @Column(name = "payload_json", nullable = false) private String payloadJson;
    @Column(name = "payload_digest_algorithm", nullable = false) private String payloadDigestAlgorithm;
    @Column(name = "payload_digest", nullable = false) private String payloadDigest;
    @Column(name = "related_resource_type") private String relatedResourceType;
    @Column(name = "related_resource_id") private Long relatedResourceId;
    @Column(name = "related_resource_version") private Long relatedResourceVersion;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "sent_at") private Instant sentAt;
    @Column(name = "received_at") private Instant receivedAt;
    @Column(name = "processed_at") private Instant processedAt;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "error_message") private String errorMessage;

    protected ExternalMessage() {}

    public static ExternalMessage outbound(Long tenantId, String endpointCode, String messageType,
                                           String businessMessageId, String correlationId,
                                           Long organizationId, Long departmentId,
                                           String payloadJson, String digest,
                                           String resourceType, Long resourceId, long resourceVersion) {
        return new ExternalMessage(tenantId, organizationId, departmentId, endpointCode, "OUTBOUND", messageType, businessMessageId,
                correlationId, "PENDING", payloadJson, digest, resourceType, resourceId, resourceVersion);
    }

    public static ExternalMessage inbound(Long tenantId, String endpointCode, String messageType,
                                          String businessMessageId, String correlationId,
                                          Long organizationId, Long departmentId,
                                          String payloadJson, String digest) {
        ExternalMessage value = new ExternalMessage(tenantId, organizationId, departmentId, endpointCode, "INBOUND", messageType,
                businessMessageId, correlationId, "RECEIVED", payloadJson, digest, null, null, null);
        value.receivedAt = value.createdAt;
        return value;
    }

    private ExternalMessage(Long tenantId, Long organizationId, Long departmentId,
                            String endpointCode, String direction, String messageType,
                            String businessMessageId, String correlationId, String status,
                            String payloadJson, String digest, String resourceType,
                            Long resourceId, Long resourceVersion) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.endpointCode = endpointCode;
        this.direction = direction; this.messageType = messageType; this.businessMessageId = businessMessageId;
        this.correlationId = correlationId; this.status = status; this.payloadJson = payloadJson;
        this.payloadDigestAlgorithm = "SHA-256"; this.payloadDigest = digest;
        this.relatedResourceType = resourceType; this.relatedResourceId = resourceId;
        this.relatedResourceVersion = resourceVersion; this.createdAt = Instant.now();
    }

    public void markProcessed(String resourceType, Long resourceId, long resourceVersion) {
        if (!"INBOUND".equals(direction)) throw new IllegalStateException("Only inbound messages can be processed");
        if ("PROCESSED".equals(status)) {
            if (java.util.Objects.equals(this.relatedResourceType, resourceType)
                    && java.util.Objects.equals(this.relatedResourceId, resourceId)
                    && java.util.Objects.equals(this.relatedResourceVersion, resourceVersion)) return;
            throw new IllegalStateException("Processed message already references another resource");
        }
        this.relatedResourceType = resourceType; this.relatedResourceId = resourceId;
        this.relatedResourceVersion = resourceVersion; this.status = "PROCESSED";
        this.processedAt = Instant.now(); this.errorCode = null; this.errorMessage = null;
    }

    public void markDelivery(boolean delivered, String errorCode, String errorMessage) {
        if (!"OUTBOUND".equals(direction)) throw new IllegalStateException("Only outbound messages have delivery state");
        if ("ACKNOWLEDGED".equals(status) || "REJECTED".equals(status)) {
            throw new IllegalStateException("Acknowledged messages cannot change delivery state");
        }
        if ((delivered && "SENT".equals(status)) || (!delivered && "FAILED".equals(status)
                && java.util.Objects.equals(this.errorCode, errorCode)
                && java.util.Objects.equals(this.errorMessage, errorMessage))) return;
        this.status = delivered ? "SENT" : "FAILED";
        if (delivered) this.sentAt = Instant.now();
        this.errorCode = delivered ? null : errorCode;
        this.errorMessage = delivered ? null : errorMessage;
    }

    public void acknowledge(boolean accepted, String errorCode, String errorMessage) {
        if (!"OUTBOUND".equals(direction)) throw new IllegalStateException("Only outbound messages can be acknowledged");
        String target = accepted ? "ACKNOWLEDGED" : "REJECTED";
        if (target.equals(status)) return;
        if ("ACKNOWLEDGED".equals(status) || "REJECTED".equals(status)) {
            throw new IllegalStateException("Acknowledgement result cannot be reversed");
        }
        this.status = target;
        this.processedAt = Instant.now(); this.errorCode = accepted ? null : errorCode;
        this.errorMessage = accepted ? null : errorMessage;
    }

    public Long id() { return id; } public long revision() { return revision; }
    public Long tenantId() { return tenantId; } public String endpointCode() { return endpointCode; }
    public Long organizationId() { return organizationId; } public Long departmentId() { return departmentId; }
    public String direction() { return direction; } public String messageType() { return messageType; }
    public String businessMessageId() { return businessMessageId; } public String correlationId() { return correlationId; }
    public String status() { return status; } public String payloadJson() { return payloadJson; }
    public String payloadDigestAlgorithm() { return payloadDigestAlgorithm; } public String payloadDigest() { return payloadDigest; }
    public String relatedResourceType() { return relatedResourceType; } public Long relatedResourceId() { return relatedResourceId; }
    public Long relatedResourceVersion() { return relatedResourceVersion; } public Instant createdAt() { return createdAt; }
    public Instant sentAt() { return sentAt; } public Instant receivedAt() { return receivedAt; }
    public Instant processedAt() { return processedAt; } public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
}
