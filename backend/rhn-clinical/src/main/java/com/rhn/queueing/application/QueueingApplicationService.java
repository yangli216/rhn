package com.rhn.queueing.application;

import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.queueing.api.QueueingDirectory;
import com.rhn.queueing.domain.QueueCounter;
import com.rhn.queueing.domain.QueueTicket;
import com.rhn.queueing.domain.QueueTicketEvent;
import com.rhn.queueing.domain.ServiceQueue;
import com.rhn.queueing.infrastructure.QueueCounterRepository;
import com.rhn.queueing.infrastructure.QueueTicketEventRepository;
import com.rhn.queueing.infrastructure.QueueTicketRepository;
import com.rhn.queueing.infrastructure.ServiceQueueRepository;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class QueueingApplicationService implements QueueingDirectory {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> SCENES = Set.of("OUTPATIENT", "PHARMACY", "LAB_COLLECTION", "EXAMINATION");
    private static final Set<String> SOURCE_TYPES = Set.of("PAT_REG", "DISP_TASK", "DIAG_TASK");

    private final ServiceQueueRepository queues;
    private final QueueCounterRepository counters;
    private final QueueTicketRepository tickets;
    private final QueueTicketEventRepository events;
    private final ExecutionContextProvider contexts;
    private final DomainEventPublisher domainEvents;

    public QueueingApplicationService(ServiceQueueRepository queues, QueueCounterRepository counters,
                                      QueueTicketRepository tickets, QueueTicketEventRepository events,
                                      ExecutionContextProvider contexts, DomainEventPublisher domainEvents) {
        this.queues = queues;
        this.counters = counters;
        this.tickets = tickets;
        this.events = events;
        this.contexts = contexts;
        this.domainEvents = domainEvents;
    }

    @Override
    @Transactional
    public TicketSnapshot checkIn(CheckInCommand input) {
        return checkIn(input, true);
    }

    @Override
    @Transactional
    public TicketSnapshot checkInForOrganization(CheckInCommand input) {
        return checkIn(input, false);
    }

    private TicketSnapshot checkIn(CheckInCommand input, boolean departmentScoped) {
        ExecutionContext context = departmentScoped
                ? requireScope(input.organizationId(), input.departmentId())
                : requireOrganizationScope(input.organizationId());
        String commandCode = requireCode(input.commandCode(), "commandCode", 128);
        String sourceType = controlled(input.sourceType(), SOURCE_TYPES, "QUEUE_SOURCE_TYPE_INVALID", "不支持的排队来源类型");
        if (input.sourceId() == null || input.residentId() == null) {
            throw badRequest("QUEUE_SOURCE_REQUIRED", "患者和来源业务标识不能为空");
        }
        QueueTicket replay = tickets.findByTenantIdAndIdempotencyCode(context.tenantId(), commandCode)
                .or(() -> tickets.findByTenantIdAndSourceTypeAndSourceId(context.tenantId(), sourceType, input.sourceId()))
                .orElse(null);
        if (replay != null) {
            if (departmentScoped) requireQueue(context, replay.serviceQueueId());
            else requireOrganizationQueue(context, replay.serviceQueueId());
            if (!replay.sourceType().equals(sourceType) || !replay.sourceId().equals(input.sourceId())) {
                throw conflict("QUEUE_COMMAND_CONFLICT", "排队命令编码已经用于其他业务来源");
            }
            return snapshot(replay);
        }

        ServiceQueue queue = ensureQueue(context, input);
        LocalDate businessDate = LocalDate.now(BUSINESS_ZONE);
        QueueCounter counter = counters.findByTenantIdAndServiceQueueIdAndBusinessDate(
                        context.tenantId(), queue.id(), businessDate)
                .orElseGet(() -> counters.saveAndFlush(new QueueCounter(context.tenantId(), queue.id(), businessDate)));
        int sequence = counter.take();
        Instant now = Instant.now();
        String ticketCode = queue.ticketPrefix() + "%03d".formatted(sequence);
        QueueTicket ticket = tickets.save(new QueueTicket(context.tenantId(),
                queue.organizationId(), queue.departmentId(),
                queue.id(), input.residentId(),
                input.encounterId(), sourceType, input.sourceId(), commandCode, businessDate, ticketCode,
                sequence, Math.max(0, input.priority()), input.ready(), now));
        events.save(new QueueTicketEvent(context.tenantId(), ticket.id(), "CHECKED_IN", null, "WAITING",
                commandCode, now, requireActor(context), queue.waitingLocationId(), "患者签到并进入服务队列"));
        tickets.flush();
        publish(queue, ticket, "CHECKED_IN", now);
        return snapshot(ticket);
    }

    @Override
    @Transactional(readOnly = true)
    public TicketSnapshot requireBySource(String sourceType, Long sourceId) {
        ExecutionContext context = contexts.requireCurrent();
        return snapshot(tickets.findByTenantIdAndSourceTypeAndSourceId(
                        context.tenantId(), normalizeSource(sourceType), sourceId)
                .orElseThrow(() -> notFound("QUEUE_TICKET_NOT_FOUND", "未找到来源业务对应的排队号票")));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, TicketSnapshot> findBySources(String sourceType, Iterable<Long> sourceIds) {
        ExecutionContext context = contexts.requireCurrent();
        List<Long> ids = new ArrayList<>();
        sourceIds.forEach(ids::add);
        if (ids.isEmpty()) return Map.of();
        return tickets.findByTenantIdAndSourceTypeAndSourceIdIn(context.tenantId(), normalizeSource(sourceType), ids)
                .stream().collect(Collectors.toMap(QueueTicket::sourceId, this::snapshot));
    }

    @Transactional(readOnly = true)
    public List<ServiceQueueSnapshot> queues() {
        ExecutionContext context = requireWorkContext();
        return queues.findByTenantIdAndOrganizationIdAndDepartmentIdAndActiveTrueOrderByCode(
                        context.tenantId(), context.organizationId(), context.departmentId())
                .stream().filter(queue -> canAccessScene(context, queue.scene())).map(this::snapshot).toList();
    }

    @Transactional(readOnly = true)
    public PageResult<TicketSnapshot> page(Long queueId, LocalDate businessDate, String status, int page, int size) {
        ExecutionContext context = requireWorkContext();
        ServiceQueue queue = requireQueue(context, queueId);
        String normalizedStatus = clean(status) == null ? null : clean(status).toUpperCase(Locale.ROOT);
        int safePage = Math.max(0, page);
        int safeSize = Math.min(100, Math.max(1, size));
        Page<QueueTicket> result = tickets.search(context.tenantId(), queue.id(),
                businessDate == null ? LocalDate.now(BUSINESS_ZONE) : businessDate, normalizedStatus,
                PageRequest.of(safePage, safeSize, Sort.by(Sort.Order.desc("priority"),
                        Sort.Order.asc("checkedInAt"), Sort.Order.asc("sequenceNo"))));
        return new PageResult<>(result.getContent().stream().map(this::snapshot).toList(),
                result.getTotalElements(), result.getTotalPages(), safePage, safeSize);
    }

    @Transactional
    public TicketSnapshot ready(Long ticketId, String commandCode, String description) {
        return change(ticketId, commandCode, null, "READY", description, (ticket, now) -> {
            if (!ticket.ready(now)) return null;
            return ticket.status();
        });
    }

    @Transactional
    public TicketSnapshot call(Long ticketId, String commandCode, Long serviceLocationId, String description) {
        return change(ticketId, commandCode, serviceLocationId, "CALLED", description,
                (ticket, now) -> ticket.call(serviceLocationId, now));
    }

    @Transactional
    public TicketSnapshot recall(Long ticketId, String commandCode, Long serviceLocationId, String description) {
        return change(ticketId, commandCode, serviceLocationId, "RECALLED", description,
                (ticket, now) -> ticket.recall(serviceLocationId, now));
    }

    @Transactional
    public TicketSnapshot miss(Long ticketId, String commandCode, String description) {
        return change(ticketId, commandCode, null, "MISSED", description, QueueTicket::miss);
    }

    @Transactional
    public TicketSnapshot requeue(Long ticketId, String commandCode, String description) {
        return change(ticketId, commandCode, null, "REQUEUED", description, QueueTicket::requeue);
    }

    @Transactional
    public TicketSnapshot start(Long ticketId, String commandCode, Long serviceLocationId, String description) {
        return change(ticketId, commandCode, serviceLocationId, "STARTED", description,
                (ticket, now) -> ticket.start(serviceLocationId, now));
    }

    @Transactional
    public TicketSnapshot suspend(Long ticketId, String commandCode, String description) {
        return change(ticketId, commandCode, null, "SUSPENDED", description,
                (ticket, now) -> ticket.suspend());
    }

    @Transactional
    public TicketSnapshot resume(Long ticketId, String commandCode, Long serviceLocationId, String description) {
        return change(ticketId, commandCode, serviceLocationId, "RESUMED", description,
                (ticket, now) -> ticket.resume(serviceLocationId));
    }

    @Transactional
    public TicketSnapshot complete(Long ticketId, String commandCode, String description) {
        return change(ticketId, commandCode, null, "COMPLETED", description, QueueTicket::complete);
    }

    @Transactional
    public TicketSnapshot cancel(Long ticketId, String commandCode, String description) {
        return change(ticketId, commandCode, null, "CANCELLED", description, QueueTicket::cancel);
    }

    @Transactional
    public TicketSnapshot callNext(Long queueId, LocalDate businessDate, String commandCode,
                                   Long serviceLocationId, String description) {
        ExecutionContext context = requireWorkContext();
        ServiceQueue queue = requireQueueForUpdate(context, queueId);
        String code = requireCode(commandCode, "commandCode", 128);
        QueueTicketEvent replay = events.findByTenantIdAndCommandCode(context.tenantId(), code).orElse(null);
        if (replay != null) {
            QueueTicket previous = tickets.findByIdAndTenantId(replay.queueTicketId(), context.tenantId())
                    .orElseThrow(() -> notFound("QUEUE_TICKET_NOT_FOUND", "未找到排队命令对应的号票"));
            if (!queue.id().equals(previous.serviceQueueId())) {
                throw conflict("QUEUE_COMMAND_CONFLICT", "排队命令编码已经用于其他服务队列");
            }
            return snapshot(previous);
        }
        Instant now = Instant.now();
        QueueTicket ticket = tickets.lockNextReady(context.tenantId(), queue.id(),
                        businessDate == null ? LocalDate.now(BUSINESS_ZONE) : businessDate,
                        now, PageRequest.of(0, 1)).stream().findFirst()
                .orElseThrow(() -> conflict("QUEUE_NO_READY_TICKET", "当前没有可呼叫的候诊号票"));
        return applyChange(context, queue, ticket, code,
                serviceLocationId, "CALLED", description, (value, occurredAt) -> value.call(serviceLocationId, occurredAt));
    }

    @Override
    @Transactional
    public TicketSnapshot startBySource(String sourceType, Long sourceId, String commandCode,
                                        Long serviceLocationId, String description, boolean callIfWaiting) {
        ExecutionContext context = contexts.requireCurrent();
        QueueTicket ticket = requireSourceWithLock(context, sourceType, sourceId);
        ServiceQueue queue = requireQueueForSourceOperation(context, ticket.serviceQueueId());
        String code = requireCode(commandCode, "commandCode", 128);
        TicketSnapshot replay = replay(context, ticket, code);
        if (replay != null) return replay;
        Instant now = Instant.now();
        if ("WAITING".equals(ticket.status()) && callIfWaiting) {
            String callCode = derivedCode(code, "CALL");
            String previous = ticket.call(serviceLocationId, now);
            append(context, ticket, "CALLED", previous, callCode, serviceLocationId, "开始服务前自动叫号", now);
            publish(queue, ticket, "CALLED", now);
        }
        String previous = ticket.start(serviceLocationId, now);
        append(context, ticket, "STARTED", previous, code, serviceLocationId, description, now);
        tickets.flush();
        publish(queue, ticket, "STARTED", now);
        return snapshot(ticket);
    }

    @Override
    @Transactional
    public TicketSnapshot suspendBySource(String sourceType, Long sourceId, String commandCode, String description) {
        return changeBySource(sourceType, sourceId, commandCode, null, "SUSPENDED", description,
                (ticket, now) -> ticket.suspend());
    }

    @Override
    @Transactional
    public TicketSnapshot resumeBySource(String sourceType, Long sourceId, String commandCode,
                                         Long serviceLocationId, String description) {
        return changeBySource(sourceType, sourceId, commandCode, serviceLocationId, "RESUMED", description,
                (ticket, now) -> ticket.resume(serviceLocationId));
    }

    @Override
    @Transactional
    public TicketSnapshot completeBySource(String sourceType, Long sourceId, String commandCode, String description) {
        return changeBySource(sourceType, sourceId, commandCode, null, "COMPLETED", description, QueueTicket::complete);
    }

    @Override
    @Transactional
    public TicketSnapshot cancelBySource(String sourceType, Long sourceId, String commandCode, String description) {
        return changeBySource(sourceType, sourceId, commandCode, null, "CANCELLED", description, QueueTicket::cancel);
    }

    private TicketSnapshot change(Long ticketId, String commandCode, Long locationId, String eventType,
                                  String description, BiFunction<QueueTicket, Instant, String> transition) {
        ExecutionContext context = contexts.requireCurrent();
        QueueTicket ticket = tickets.lockByIdAndTenantId(ticketId, context.tenantId())
                .orElseThrow(() -> notFound("QUEUE_TICKET_NOT_FOUND", "未找到排队号票"));
        ServiceQueue queue = requireQueue(context, ticket.serviceQueueId());
        return applyChange(context, queue, ticket, requireCode(commandCode, "commandCode", 128),
                locationId, eventType, description, transition);
    }

    private TicketSnapshot changeBySource(String sourceType, Long sourceId, String commandCode, Long locationId,
                                          String eventType, String description,
                                          BiFunction<QueueTicket, Instant, String> transition) {
        ExecutionContext context = contexts.requireCurrent();
        QueueTicket ticket = requireSourceWithLock(context, sourceType, sourceId);
        ServiceQueue queue = requireQueueForSourceOperation(context, ticket.serviceQueueId());
        return applyChange(context, queue, ticket, requireCode(commandCode, "commandCode", 128),
                locationId, eventType, description, transition);
    }

    private TicketSnapshot applyChange(ExecutionContext context, ServiceQueue queue, QueueTicket ticket,
                                       String commandCode, Long locationId, String eventType, String description,
                                       BiFunction<QueueTicket, Instant, String> transition) {
        TicketSnapshot replay = replay(context, ticket, commandCode);
        if (replay != null) return replay;
        Instant now = Instant.now();
        String previous = transition.apply(ticket, now);
        if (previous == null) return snapshot(ticket);
        append(context, ticket, eventType, previous, commandCode, locationId, description, now);
        tickets.flush();
        publish(queue, ticket, eventType, now);
        return snapshot(ticket);
    }

    private void append(ExecutionContext context, QueueTicket ticket, String eventType, String previous,
                        String commandCode, Long locationId, String description, Instant now) {
        events.save(new QueueTicketEvent(context.tenantId(), ticket.id(), eventType, previous, ticket.status(),
                commandCode, now, requireActor(context), locationId, limited(description, 500)));
    }

    private ServiceQueue ensureQueue(ExecutionContext context, CheckInCommand input) {
        String code = requireCode(input.queueCode(), "queueCode", 64);
        String scene = controlled(input.scene(), SCENES, "QUEUE_SCENE_INVALID", "不支持的排队业务场景");
        requireSceneAccess(context, scene);
        ServiceQueue existing = queues.findByTenantIdAndCode(context.tenantId(), code).orElse(null);
        if (existing != null) {
            if (!existing.active() || !existing.organizationId().equals(input.organizationId())
                    || !existing.departmentId().equals(input.departmentId()) || !existing.scene().equals(scene)) {
                throw conflict("SERVICE_QUEUE_SCOPE_CONFLICT", "服务队列编码已经用于其他业务范围");
            }
            return existing;
        }
        String name = requireCode(input.queueName(), "queueName", 100);
        String prefix = requireCode(input.ticketPrefix(), "ticketPrefix", 8).toUpperCase(Locale.ROOT);
        return queues.saveAndFlush(new ServiceQueue(context.tenantId(), input.organizationId(), input.departmentId(),
                input.waitingLocationId(), code, name, scene, prefix, requireActor(context), Instant.now()));
    }

    private ServiceQueue requireQueue(ExecutionContext context, Long queueId) {
        ServiceQueue queue = queues.findByIdAndTenantId(queueId, context.tenantId())
                .orElseThrow(() -> notFound("SERVICE_QUEUE_NOT_FOUND", "未找到服务队列"));
        return authorizeQueue(context, queue);
    }

    private ServiceQueue requireQueueForUpdate(ExecutionContext context, Long queueId) {
        ServiceQueue queue = queues.lockByIdAndTenantId(queueId, context.tenantId())
                .orElseThrow(() -> notFound("SERVICE_QUEUE_NOT_FOUND", "未找到服务队列"));
        return authorizeQueue(context, queue);
    }

    private ServiceQueue requireOrganizationQueue(ExecutionContext context, Long queueId) {
        ServiceQueue queue = queues.findByIdAndTenantId(queueId, context.tenantId())
                .orElseThrow(() -> notFound("SERVICE_QUEUE_NOT_FOUND", "未找到服务队列"));
        if (!context.canAccessOrganization(queue.organizationId())) {
            throw forbidden("SERVICE_QUEUE_CONTEXT_FORBIDDEN", "当前工作上下文不能访问该服务队列");
        }
        requireSceneAccess(context, queue.scene());
        return queue;
    }

    private ServiceQueue requireQueueForSourceOperation(ExecutionContext context, Long queueId) {
        ServiceQueue queue = queues.findByIdAndTenantId(queueId, context.tenantId())
                .orElseThrow(() -> notFound("SERVICE_QUEUE_NOT_FOUND", "未找到服务队列"));
        requireSceneAccess(context, queue.scene());
        return queue;
    }

    private ServiceQueue authorizeQueue(ExecutionContext context, ServiceQueue queue) {
        if (!context.canAccessOrganization(queue.organizationId()) || !context.canAccessDepartment(queue.departmentId())) {
            throw forbidden("SERVICE_QUEUE_CONTEXT_FORBIDDEN", "当前工作上下文不能访问该服务队列");
        }
        requireSceneAccess(context, queue.scene());
        return queue;
    }

    private TicketSnapshot replay(ExecutionContext context, QueueTicket ticket, String commandCode) {
        QueueTicketEvent previous = events.findByTenantIdAndCommandCode(context.tenantId(), commandCode).orElse(null);
        if (previous == null) return null;
        if (!ticket.id().equals(previous.queueTicketId())) {
            throw conflict("QUEUE_COMMAND_CONFLICT", "排队命令编码已经用于其他号票");
        }
        return snapshot(ticket);
    }

    private void requireSceneAccess(ExecutionContext context, String scene) {
        if (!canAccessScene(context, scene)) {
            throw forbidden("SERVICE_QUEUE_SCENE_FORBIDDEN", "当前用户无权访问该业务场景的服务队列");
        }
    }

    private boolean canAccessScene(ExecutionContext context, String scene) {
        if (context.hasAuthority("ROLE_ADMIN")) return true;
        return switch (scene) {
            case "OUTPATIENT" -> context.hasAuthority("OUTPATIENT_REGISTRATION.ACCESS")
                    || context.hasAuthority("OUTPATIENT_RECEPTION.ACCESS");
            case "PHARMACY" -> context.hasAuthority("PHARMACY.ACCESS");
            case "LAB_COLLECTION", "EXAMINATION" -> context.hasAuthority("DIAGNOSTICS.ACCESS");
            default -> false;
        };
    }

    private QueueTicket requireSourceWithLock(ExecutionContext context, String sourceType, Long sourceId) {
        return tickets.lockBySource(context.tenantId(), normalizeSource(sourceType), sourceId)
                .orElseThrow(() -> notFound("QUEUE_TICKET_NOT_FOUND", "未找到来源业务对应的排队号票"));
    }

    private ExecutionContext requireScope(Long organizationId, Long departmentId) {
        ExecutionContext context = requireWorkContext();
        if (!context.canAccessOrganization(organizationId) || !context.canAccessDepartment(departmentId)) {
            throw forbidden("SERVICE_QUEUE_CONTEXT_FORBIDDEN", "不能在当前工作上下文之外办理排队业务");
        }
        return context;
    }

    private ExecutionContext requireOrganizationScope(Long organizationId) {
        ExecutionContext context = contexts.requireCurrent();
        if (!context.hasWorkContext() || !context.canAccessOrganization(organizationId)) {
            throw forbidden("SERVICE_QUEUE_CONTEXT_FORBIDDEN", "不能在当前机构之外办理排队业务");
        }
        return context;
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contexts.requireCurrent();
        if (context.organizationId() == null || context.departmentId() == null) {
            throw badRequest("QUEUE_WORK_CONTEXT_REQUIRED", "排队操作需要选择机构和科室工作上下文");
        }
        return context;
    }

    private void publish(ServiceQueue queue, QueueTicket ticket, String eventType, Instant now) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("queueId", queue.id());
        payload.put("queueCode", queue.code());
        payload.put("scene", queue.scene());
        payload.put("departmentId", queue.departmentId());
        payload.put("ticketCode", ticket.ticketCode());
        payload.put("status", ticket.status());
        payload.put("callCount", ticket.callCount());
        payload.put("missedCount", ticket.missedCount());
        if (ticket.currentLocationId() != null) payload.put("serviceLocationId", ticket.currentLocationId());
        domainEvents.publish(ticket.tenantId(), queue.organizationId(), "QUEUE_TICKET_" + eventType, 1,
                "QueueTicket", ticket.id(), ticket.revision(), ticket.residentId(), now, payload);
    }

    private ServiceQueueSnapshot snapshot(ServiceQueue queue) {
        return new ServiceQueueSnapshot(queue.id(), queue.revision(), queue.organizationId(), queue.departmentId(),
                queue.waitingLocationId(), queue.code(), queue.name(), queue.scene(), queue.ticketPrefix(), queue.active());
    }

    private TicketSnapshot snapshot(QueueTicket ticket) {
        return new TicketSnapshot(ticket.id(), ticket.revision(), ticket.serviceQueueId(), ticket.residentId(),
                ticket.encounterId(), ticket.sourceType(), ticket.sourceId(), ticket.businessDate(),
                ticket.ticketCode(), ticket.sequenceNo(), ticket.priority(), ticket.status(), ticket.checkedInAt(),
                ticket.readyAt(), ticket.calledAt(), ticket.startedAt(), ticket.completedAt(), ticket.callCount(),
                ticket.missedCount(), ticket.currentLocationId());
    }

    private String normalizeSource(String value) {
        return controlled(value, SOURCE_TYPES, "QUEUE_SOURCE_TYPE_INVALID", "不支持的排队来源类型");
    }

    private String controlled(String value, Set<String> allowed, String code, String message) {
        String normalized = clean(value) == null ? null : clean(value).toUpperCase(Locale.ROOT);
        if (normalized == null || !allowed.contains(normalized)) throw badRequest(code, message);
        return normalized;
    }

    private String requireCode(String value, String field, int maxLength) {
        String normalized = clean(value);
        if (normalized == null || normalized.length() > maxLength) {
            throw badRequest("QUEUE_FIELD_INVALID", field + "不能为空且长度不能超过" + maxLength);
        }
        return normalized;
    }

    private String derivedCode(String value, String suffix) {
        String tail = ":" + suffix;
        return value.substring(0, Math.min(value.length(), 128 - tail.length())) + tail;
    }

    private String limited(String value, int maxLength) {
        String normalized = clean(value);
        return normalized == null || normalized.length() <= maxLength
                ? normalized : normalized.substring(0, maxLength);
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Long requireActor(ExecutionContext context) {
        if (context.subjectId() == null) throw badRequest("QUEUE_ACTOR_REQUIRED", "排队操作缺少当前用户");
        return context.subjectId();
    }
}
