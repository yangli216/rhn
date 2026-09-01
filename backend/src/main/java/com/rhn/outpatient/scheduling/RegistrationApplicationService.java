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
    private final AppointmentEventRepository appointmentEventRepository;
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
                                          AppointmentEventRepository appointmentEventRepository,
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
        this.appointmentEventRepository = appointmentEventRepository;
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
        if (command.appointmentId() != null) {
            if (command.slotHoldId() != null) {
                throw badRequest("APPOINTMENT_SLOT_HOLD_CONFLICT", "预约转挂号不能重复锁定号源");
            }
            appointment = appointmentRepository.findWithLockByIdAndTenantId(command.appointmentId(), context.tenantId())
                    .orElseThrow(() -> notFound("APPOINTMENT_NOT_FOUND", "未找到预约记录"));
            if (!appointment.residentId().equals(command.residentId())) {
                throw badRequest("APPOINTMENT_RESIDENT_MISMATCH", "预约居民与本次挂号居民不一致");
            }
            if (command.scheduleId() != null && !appointment.scheduleId().equals(command.scheduleId())) {
                throw badRequest("APPOINTMENT_SCHEDULE_MISMATCH", "预约班次与本次挂号班次不一致");
            }
            schedule = scheduleRepository.findByIdAndTenantId(appointment.scheduleId(), context.tenantId())
                    .orElseThrow(() -> notFound("SERVICE_SCHEDULE_NOT_FOUND", "未找到预约关联排班"));
            validateRegistrationSchedule(command, context, schedule);
            appointment.checkIn(context.subjectId());
            appointmentEventRepository.save(new AppointmentEvent(context.tenantId(), appointment.id(), null,
                    "REGISTERED", "BOOKED", "REGISTERED", idempotencyCode, context.subjectId(), "预约到院并转换为门诊挂号"));
        } else if (command.scheduleId() != null) {
            schedule = scheduleRepository.findByIdAndTenantId(command.scheduleId(), context.tenantId())
                    .orElseThrow(() -> notFound("SERVICE_SCHEDULE_NOT_FOUND", "未找到所选排班"));
            validateRegistrationSchedule(command, context, schedule);
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
        PatientRegistration registration = requireRegistrationWithLock(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicketWithLock(context.tenantId(), registration.id());
        String previous = ticket.start();
        registration.start();
        appendTicketEvent(context, ticket, "STARTED", previous, "IN_SERVICE", commandCode, "医生开始接诊");
    }

    @Override
    @Transactional
    public void markSuspended(Long encounterId, String commandCode, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicket(context.tenantId(), registration.id());
        String previous = ticket.suspend();
        appendTicketEvent(context, ticket, "SUSPENDED", previous, "SUSPENDED", commandCode,
                "门诊接诊暂挂：" + reason);
    }

    @Override
    @Transactional
    public void markResumed(Long encounterId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicket(context.tenantId(), registration.id());
        String previous = ticket.resume();
        appendTicketEvent(context, ticket, "RESUMED", previous, "IN_SERVICE", commandCode, "患者返回并恢复接诊");
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
                    .filter(appointment -> appointment.visited(context.subjectId()))
                    .ifPresent(appointment -> appointmentEventRepository.save(new AppointmentEvent(
                            context.tenantId(), appointment.id(), null, "VISITED", "REGISTERED", "VISITED",
                            commandCode, context.subjectId(), "门诊接诊完成")));
        }
        appendTicketEvent(context, ticket, "COMPLETED", previous, "COMPLETED", commandCode, "本次门诊接诊完成");
    }

    @Override
    @Transactional
    public void markTransferred(Long encounterId, String commandCode, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicket(context.tenantId(), registration.id());
        String previous = ticket.transfer();
        registration.complete();
        appendTicketEvent(context, ticket, "TRANSFERRED", previous, "TRANSFERRED", commandCode, reason);
    }

    @Override
    @Transactional
    public void markTerminated(Long encounterId, String commandCode, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicket(context.tenantId(), registration.id());
        String previous = ticket.terminate();
        registration.complete();
        if (registration.appointmentId() != null) {
            appointmentRepository.findByIdAndTenantId(registration.appointmentId(), context.tenantId())
                    .filter(appointment -> appointment.visited(context.subjectId()))
                    .ifPresent(appointment -> appointmentEventRepository.save(new AppointmentEvent(
                            context.tenantId(), appointment.id(), null, "VISITED", "REGISTERED", "VISITED",
                            commandCode, context.subjectId(), "接诊后终止诊疗")));
        }
        appendTicketEvent(context, ticket, "TERMINATED", previous, "TERMINATED", commandCode, reason);
    }

    @Override
    @Transactional
    public CancellationSnapshot requireCancellationReady(Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistrationWithLock(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicketWithLock(context.tenantId(), registration.id());
        Appointment appointment = lockAppointment(context, registration);
        if (!"CANCELLED".equals(registration.status())) {
            if (!"WAITING".equals(ticket.status())) {
                throw conflict("REGISTRATION_ALREADY_IN_SERVICE", "该挂号已经开始接诊，不能退号");
            }
            if (appointment != null && !"REGISTERED".equals(appointment.status())) {
                throw conflict("APPOINTMENT_NOT_WITHDRAWABLE", "挂号关联预约当前状态不能退号");
            }
        }
        return cancellationSnapshot(registration, ticket, appointment);
    }

    @Override
    @Transactional
    public CancellationSnapshot cancelBeforeService(Long encounterId, String commandCode, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistrationWithLock(context.tenantId(), encounterId);
        QueueTicket ticket = requireTicketWithLock(context.tenantId(), registration.id());
        Appointment appointment = lockAppointment(context, registration);
        if ("CANCELLED".equals(registration.status())) {
            return cancellationSnapshot(registration, ticket, appointment);
        }
        if (!"WAITING".equals(ticket.status())) {
            throw conflict("REGISTRATION_ALREADY_IN_SERVICE", "该挂号已经开始接诊，不能退号");
        }
        String previous = ticket.cancel();
        registration.cancel();
        if (appointment != null) {
            String appointmentFrom = appointment.status();
            appointment.cancelAfterRegistration(reason, context.subjectId());
            ScheduleSlotPool pool = poolRepository.findWithLockByIdAndTenantId(
                            appointment.slotPoolId(), context.tenantId())
                    .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "挂号关联的号源池不存在"));
            pool.releaseOccupiedOne();
            int slotSequence = slotEventRepository
                    .findTopByTenantIdAndPoolIdOrderBySequenceNoDesc(context.tenantId(), pool.id())
                    .map(SlotEvent::sequenceNo).orElse(0) + 1;
            slotEventRepository.save(new SlotEvent(context.tenantId(), pool.id(), appointment.scheduleId(),
                    "RELEASED", slotSequence, 0, -1, commandCode, context.subjectId(), "退号返还共享号源"));
            if (appointmentEventRepository.findByTenantIdAndAppointmentIdAndCommandCode(
                    context.tenantId(), appointment.id(), commandCode).isEmpty()) {
                appointmentEventRepository.save(new AppointmentEvent(context.tenantId(), appointment.id(), null,
                        "CANCELLED", appointmentFrom, "CANCELLED", commandCode, context.subjectId(), reason));
            }
        }
        appendTicketEvent(context, ticket, "CANCELLED", previous, "CANCELLED", commandCode, reason);
        return cancellationSnapshot(registration, ticket, appointment);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReceptionQueueItem> queue(LocalDate queueDate) {
        return queue(queueDate, queueDate);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReceptionQueueItem> queue(LocalDate dateFrom, LocalDate dateTo) {
        ExecutionContext context = requireContext(null, null);
        LocalDate start = dateFrom == null ? (dateTo == null ? LocalDate.now(BUSINESS_ZONE) : dateTo) : dateFrom;
        LocalDate end = dateTo == null ? start : dateTo;
        if (end.isBefore(start)) {
            LocalDate tmp = start;
            start = end;
            end = tmp;
        }
        Instant from = start.atStartOfDay(BUSINESS_ZONE).toInstant();
        Instant to = end.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
        List<PatientRegistration> registrations = registrationRepository
                .findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAt(
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

    private PatientRegistration requireRegistrationWithLock(Long tenantId, Long encounterId) {
        return registrationRepository.findWithLockByTenantIdAndEncounterId(tenantId, encounterId)
                .orElseThrow(() -> notFound("PATIENT_REGISTRATION_NOT_FOUND", "未找到该次就诊的挂号记录"));
    }

    private void validateRegistrationSchedule(RegisterCommand command, ExecutionContext context,
                                                ServiceSchedule schedule) {
        if (!schedule.organizationId().equals(command.organizationId())
                || !schedule.departmentId().equals(command.departmentId())) {
            throw badRequest("SERVICE_SCHEDULE_CONTEXT_MISMATCH", "所选排班不属于当前机构科室");
        }
        if (!"PUBLISHED".equals(schedule.status())) {
            throw conflict("SERVICE_SCHEDULE_NOT_AVAILABLE", "所选排班当前不可挂号");
        }
        if (!schedule.serviceDate().equals(LocalDate.now(BUSINESS_ZONE))) {
            throw badRequest("SERVICE_SCHEDULE_NOT_TODAY", "现场挂号只能选择今天的排班");
        }
    }

    private QueueTicket requireTicket(Long tenantId, Long registrationId) {
        return ticketRepository.findByTenantIdAndRegistrationId(tenantId, registrationId)
                .orElseThrow(() -> notFound("QUEUE_TICKET_NOT_FOUND", "未找到该次挂号的候诊票"));
    }

    private QueueTicket requireTicketWithLock(Long tenantId, Long registrationId) {
        return ticketRepository.findWithLockByTenantIdAndRegistrationId(tenantId, registrationId)
                .orElseThrow(() -> notFound("QUEUE_TICKET_NOT_FOUND", "未找到该次挂号的候诊票"));
    }

    private Appointment lockAppointment(ExecutionContext context, PatientRegistration registration) {
        if (registration.appointmentId() == null) return null;
        return appointmentRepository.findWithLockByIdAndTenantId(registration.appointmentId(), context.tenantId())
                .orElseThrow(() -> notFound("APPOINTMENT_NOT_FOUND", "挂号关联的预约不存在"));
    }

    private CancellationSnapshot cancellationSnapshot(PatientRegistration registration, QueueTicket ticket,
                                                      Appointment appointment) {
        return new CancellationSnapshot(registration.id(), registration.appointmentId(), registration.scheduleId(),
                registration.status(), ticket.status(), appointment == null ? null : appointment.status());
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
        if (!List.of("WINDOW", "WALK_IN", "DIRECT", "EMERGENCY", "TRANSFER").contains(normalized)) {
            throw badRequest("REGISTRATION_SOURCE_INVALID", "挂号来源不正确");
        }
        return normalized;
    }

    private String normalizeVisitType(String value) {
        String normalized = value == null || value.isBlank() ? "GENERAL" : value.trim().toUpperCase();
        if (!List.of("GENERAL", "FOLLOW_UP", "EMERGENCY", "TRANSFER").contains(normalized)) {
            throw badRequest("REGISTRATION_VISIT_TYPE_INVALID", "就诊类型不正确");
        }
        return normalized;
    }
}
