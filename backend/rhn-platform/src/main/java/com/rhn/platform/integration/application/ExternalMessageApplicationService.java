package com.rhn.platform.integration.application;

import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.platform.integration.domain.ExternalMessage;
import com.rhn.platform.integration.infrastructure.ExternalMessageRepository;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ExternalMessageApplicationService implements ExternalMessageService {
    private final ExternalMessageRepository repository;
    private final JsonCodec jsonCodec;
    private final ExecutionContextProvider contextProvider;

    public ExternalMessageApplicationService(ExternalMessageRepository repository, JsonCodec jsonCodec,
                                             ExecutionContextProvider contextProvider) {
        this.repository = repository; this.jsonCodec = jsonCodec; this.contextProvider = contextProvider;
    }

    @Override
    @Transactional
    public ExternalMessageReceipt enqueueOutbound(OutboundMessage command) {
        validate(command.endpointCode(), command.messageType(), command.businessMessageId());
        requireScope(command.organizationId(), command.departmentId());
        Long tenantId = TenantContext.requireTenantId();
        String payload = jsonCodec.write(command.payload()); String digest = sha256(payload);
        var existing = repository.findByTenantIdAndEndpointCodeAndDirectionAndBusinessMessageId(
                tenantId, command.endpointCode(), "OUTBOUND", command.businessMessageId());
        if (existing.isPresent()) return sameOrConflict(existing.get(), digest);
        ExternalMessage value = repository.save(new ExternalMessageFactory().outbound(tenantId, command, payload, digest));
        return receipt(value, false);
    }

    @Override
    @Transactional
    public ExternalMessageReceipt receiveInbound(InboundMessage command) {
        validate(command.endpointCode(), command.messageType(), command.businessMessageId());
        requireScope(command.organizationId(), command.departmentId());
        Long tenantId = TenantContext.requireTenantId();
        String payload = jsonCodec.write(command.payload()); String digest = sha256(payload);
        var existing = repository.findByTenantIdAndEndpointCodeAndDirectionAndBusinessMessageId(
                tenantId, command.endpointCode(), "INBOUND", command.businessMessageId());
        if (existing.isPresent()) return sameOrConflict(existing.get(), digest);
        ExternalMessage value = repository.save(ExternalMessage.inbound(tenantId, clean(command.endpointCode()),
                clean(command.messageType()), clean(command.businessMessageId()), clean(command.correlationId()),
                command.organizationId(), command.departmentId(), payload, digest));
        return receipt(value, false);
    }

    @Override
    @Transactional
    public ExternalMessageReceipt markProcessed(Long messageId, String resourceType, Long resourceId, long resourceVersion) {
        ExternalMessage value = require(messageId); requireScope(value.organizationId(), value.departmentId());
        value.markProcessed(resourceType, resourceId, resourceVersion);
        return receipt(value, false);
    }

    @Override
    @Transactional
    public ExternalMessageReceipt markDelivery(Long messageId, boolean delivered, String errorCode, String errorMessage) {
        ExternalMessage value = require(messageId); requireScope(value.organizationId(), value.departmentId());
        try { value.markDelivery(delivered, clean(errorCode), clean(errorMessage)); }
        catch (IllegalStateException exception) { throw conflict("EXTERNAL_MESSAGE_STATE_INVALID", exception.getMessage()); }
        return receipt(value, false);
    }

    @Override
    @Transactional
    public ExternalMessageReceipt acknowledgeOutbound(String endpointCode, String businessMessageId,
                                                       boolean accepted, String errorCode, String errorMessage) {
        ExternalMessage value = repository.findByTenantIdAndEndpointCodeAndDirectionAndBusinessMessageId(
                        TenantContext.requireTenantId(), endpointCode, "OUTBOUND", businessMessageId)
                .orElseThrow(() -> notFound("OUTBOUND_MESSAGE_NOT_FOUND", "未找到对应的外发申请消息"));
        requireScope(value.organizationId(), value.departmentId());
        try { value.acknowledge(accepted, clean(errorCode), clean(errorMessage)); }
        catch (IllegalStateException exception) { throw conflict("EXTERNAL_MESSAGE_STATE_INVALID", exception.getMessage()); }
        return receipt(value, false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ExternalMessageReceipt> listOutbound(String endpointCode, String status) {
        if (clean(endpointCode) == null) throw badRequest("INTEGRATION_ENDPOINT_REQUIRED", "接口端点编码不能为空");
        Long tenantId = TenantContext.requireTenantId();
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) {
            throw com.rhn.shared.api.BusinessErrors.forbidden(
                    "INTEGRATION_WORK_CONTEXT_REQUIRED", "查询交换队列前必须选择工作机构和科室");
        }
        List<ExternalMessage> values = clean(status) == null
                ? repository.findTop100ByTenantIdAndOrganizationIdAndDepartmentIdAndEndpointCodeAndDirectionOrderByCreatedAtAsc(
                        tenantId, context.organizationId(), context.departmentId(), endpointCode, "OUTBOUND")
                : repository.findTop100ByTenantIdAndOrganizationIdAndDepartmentIdAndEndpointCodeAndDirectionAndStatusOrderByCreatedAtAsc(
                        tenantId, context.organizationId(), context.departmentId(), endpointCode, "OUTBOUND", status);
        return values.stream().map(value -> receipt(value, false)).toList();
    }

    private ExternalMessage require(Long id) {
        return repository.findByIdAndTenantId(id, TenantContext.requireTenantId())
                .orElseThrow(() -> notFound("EXTERNAL_MESSAGE_NOT_FOUND", "未找到外部交换消息"));
    }

    private ExternalMessageReceipt sameOrConflict(ExternalMessage value, String digest) {
        if (!value.payloadDigest().equals(digest)) {
            throw conflict("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT", "相同业务消息号对应了不同报文内容");
        }
        return receipt(value, true);
    }

    private void validate(String endpointCode, String messageType, String businessMessageId) {
        if (clean(endpointCode) == null || clean(messageType) == null || clean(businessMessageId) == null) {
            throw badRequest("EXTERNAL_MESSAGE_IDENTITY_REQUIRED", "端点、消息类型和业务消息号不能为空");
        }
    }

    private void requireScope(Long organizationId, Long departmentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (organizationId == null || departmentId == null || !context.canAccessOrganization(organizationId)
                || !context.canAccessDepartment(departmentId)) {
            throw com.rhn.shared.api.BusinessErrors.forbidden(
                    "INTEGRATION_SCOPE_FORBIDDEN", "外部交换消息不属于当前可访问的机构和科室");
        }
    }

    private String sha256(String value) {
        try { return HexFormat.of().withUpperCase().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private ExternalMessageReceipt receipt(ExternalMessage value, boolean duplicate) {
        return new ExternalMessageReceipt(value.id(), value.revision(), value.endpointCode(), value.direction(),
                value.messageType(), value.businessMessageId(), value.correlationId(), value.status(),
                value.organizationId(), value.departmentId(),
                value.payloadDigestAlgorithm(), value.payloadDigest(), value.relatedResourceType(),
                value.relatedResourceId(), value.relatedResourceVersion(), value.createdAt(), value.sentAt(),
                value.receivedAt(), value.processedAt(), value.errorCode(), value.errorMessage(), duplicate);
    }

    private final class ExternalMessageFactory {
        ExternalMessage outbound(Long tenantId, OutboundMessage command, String payload, String digest) {
            return ExternalMessage.outbound(tenantId, clean(command.endpointCode()), clean(command.messageType()),
                    clean(command.businessMessageId()), clean(command.correlationId()),
                    command.organizationId(), command.departmentId(), payload, digest,
                    command.relatedResourceType(), command.relatedResourceId(), command.relatedResourceVersion());
        }
    }
}
