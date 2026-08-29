package com.rhn.workmanagement.notification;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class NotificationService {
    private final PortalNotificationRepository repository;
    private final ExecutionContextProvider contextProvider;
    private final IdempotentDomainEventConsumer eventConsumer;

    public NotificationService(PortalNotificationRepository repository, ExecutionContextProvider contextProvider,
                               IdempotentDomainEventConsumer eventConsumer) {
        this.repository = repository;
        this.contextProvider = contextProvider;
        this.eventConsumer = eventConsumer;
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> inbox() {
        return inboxEntities(requireContext()).stream().limit(50).map(NotificationResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public NotificationSummaryResponse summary() {
        List<PortalNotification> notifications = inboxEntities(requireContext());
        long unread = notifications.stream().filter(value -> value.status() == NotificationStatus.UNREAD).count();
        return new NotificationSummaryResponse(unread, notifications.size());
    }

    @Transactional
    public NotificationResponse markRead(Long id) {
        ExecutionContext context = requireContext();
        PortalNotification notification = requireAccessible(id, context);
        notification.read();
        return NotificationResponse.from(notification);
    }

    @Transactional
    public void archive(Long id) {
        ExecutionContext context = requireContext();
        requireAccessible(id, context).archive();
    }

    @EventListener
    @Transactional
    public void projectBusinessEvents(DomainEventEnvelope event) {
        if (!Set.of("OUTPATIENT_REGISTERED", "ENCOUNTER_COMPLETED", "CLINICAL_DOCUMENT_SIGNED").contains(event.eventType())) return;
        eventConsumer.consume("portal-notification-projector", event, () -> createFor(event));
    }

    private void createFor(DomainEventEnvelope event) {
        String dedupKey = event.eventType() + ":" + event.eventId();
        if (repository.existsByTenantIdAndDedupKey(event.tenantId(), dedupKey)) return;
        Long departmentId = longPayload(event, "departmentId");
        String title = switch (event.eventType()) {
            case "OUTPATIENT_REGISTERED" -> "新增门诊待接诊";
            case "ENCOUNTER_COMPLETED" -> "门诊就诊已完成";
            default -> "临床文档已签署";
        };
        String message = switch (event.eventType()) {
            case "OUTPATIENT_REGISTERED" -> "有新的门诊挂号进入科室工作队列。";
            case "ENCOUNTER_COMPLETED" -> "门诊就诊已完成并进入连续健康记录。";
            default -> "临床文档签署完成，可查看版本与证据。";
        };
        repository.save(new PortalNotification(event.tenantId(), event.organizationId(), departmentId, null,
                "BUSINESS", "INFO", title, message, "/residents", event.aggregateType(), event.aggregateId(), dedupKey));
    }

    private List<PortalNotification> inboxEntities(ExecutionContext context) {
        return repository.findInbox(context.tenantId(), context.subjectId(), context.organizationId(), context.departmentId());
    }

    private PortalNotification requireAccessible(Long id, ExecutionContext context) {
        PortalNotification notification = repository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("NOTIFICATION_NOT_FOUND", "未找到通知"));
        boolean personal = context.subjectId().equals(notification.recipientUserId());
        boolean contextual = notification.recipientUserId() == null
                && context.canAccessOrganization(notification.organizationId())
                && (notification.departmentId() == null || context.canAccessDepartment(notification.departmentId()));
        if (!personal && !contextual) throw forbidden("NOTIFICATION_FORBIDDEN", "无权访问该通知");
        return notification;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null || !context.hasWorkContext()) {
            throw forbidden("WORK_CONTEXT_REQUIRED", "请先选择机构和科室工作上下文");
        }
        return context;
    }

    private Long longPayload(DomainEventEnvelope event, String key) {
        Object value = event.payload().get(key);
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String text && !text.isBlank()) return Long.valueOf(text);
        return null;
    }
}
