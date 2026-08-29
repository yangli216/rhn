package com.rhn.outpatient.scheduling;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.outpatient.api.OutpatientScheduleDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class RegistrationApplicationService implements OutpatientRegistrationDirectory {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private final PatientRegistrationRepository registrationRepository;
    private final AppointmentRepository appointmentRepository;
    private final QueueCounterRepository counterRepository;
    private final QueueTicketRepository ticketRepository;
    private final QueueTicketEventRepository ticketEventRepository;
    private final ServiceScheduleRepository scheduleRepository;
    private final ScheduleSlotPoolRepository poolRepository;
    private final SlotEventRepository slotEventRepository;
    private final OutpatientScheduleDirectory slotHolds;
    private final ResidentDirectory residentDirectory;
    private final ExecutionContextProvider contextProvider;

    public RegistrationApplicationService(PatientRegistrationRepository registrationRepository,
                                          AppointmentRepository appointmentRepository,
                                          QueueCounterRepository counterRepository,
                                          QueueTicketRepository ticketRepository,
                                          QueueTicketEventRepository ticketEventRepository,
                                          ServiceScheduleRepository scheduleRepository,
                                          ScheduleSlotPoolRepository poolRepository,
                                          SlotEventRepository slotEventRepository,
                                          OutpatientScheduleDirectory slotHolds,
                                          ResidentDirectory residentDirectory,
                                          ExecutionContextProvider contextProvider) {
        this.registrationRepository = registrationRepository;
        this.appointmentRepository = appointmentRepository;
        this.counterRepository = counterRepository;
        this.ticketRepository = ticketRepository;
        this.ticketEventRepository = ticketEventRepository;
        this.scheduleRepository = scheduleRepository;
        this.poolRepository = poolRepository;
        this.slotEventRepository = slotEventRepository;
        this.slotHolds = slotHolds;
        this.residentDirectory = residentDirectory;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RegistrationSnapshot> findByIdempotency(String idempotencyCode) {
        if (idempotencyCode == null || idempotencyCode.isBlank()) return Optional.empty();
        Long tenantId = contextProvider.requireCurrent().tenantId();
        return registrationRepository.findByTenantIdAndIdempotencyCode(tenantId, idempotencyCode.trim())
                .map(this::snapshot);
    }

    @Override
    @Transactional
    public RegistrationSnapshot register(RegisterCommand command) {
        ExecutionContext context = requireContext(command.organizationId(), command.departmentId());
        String idempotencyCode = requireCode(command.idempotencyCode());
        Optional<PatientRegistration> replay = registrationRepository
                .findByTenantIdAndIdempotencyCode(context.tenantId(), idempotencyCode);
        if (replay.isPresent()) return snapshot(replay.get());

        ServiceSchedule schedule = null;
        ScheduleSlotPool pool = null;
        Appointment appointment = null;
        if (command.scheduleId() != null) {
            schedule = scheduleRepository.findByIdAndTenantId(command.scheduleId(), context.tenantId())
                    .orElseThrow(() -> notFound("SERVICE_SCHEDULE_NOT_FOUND", "未找到所选排班"));
            if (!schedule.organizationId().equals(command.organizationId())
                    || !schedule.departmentId().equals(command.departmentId())) {
                throw badRequest("SERVICE_SCHEDULE_CONTEXT_MISMATCH", "所选排班不属于当前机构科室");
            }
            if (!"PUBLISHED".equals(schedule.status())) {
                throw conflict("SERVICE_SCHEDULE_NOT_AVAILABLE", "所选排班当前不可挂号");
            }
            LocalDate today = LocalDate.now(BUSINESS_ZONE);
            if (!schedule.serviceDate().equals(today)) {
                throw badRequest("SERVICE_SCHEDULE_NOT_TODAY", "现场挂号只能选择今天的排班");
            }
            pool = poolRepository.findByTenantIdAndScheduleId(context.tenantId(), schedule.id())
                    .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "所选排班缺少号源池"));
            if (command.slotHoldId() == null) {
                pool.occupyOne();
            } else {
                slotHolds.consume(command.slotHoldId(), command.residentId(), schedule.id(),
                        "CONSUME-" + idempotencyCode);
            }
            appointment = appointmentRepository.save(new Appointment(context.tenantId(), schedule, pool,
                    command.slotHoldId(),
                    command.residentId(), idempotencyCode, context.subjectId()));
            if (command.slotHoldId() == null) {
                int slotSequence = slotEventRepository
                        .findTopByTenantIdAndPoolIdOrderBySequenceNoDesc(context.tenantId(), pool.id())
                        .map(SlotEvent::sequenceNo).orElse(0) + 1;
                slotEventRepository.save(new SlotEvent(context.tenantId(), pool.id(), schedule.id(), slotSequence,
                        idempotencyCode, context.subjectId(), "窗口挂号占用共享号源"));
            }
        }

        PatientRegistration registration = registrationRepository.save(new PatientRegistration(
                context.tenantId(), appointment == null ? null : appointment.id(),
                schedule == null ? null : schedule.id(), command.residentId(), command.organizationId(),
                command.departmentId(), command.encounterId(), idempotencyCode,
                normalizeSource(command.registrationSource(), schedule != null), normalizeVisitType(command.visitType()),
                context.subjectId()));
        if (command.slotHoldId() != null) slotHolds.bindRegistration(command.slotHoldId(), registration.id());
        LocalDate queueDate = LocalDate.now(BUSINESS_ZONE);
        String queueCode = "OPD:" + command.organizationId() + ":" + command.departmentId();
        QueueCounter counter = counterRepository
                .findByTenantIdAndQueueCodeAndQueueDate(context.tenantId(), queueCode, queueDate)
                .orElseGet(() -> counterRepository.saveAndFlush(new QueueCounter(context.tenantId(), queueCode, queueDate)));
        int sequence = counter.take();
        QueueTicket ticket = ticketRepository.save(new QueueTicket(context.tenantId(), registration.id(),
                idempotencyCode, queueCode, queueDate, sequence));
        ticketEventRepository.save(new QueueTicketEvent(context.tenantId(), ticket.id(), "ENQUEUED", null,
                "WAITING", idempotencyCode, context.subjectId(), "挂号后进入门诊候诊队列"));
        return snapshot(registration, ticket);
    }

    @Override
    @Transactional
    public void markInService(Long encounterId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicket(context.tenantId(), registration.id());
        String previous = ticket.start();
        registration.start();
        appendTicketEvent(context, ticket, "STARTED", previous, "IN_SERVICE", commandCode, "医生开始接诊");
    }

    @Override
    @Transactional
    public void markCompleted(Long encounterId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicket(context.tenantId(), registration.id());
        String previous = ticket.complete();
        registration.complete();
        if (registration.appointmentId() != null) {
            appointmentRepository.findByIdAndTenantId(registration.appointmentId(), context.tenantId())
                    .ifPresent(Appointment::visited);
        }
        appendTicketEvent(context, ticket, "COMPLETED", previous, "COMPLETED", commandCode, "本次门诊接诊完成");
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReceptionQueueItem> queue(LocalDate queueDate) {
        ExecutionContext context = requireContext(null, null);
        LocalDate date = queueDate == null ? LocalDate.now(BUSINESS_ZONE) : queueDate;
        Instant from = date.atStartOfDay(BUSINESS_ZONE).toInstant();
        Instant to = date.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
        List<PatientRegistration> registrations = registrationRepository
                .findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtBetweenOrderByRegisteredAt(
                        context.tenantId(), context.organizationId(), context.departmentId(), from, to);
        if (registrations.isEmpty()) return List.of();
        Map<Long, QueueTicket> tickets = ticketRepository.findByTenantIdAndRegistrationIdIn(context.tenantId(),
                        registrations.stream().map(PatientRegistration::id).toList()).stream()
                .collect(Collectors.toMap(QueueTicket::registrationId, Function.identity()));
        Map<Long, ServiceSchedule> schedules = registrations.stream().map(PatientRegistration::scheduleId)
                .filter(java.util.Objects::nonNull).distinct()
                .map(id -> scheduleRepository.findByIdAndTenantId(id, context.tenantId()).orElse(null))
                .filter(java.util.Objects::nonNull).collect(Collectors.toMap(ServiceSchedule::id, Function.identity()));
        return registrations.stream().map(registration -> {
            QueueTicket ticket = tickets.get(registration.id());
            ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshot(registration.residentId());
            ServiceSchedule schedule = registration.scheduleId() == null ? null : schedules.get(registration.scheduleId());
            return new ReceptionQueueItem(registration.id(), registration.appointmentId(), registration.scheduleId(),
                    registration.encounterId(), resident.id(), resident.healthRecordNo(), resident.fullName(),
                    resident.gender(), resident.birthDate(), registration.registrationNo(), ticket.ticketNo(),
                    ticket.sequenceNo(), ticket.priority(), registration.registrationSource(), registration.visitType(),
                    registration.status(), ticket.status(), schedule == null ? null : schedule.practitionerName(),
                    schedule == null ? null : schedule.serviceName(), schedule == null ? null : schedule.locationName(),
                    registration.registeredAt(), ticket.calledAt());
        }).sorted(Comparator.comparingInt(ReceptionQueueItem::priority).reversed()
                .thenComparingInt(ReceptionQueueItem::sequenceNo)).toList();
    }

    private RegistrationSnapshot snapshot(PatientRegistration registration) {
        QueueTicket ticket = requireTicket(registration.tenantId(), registration.id());
        return snapshot(registration, ticket);
    }

    private RegistrationSnapshot snapshot(PatientRegistration registration, QueueTicket ticket) {
        return new RegistrationSnapshot(registration.id(), registration.appointmentId(), registration.scheduleId(),
                registration.encounterId(), registration.registrationNo(), ticket.ticketNo(), ticket.sequenceNo(),
                registration.status());
    }

    private PatientRegistration requireRegistration(Long tenantId, Long encounterId) {
        return registrationRepository.findByTenantIdAndEncounterId(tenantId, encounterId)
                .orElseThrow(() -> notFound("PATIENT_REGISTRATION_NOT_FOUND", "未找到该次就诊的挂号记录"));
    }

    private QueueTicket requireTicket(Long tenantId, Long registrationId) {
        return ticketRepository.findByTenantIdAndRegistrationId(tenantId, registrationId)
                .orElseThrow(() -> notFound("QUEUE_TICKET_NOT_FOUND", "未找到该次挂号的候诊票"));
    }

    private void appendTicketEvent(ExecutionContext context, QueueTicket ticket, String eventType,
                                   String from, String to, String commandCode, String description) {
        if (!ticketEventRepository.existsByTenantIdAndQueueTicketIdAndCommandCode(
                context.tenantId(), ticket.id(), commandCode)) {
            ticketEventRepository.save(new QueueTicketEvent(context.tenantId(), ticket.id(), eventType,
                    from, to, commandCode, context.subjectId(), description));
        }
    }

    private ExecutionContext requireContext(Long organizationId, Long departmentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null) {
            throw badRequest("RECEPTION_USER_REQUIRED", "挂号操作必须绑定当前用户");
        }
        if (organizationId == null && (!context.hasWorkContext() || context.departmentId() == null)) {
            throw badRequest("RECEPTION_WORK_CONTEXT_REQUIRED", "请先选择当前机构和科室");
        }
        if (organizationId != null && context.hasWorkContext()
                && (!context.organizationId().equals(organizationId) || !context.departmentId().equals(departmentId))) {
            throw badRequest("RECEPTION_CONTEXT_MISMATCH", "挂号机构科室必须与当前工作上下文一致");
        }
        return context;
    }

    private String requireCode(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 128) {
            throw badRequest("REGISTRATION_IDEMPOTENCY_REQUIRED", "挂号请求必须提供不超过128位的幂等编码");
        }
        return value.trim();
    }

    private String normalizeSource(String value, boolean scheduled) {
        String normalized = value == null || value.isBlank() ? (scheduled ? "WINDOW" : "DIRECT")
                : value.trim().toUpperCase();
        if (!List.of("WINDOW", "WALK_IN", "DIRECT", "EMERGENCY").contains(normalized)) {
            throw badRequest("REGISTRATION_SOURCE_INVALID", "挂号来源不正确");
        }
        return normalized;
    }

    private String normalizeVisitType(String value) {
        String normalized = value == null || value.isBlank() ? "GENERAL" : value.trim().toUpperCase();
        if (!List.of("GENERAL", "FOLLOW_UP", "EMERGENCY").contains(normalized)) {
            throw badRequest("REGISTRATION_VISIT_TYPE_INVALID", "就诊类型不正确");
        }
        return normalized;
    }
}
