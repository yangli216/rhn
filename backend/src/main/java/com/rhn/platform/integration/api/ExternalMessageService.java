package com.rhn.platform.integration.api;

import java.time.Instant;
import java.util.List;

/** Durable, idempotent message boundary shared by external-system adapters. */
public interface ExternalMessageService {
    ExternalMessageReceipt enqueueOutbound(OutboundMessage command);
    ExternalMessageReceipt receiveInbound(InboundMessage command);
    ExternalMessageReceipt markProcessed(Long messageId, String resourceType, Long resourceId, long resourceVersion);
    ExternalMessageReceipt markDelivery(Long messageId, boolean delivered, String errorCode, String errorMessage);
    ExternalMessageReceipt acknowledgeOutbound(String endpointCode, String businessMessageId,
                                                boolean accepted, String errorCode, String errorMessage);
    List<ExternalMessageReceipt> listOutbound(String endpointCode, String status);

    record OutboundMessage(
            String endpointCode, String messageType, String businessMessageId, String correlationId,
            Long organizationId, Long departmentId, Object payload,
            String relatedResourceType, Long relatedResourceId, long relatedResourceVersion) {}

    record InboundMessage(
            String endpointCode, String messageType, String businessMessageId, String correlationId,
            Long organizationId, Long departmentId, Object payload) {}

    record ExternalMessageReceipt(
            Long id, long revision, String endpointCode, String direction, String messageType,
            String businessMessageId, String correlationId, String status,
            Long organizationId, Long departmentId,
            String payloadDigestAlgorithm, String payloadDigest,
            String relatedResourceType, Long relatedResourceId, Long relatedResourceVersion,
            Instant createdAt, Instant sentAt, Instant receivedAt, Instant processedAt,
            String errorCode, String errorMessage, boolean duplicate) {}
}
