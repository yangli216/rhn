package com.rhn.outpatient.scheduling;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.outpatient.api.OutpatientScheduleDirectory;
import com.rhn.outpatient.api.RegistrationValidityPolicy;
import com.rhn.outpatient.api.EncounterFlowDirectory;
import com.rhn.outpatient.api.EncounterFlowDirectory.EncounterFlowSnapshot;
import com.rhn.queueing.api.QueueingDirectory;
import com.rhn.queueing.api.QueueingDirectory.TicketSnapshot;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import com.rhn.platform.tenant.TenantContext;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;

@Service
public class RegistrationApplicationService implements OutpatientRegistrationDirectory {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private final PatientRegistrationRepository registrationRepository;
    private final AppointmentRepository appointmentRepository;
    private final AppointmentEventRepository appointmentEventRepository;
    private final QueueingDirectory queueing;
    private final ServiceScheduleRepository scheduleRepository;
    private final ScheduleSlotPoolRepository poolRepository;
    private final SlotEventRepository slotEventRepository;
    private final OutpatientScheduleDirectory slotHolds;
    private final ResidentDirectory residentDirectory;
    private final ExecutionContextProvider contextProvider;
    private final RegistrationValidityPolicy validityPolicy;
    private final EncounterFlowDirectory encounterFlowDirectory;
    private final IdentityAccessDirectory identityAccessDirectory;
    private final OrganizationDirectory organizationDirectory;

    public RegistrationApplicationService(PatientRegistrationRepository registrationRepository,
                                          AppointmentRepository appointmentRepository,
                                          AppointmentEventRepository appointmentEventRepository,
                                          QueueingDirectory queueing,
                                          ServiceScheduleRepository scheduleRepository,
                                          ScheduleSlotPoolRepository poolRepository,
                                          SlotEventRepository slotEventRepository,
                                          OutpatientScheduleDirectory slotHolds,
                                          ResidentDirectory residentDirectory,
                                          ExecutionContextProvider contextProvider,
                                          RegistrationValidityPolicy validityPolicy,
                                          EncounterFlowDirectory encounterFlowDirectory,
                                          IdentityAccessDirectory identityAccessDirectory,
                                          OrganizationDirectory organizationDirectory) {
        this.registrationRepository = registrationRepository;
        this.appointmentRepository = appointmentRepository;
        this.appointmentEventRepository = appointmentEventRepository;
        this.queueing = queueing;
        this.scheduleRepository = scheduleRepository;
        this.poolRepository = poolRepository;
        this.slotEventRepository = slotEventRepository;
        this.slotHolds = slotHolds;
        this.residentDirectory = residentDirectory;
        this.contextProvider = contextProvider;
        this.validityPolicy = validityPolicy;
        this.encounterFlowDirectory = encounterFlowDirectory;
        this.identityAccessDirectory = identityAccessDirectory;
        this.organizationDirectory = organizationDirectory;
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
        ExecutionContext context = requireOrganizationContext(command.organizationId());
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
        TicketSnapshot ticket = queueing.checkInForOrganization(new QueueingDirectory.CheckInCommand(
                command.organizationId(), command.departmentId(), null,
                "OPD-" + command.organizationId() + "-" + command.departmentId(),
                "门诊候诊", "OUTPATIENT", "A", command.residentId(), command.encounterId(),
                "PAT_REG", registration.id(), 0, true, idempotencyCode));
        return snapshot(registration, ticket);
    }

    @Override
    @Transactional
    public void requireDirectReceptionAllowed(Long encounterId) {
        var context = contextProvider.requireCurrent();
        var registration = requireRegistrationWithLock(context.tenantId(), encounterId);
        if (!"REGISTERED".equals(registration.status())) {
            throw conflict("DIRECT_VISIT_REGISTRATION_INVALID", "该挂号已取消或失效，请重新选择有效挂号");
        }
        if (registration.scheduleId() != null) {
            var schedule = scheduleRepository.findByIdAndTenantId(registration.scheduleId(), context.tenantId())
                    .orElseThrow(() -> notFound("SERVICE_SCHEDULE_NOT_FOUND", "未找到挂号关联排班"));
            if (schedule.practitionerId() != null && !schedule.practitionerId().equals(context.practitionerId())) {
                throw conflict("DIRECT_VISIT_OTHER_PRACTITIONER", "该挂号指定了其他医生，请联系原接诊医生或按流程转诊");
            }
            if (schedule.startAt().isAfter(Instant.now()) || !"PUBLISHED".equals(schedule.status())) {
                throw conflict("DIRECT_VISIT_SCHEDULE_UNAVAILABLE", "原挂号对应排班尚未开始或不可接诊，请核对排班状态");
            }
        }
    }

    @Override
    @Transactional
    public void markInService(Long encounterId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistrationWithLock(context.tenantId(), encounterId);
        queueing.startBySource("PAT_REG", registration.id(), commandCode, null, "医生开始接诊", true);
        registration.start();
    }

    @Override
    @Transactional
    public void markSuspended(Long encounterId, String commandCode, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        queueing.suspendBySource("PAT_REG", registration.id(), commandCode, "门诊接诊暂挂：" + reason);
    }

    @Override
    @Transactional
    public void markResumed(Long encounterId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        queueing.resumeBySource("PAT_REG", registration.id(), commandCode, null, "患者返回并恢复接诊");
    }

    @Override
    @Transactional
    public void markCompleted(Long encounterId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        queueing.completeBySource("PAT_REG", registration.id(), commandCode, "本次门诊接诊完成");
        registration.complete();
        if (registration.appointmentId() != null) {
            appointmentRepository.findByIdAndTenantId(registration.appointmentId(), context.tenantId())
                    .filter(appointment -> appointment.visited(context.subjectId()))
                    .ifPresent(appointment -> appointmentEventRepository.save(new AppointmentEvent(
                            context.tenantId(), appointment.id(), null, "VISITED", "REGISTERED", "VISITED",
                            commandCode, context.subjectId(), "门诊接诊完成")));
        }
    }

    @Override
    @Transactional
    public void markTransferred(Long encounterId, String commandCode, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        queueing.completeBySource("PAT_REG", registration.id(), commandCode, reason);
        registration.complete();
    }

    @Override
    @Transactional
    public void markTerminated(Long encounterId, String commandCode, String reason) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistration(context.tenantId(), encounterId);
        queueing.completeBySource("PAT_REG", registration.id(), commandCode, reason);
        registration.complete();
        if (registration.appointmentId() != null) {
            appointmentRepository.findByIdAndTenantId(registration.appointmentId(), context.tenantId())
                    .filter(appointment -> appointment.visited(context.subjectId()))
                    .ifPresent(appointment -> appointmentEventRepository.save(new AppointmentEvent(
                            context.tenantId(), appointment.id(), null, "VISITED", "REGISTERED", "VISITED",
                            commandCode, context.subjectId(), "接诊后终止诊疗")));
        }
    }

    @Override
    @Transactional
    public CancellationSnapshot requireCancellationReady(Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        PatientRegistration registration = requireRegistrationWithLock(context.tenantId(), encounterId);
        TicketSnapshot ticket = queueing.requireBySource("PAT_REG", registration.id());
        Appointment appointment = lockAppointment(context, registration);
        if (!"CANCELLED".equals(registration.status())) {
            if (!List.of("WAITING", "CALLED", "MISSED").contains(ticket.status())) {
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
        TicketSnapshot ticket = queueing.requireBySource("PAT_REG", registration.id());
        Appointment appointment = lockAppointment(context, registration);
        if ("CANCELLED".equals(registration.status())) {
            return cancellationSnapshot(registration, ticket, appointment);
        }
        if (!List.of("WAITING", "CALLED", "MISSED").contains(ticket.status())) {
            throw conflict("REGISTRATION_ALREADY_IN_SERVICE", "该挂号已经开始接诊，不能退号");
        }
        ticket = queueing.cancelBySource("PAT_REG", registration.id(), commandCode, reason);
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
        return queue(dateFrom, dateTo, ReceptionQueueScope.DEPARTMENT);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReceptionQueueItem> organizationQueue(LocalDate queueDate) {
        return queue(queueDate, queueDate, ReceptionQueueScope.ORGANIZATION);
    }

    @Transactional(readOnly = true)
    public List<ReceptionQueueItem> queue(LocalDate dateFrom, LocalDate dateTo, ReceptionQueueScope scope) {
        ExecutionContext context = requireOrganizationContext(null);
        ReceptionQueueScope resolvedScope = scope == null ? ReceptionQueueScope.DEPARTMENT : scope;
        boolean organizationScope = resolvedScope == ReceptionQueueScope.ORGANIZATION;
        requireDepartmentContextForDepartmentScope(context, organizationScope);
        LocalDate resolvedStart = dateFrom == null ? (dateTo == null ? LocalDate.now(BUSINESS_ZONE) : dateTo) : dateFrom;
        LocalDate resolvedEnd = dateTo == null ? resolvedStart : dateTo;
        if (resolvedEnd.isBefore(resolvedStart)) {
            LocalDate tmp = resolvedStart;
            resolvedStart = resolvedEnd;
            resolvedEnd = tmp;
        }
        final LocalDate start = resolvedStart;
        final LocalDate end = resolvedEnd;
        Instant from = start.atStartOfDay(BUSINESS_ZONE).toInstant();
        Instant to = end.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();

        int validityDays = validityPolicy.resolveValidityDays(context.tenantId(), context.subjectId(),
                context.organizationId(), context.departmentId());
        Instant queryFrom = start.minusDays(validityDays).atStartOfDay(BUSINESS_ZONE).toInstant();
        if (queryFrom.isAfter(from)) {
            queryFrom = from;
        }

        List<PatientRegistration> registrations = organizationScope
                ? registrationRepository
                    .findByTenantIdAndOrganizationIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAt(
                            context.tenantId(), context.organizationId(), queryFrom, to)
                : registrationRepository
                    .findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAt(
                            context.tenantId(), context.organizationId(), context.departmentId(), queryFrom, to);
        if (registrations.isEmpty()) return List.of();
        Map<Long, TicketSnapshot> tickets = queueing.findBySources("PAT_REG",
                registrations.stream().map(PatientRegistration::id).toList());
        Map<Long, ServiceSchedule> schedules = registrations.stream().map(PatientRegistration::scheduleId)
                .filter(java.util.Objects::nonNull).distinct()
                .map(id -> scheduleRepository.findByIdAndTenantId(id, context.tenantId()).orElse(null))
                .filter(java.util.Objects::nonNull).collect(Collectors.toMap(ServiceSchedule::id, Function.identity()));
        Map<Long, EncounterFlowSnapshot> encounters = encounterFlowDirectory.findByIds(context.tenantId(),
                        registrations.stream().map(PatientRegistration::encounterId).toList())
                .stream().collect(Collectors.toMap(EncounterFlowSnapshot::encounterId, Function.identity(),
                        (first, ignored) -> first));

        Map<Long, String> queueOperatorCache = new HashMap<>();
        Map<Long, String> queueDepartmentCache = new HashMap<>();
        Map<String, String> clinicianNameCache = new HashMap<>();
        Instant now = Instant.now();

        boolean hasPersonalSchedule = false;
        if (!organizationScope && context.practitionerId() != null && context.departmentId() != null) {
            hasPersonalSchedule = scheduleRepository
                    .findByTenantIdAndOrganizationIdAndDepartmentIdAndServiceDateBetweenOrderByStartAt(
                            context.tenantId(), context.organizationId(), context.departmentId(), start, end)
                    .stream()
                    .anyMatch(s -> "PUBLISHED".equals(s.status())
                            && "PRACTITIONER".equalsIgnoreCase(s.registrationScope())
                            && context.practitionerId().equals(s.practitionerId()));
        }
        final boolean doctorHasPersonalSchedule = hasPersonalSchedule;

        return registrations.stream().filter(reg -> {
            LocalDate regDate = reg.registeredAt().atZone(BUSINESS_ZONE).toLocalDate();
            if (!regDate.isBefore(start) && !regDate.isAfter(end)) {
                return true;
            }
            Instant validUntil = validityPolicy.calculateCutoffTime(reg.registeredAt(), context.tenantId(),
                    context.subjectId(), reg.organizationId(), reg.departmentId());
            boolean expired = now.isAfter(validUntil) || now.equals(validUntil);
            TicketSnapshot ticket = tickets.get(reg.id());
            String ticketStatus = ticket == null ? null : ticket.status();
            boolean isCompleted = "COMPLETED".equalsIgnoreCase(ticketStatus)
                    || "CANCELLED".equalsIgnoreCase(ticketStatus)
                    || "CANCELLED".equalsIgnoreCase(reg.status());
            return !expired || isCompleted;
        }).filter(registration -> isVisibleInQueue(
                registration, schedules, encounters, tickets, context, resolvedScope, doctorHasPersonalSchedule
        )).map(registration -> {
            TicketSnapshot ticket = tickets.get(registration.id());
            ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshot(registration.residentId());
            ServiceSchedule schedule = registration.scheduleId() == null ? null : schedules.get(registration.scheduleId());
            EncounterFlowSnapshot encounter = encounters.get(registration.encounterId());
            Instant validUntil = validityPolicy.calculateCutoffTime(registration.registeredAt(), context.tenantId(),
                    context.subjectId(), registration.organizationId(), registration.departmentId());
            String registeredByName = resolveOperatorName(context.tenantId(), registration.registeredBy(), queueOperatorCache);
            Long deptId = registration.departmentId() != null ? registration.departmentId() : (schedule != null ? schedule.departmentId() : null);
            String departmentName = resolveDepartmentName(context.tenantId(), context.organizationId(), deptId, queueDepartmentCache);
            String dayPartText = resolveDayPartText(schedule);
            String clinicianId = encounter == null ? null : encounter.clinicianId();
            String clinicianName = resolveClinicianName(context.tenantId(), clinicianId, clinicianNameCache);

            return new ReceptionQueueItem(registration.id(), registration.appointmentId(), registration.scheduleId(),
                    registration.encounterId(), ticket == null ? null : ticket.id(),
                    ticket == null ? null : ticket.serviceQueueId(), resident.id(),
                    resident.healthRecordNo(), resident.fullName(), resident.gender(), resident.birthDate(),
                    registration.registrationNo(), ticket == null ? null : ticket.ticketCode(),
                    ticket == null ? 0 : ticket.sequenceNo(),
                    ticket == null ? 0 : ticket.priority(),
                    registration.registrationSource(), registration.visitType(),
                    registration.status(), ticket == null ? null : ticket.status(),
                    schedule == null ? null : schedule.practitionerName(),
                    schedule == null ? null : schedule.serviceName(),
                    schedule == null ? null : schedule.locationName(),
                    registration.registeredAt(), ticket == null ? null : ticket.readyAt(),
                    ticket == null ? null : ticket.calledAt(), ticket == null ? null : ticket.startedAt(),
                    ticket == null ? 0 : ticket.callCount(), ticket == null ? 0 : ticket.missedCount(),
                    ticket == null ? null : ticket.currentLocationId(), validUntil,
                    registeredByName, departmentName, dayPartText,
                    schedule == null ? null : schedule.practitionerId(), clinicianId, clinicianName,
                    encounter != null && encounter.completedAt() != null
                            ? encounter.completedAt() : ticket == null ? null : ticket.completedAt(),
                    deptId, resident.phone());
        }).sorted(Comparator.comparingInt(ReceptionQueueItem::priority).reversed()
                .thenComparingInt(ReceptionQueueItem::sequenceNo)).toList();
    }

    @Transactional(readOnly = true)
    public RegistrationPageView page(LocalDate dateFrom, LocalDate dateTo, String status, String query, int page, int size,
                                     boolean organizationScope) {
        ExecutionContext context = requireOrganizationContext(null);
        requireDepartmentContextForDepartmentScope(context, organizationScope);
        int safePage = Math.max(0, page);
        int safeSize = Math.min(100, Math.max(1, size));

        LocalDate start = dateFrom == null ? (dateTo == null ? LocalDate.now(BUSINESS_ZONE) : dateTo) : dateFrom;
        LocalDate end = dateTo == null ? start : dateTo;
        if (end.isBefore(start)) {
            LocalDate tmp = start;
            start = end;
            end = tmp;
        }
        Instant from = start.atStartOfDay(BUSINESS_ZONE).toInstant();
        Instant to = end.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
        List<PatientRegistration> registrations = organizationScope
                ? registrationRepository
                    .findByTenantIdAndOrganizationIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAt(
                            context.tenantId(), context.organizationId(), from, to)
                : registrationRepository
                    .findByTenantIdAndOrganizationIdAndDepartmentIdAndRegisteredAtGreaterThanEqualAndRegisteredAtLessThanOrderByRegisteredAt(
                            context.tenantId(), context.organizationId(), context.departmentId(), from, to);
        if (registrations.isEmpty()) {
            return new RegistrationPageView(List.of(), safePage, safeSize, 0, 0, safePage == 0, true);
        }

        Map<Long, TicketSnapshot> tickets = queueing.findBySources("PAT_REG",
                registrations.stream().map(PatientRegistration::id).toList());

        String normalizedStatus = clean(status);
        String normalizedQuery = clean(query);
        if (normalizedQuery != null) {
            normalizedQuery = normalizedQuery.toLowerCase(Locale.ROOT);
        }
        final String matchQuery = normalizedQuery;

        Map<Long, ResidentDirectory.ResidentSnapshot> residentCache = new HashMap<>();
        Map<Long, ServiceSchedule> scheduleCache = new HashMap<>();
        Map<Long, String> operatorCache = new HashMap<>();
        Map<Long, String> departmentCache = new HashMap<>();

        List<PatientRegistration> filtered = registrations.stream().filter(reg -> {
            TicketSnapshot ticket = tickets.get(reg.id());
            if (normalizedStatus != null) {
                String queueStatus = ticket == null ? null : ticket.status();
                if (!normalizedStatus.equalsIgnoreCase(queueStatus) && !normalizedStatus.equalsIgnoreCase(reg.status())) {
                    return false;
                }
            }
            if (matchQuery != null) {
                String ticketNo = ticket == null ? null : ticket.ticketCode();
                String regNo = reg.registrationNo();
                if (regNo != null && regNo.toLowerCase(Locale.ROOT).contains(matchQuery)) return true;
                if (ticketNo != null && ticketNo.toLowerCase(Locale.ROOT).contains(matchQuery)) return true;

                ResidentDirectory.ResidentSnapshot resident = residentCache.computeIfAbsent(reg.residentId(),
                        residentDirectory::requireSnapshot);
                if (resident != null) {
                    if (resident.fullName() != null && resident.fullName().toLowerCase(Locale.ROOT).contains(matchQuery)) return true;
                    if (resident.healthRecordNo() != null && resident.healthRecordNo().toLowerCase(Locale.ROOT).contains(matchQuery)) return true;
                }
                if (reg.scheduleId() != null) {
                    ServiceSchedule schedule = scheduleCache.computeIfAbsent(reg.scheduleId(),
                            id -> scheduleRepository.findByIdAndTenantId(id, context.tenantId()).orElse(null));
                    if (schedule != null) {
                        if (schedule.practitionerName() != null && schedule.practitionerName().toLowerCase(Locale.ROOT).contains(matchQuery)) return true;
                        if (schedule.serviceName() != null && schedule.serviceName().toLowerCase(Locale.ROOT).contains(matchQuery)) return true;
                        if (schedule.locationName() != null && schedule.locationName().toLowerCase(Locale.ROOT).contains(matchQuery)) return true;
                    }
                }
                if (reg.registeredBy() != null) {
                    String opName = resolveOperatorName(context.tenantId(), reg.registeredBy(), operatorCache);
                    if (opName != null && opName.toLowerCase(Locale.ROOT).contains(matchQuery)) return true;
                }
                Long dId = reg.departmentId();
                if (dId != null) {
                    String deptName = resolveDepartmentName(context.tenantId(), context.organizationId(), dId, departmentCache);
                    if (deptName != null && deptName.toLowerCase(Locale.ROOT).contains(matchQuery)) return true;
                }
                return false;
            }
            return true;
        }).sorted(Comparator.comparing(PatientRegistration::registeredAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(PatientRegistration::id, Comparator.nullsLast(Comparator.reverseOrder()))).toList();

        long totalElements = filtered.size();
        int totalPages = (int) Math.ceil((double) totalElements / safeSize);
        int fromIndex = Math.min((int) totalElements, safePage * safeSize);
        int toIndex = Math.min((int) totalElements, fromIndex + safeSize);
        List<PatientRegistration> slice = filtered.subList(fromIndex, toIndex);

        List<ReceptionQueueItem> content = slice.stream().map(registration -> {
            TicketSnapshot ticket = tickets.get(registration.id());
            ResidentDirectory.ResidentSnapshot resident = residentCache.computeIfAbsent(registration.residentId(),
                    residentDirectory::requireSnapshot);
            ServiceSchedule schedule = registration.scheduleId() == null ? null :
                    scheduleCache.computeIfAbsent(registration.scheduleId(),
                            id -> scheduleRepository.findByIdAndTenantId(id, context.tenantId()).orElse(null));
            String registeredByName = resolveOperatorName(context.tenantId(), registration.registeredBy(), operatorCache);
            Long deptId = registration.departmentId() != null ? registration.departmentId() : (schedule != null ? schedule.departmentId() : null);
            String departmentName = resolveDepartmentName(context.tenantId(), context.organizationId(), deptId, departmentCache);
            String dayPartText = resolveDayPartText(schedule);

            return new ReceptionQueueItem(registration.id(), registration.appointmentId(), registration.scheduleId(),
                    registration.encounterId(), ticket == null ? null : ticket.id(),
                    ticket == null ? null : ticket.serviceQueueId(), resident.id(), resident.healthRecordNo(),
                    resident.fullName(), resident.gender(), resident.birthDate(), registration.registrationNo(),
                    ticket == null ? null : ticket.ticketCode(),
                    ticket == null ? 0 : ticket.sequenceNo(),
                    ticket == null ? 0 : ticket.priority(),
                    registration.registrationSource(), registration.visitType(),
                    registration.status(), ticket == null ? null : ticket.status(),
                    schedule == null ? null : schedule.practitionerName(),
                    schedule == null ? null : schedule.serviceName(),
                    schedule == null ? null : schedule.locationName(), registration.registeredAt(),
                    ticket == null ? null : ticket.readyAt(), ticket == null ? null : ticket.calledAt(),
                    ticket == null ? null : ticket.startedAt(), ticket == null ? 0 : ticket.callCount(),
                    ticket == null ? 0 : ticket.missedCount(), ticket == null ? null : ticket.currentLocationId(),
                    null, registeredByName, departmentName, dayPartText,
                    schedule == null ? null : schedule.practitionerId(), null, null,
                    ticket == null ? null : ticket.completedAt(), deptId, resident.phone());
        }).toList();

        boolean first = safePage == 0;
        boolean last = totalPages == 0 || safePage >= totalPages - 1;
        return new RegistrationPageView(content, safePage, safeSize, totalElements, totalPages, first, last);
    }

    private String resolveOperatorName(Long tenantId, Long operatorUserId, Map<Long, String> cache) {
        if (operatorUserId == null) return null;
        return cache.computeIfAbsent(operatorUserId, id -> {
            try {
                var account = identityAccessDirectory.requireAccount(tenantId, id);
                if (account != null) {
                    if (account.practitionerId() != null) {
                        try {
                            var staff = organizationDirectory.requireStaff(tenantId, account.practitionerId());
                            if (staff != null && staff.practitioner() != null && staff.practitioner().fullName() != null) {
                                return staff.practitioner().fullName();
                            }
                        } catch (Exception ignored) {}
                    }
                    return account.username();
                }
            } catch (Exception ignored) {}
            return null;
        });
    }

    private boolean isExpertSchedule(ServiceSchedule schedule) {
        if (schedule == null) return false;
        String text = (java.util.Objects.toString(schedule.serviceName(), "") + " "
                + java.util.Objects.toString(schedule.practitionerName(), "") + " "
                + java.util.Objects.toString(schedule.serviceCode(), "")).toLowerCase(Locale.ROOT);
        return text.contains("专家") || text.contains("名医") || text.contains("名老中医")
                || text.contains("主任医师") || text.contains("副主任医师") || text.contains("exp");
    }

    private boolean isVisibleInQueue(PatientRegistration registration,
                                     Map<Long, ServiceSchedule> schedules,
                                     Map<Long, EncounterFlowSnapshot> encounters,
                                     Map<Long, TicketSnapshot> tickets,
                                     ExecutionContext context,
                                     ReceptionQueueScope scope,
                                     boolean hasPersonalSchedule) {
        ServiceSchedule schedule = registration.scheduleId() == null ? null : schedules.get(registration.scheduleId());
        EncounterFlowSnapshot encounter = encounters.get(registration.encounterId());

        boolean isServingByMe = encounter != null && encounter.clinicianId() != null
                && encounter.clinicianId().equalsIgnoreCase(context.actor());
        boolean isServingByOther = encounter != null && encounter.clinicianId() != null
                && !isServingByMe;

        boolean isMyPersonalSchedule = schedule != null && context.practitionerId() != null
                && context.practitionerId().equals(schedule.practitionerId());
        boolean isOtherPractitionerSchedule = schedule != null && schedule.practitionerId() != null
                && (context.practitionerId() == null || !context.practitionerId().equals(schedule.practitionerId()));

        boolean isExpert = isExpertSchedule(schedule);
        boolean isDepartmentGeneral = (schedule == null || schedule.practitionerId() == null) && !isExpert;

        if (scope == ReceptionQueueScope.ORGANIZATION) {
            return true;
        }

        if (scope == ReceptionQueueScope.PERSONAL) {
            // 本人已接诊/接诊中的患者，本人视角永远可见
            if (isServingByMe) {
                return true;
            }
            // 已被其他医生接诊中的患者，不出现在本人个人待诊池
            if (isServingByOther) {
                return false;
            }
            // 规则 1：如果医生坐诊时，存在本人的排班类型为医生的专属排班，则默认只能看到自己的
            if (hasPersonalSchedule) {
                return isMyPersonalSchedule;
            }
            // 规则 2：如果医生坐诊时，没有本人专属的排班信息，且患者挂号挂到科室（普通号），则默认出现在待诊队列
            return isMyPersonalSchedule || isDepartmentGeneral;
        }

        if (scope == ReceptionQueueScope.DEPARTMENT) {
            // 本人专属号或本人接诊中的患者在本科室视角自然可见
            if (isServingByMe || isMyPersonalSchedule) {
                return true;
            }
            // 规则 1：如果要看到同科室下的，需要切换视角，且只能看到普通号，专家和名医的不行
            // 排除其他医生的专家号、名医号
            if (isOtherPractitionerSchedule && isExpert) {
                return false;
            }
            // 排除明确属于其他医生的专属非普通号
            if (isOtherPractitionerSchedule && !isDepartmentGeneral) {
                return false;
            }
            return true;
        }

        return true;
    }

    private String resolveClinicianName(Long tenantId, String clinicianId, Map<String, String> cache) {
        if (clinicianId == null || clinicianId.isBlank()) return null;
        return cache.computeIfAbsent(clinicianId, username -> {
            try {
                var account = identityAccessDirectory.findActiveAccount(tenantId, username).orElse(null);
                if (account != null && account.practitionerId() != null) {
                    var staff = organizationDirectory.requireStaff(tenantId, account.practitionerId());
                    if (staff != null && staff.practitioner() != null
                            && staff.practitioner().fullName() != null) {
                        return staff.practitioner().fullName();
                    }
                }
            } catch (Exception ignored) {}
            return username;
        });
    }

    private String resolveDepartmentName(Long tenantId, Long organizationId, Long departmentId, Map<Long, String> cache) {
        if (departmentId == null) return null;
        return cache.computeIfAbsent(departmentId, id -> {
            try {
                var dept = organizationDirectory.requireDepartment(tenantId, organizationId, id);
                return dept != null ? dept.name() : null;
            } catch (Exception ignored) {
                return null;
            }
        });
    }

    private String resolveDayPartText(ServiceSchedule schedule) {
        if (schedule == null || schedule.dayPart() == null) return null;
        return switch (schedule.dayPart().toUpperCase(Locale.ROOT)) {
            case "MORNING" -> "上午";
            case "AFTERNOON" -> "下午";
            case "EVENING" -> "晚上";
            default -> schedule.dayPart();
        };
    }

    private String clean(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    private RegistrationSnapshot snapshot(PatientRegistration registration) {
        TicketSnapshot ticket = queueing.requireBySource("PAT_REG", registration.id());
        return snapshot(registration, ticket);
    }

    private RegistrationSnapshot snapshot(PatientRegistration registration, TicketSnapshot ticket) {
        return new RegistrationSnapshot(registration.id(), registration.appointmentId(), registration.scheduleId(),
                registration.encounterId(), registration.registrationNo(), ticket.ticketCode(), ticket.sequenceNo(),
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
        if (!schedule.organizationId().equals(command.organizationId())) {
            throw badRequest("SERVICE_SCHEDULE_CONTEXT_MISMATCH", "所选排班不属于当前机构");
        }
        if (!schedule.departmentId().equals(command.departmentId())) {
            throw badRequest("SERVICE_SCHEDULE_DEPARTMENT_MISMATCH", "挂号科室必须与所选排班的接诊科室一致");
        }
        if (!"PUBLISHED".equals(schedule.status())) {
            throw conflict("SERVICE_SCHEDULE_NOT_AVAILABLE", "所选排班当前不可挂号");
        }
        if (!schedule.serviceDate().equals(LocalDate.now(BUSINESS_ZONE))) {
            throw badRequest("SERVICE_SCHEDULE_NOT_TODAY", "现场挂号只能选择今天的排班");
        }
    }

    private Appointment lockAppointment(ExecutionContext context, PatientRegistration registration) {
        if (registration.appointmentId() == null) return null;
        return appointmentRepository.findWithLockByIdAndTenantId(registration.appointmentId(), context.tenantId())
                .orElseThrow(() -> notFound("APPOINTMENT_NOT_FOUND", "挂号关联的预约不存在"));
    }

    private CancellationSnapshot cancellationSnapshot(PatientRegistration registration, TicketSnapshot ticket,
                                                      Appointment appointment) {
        return new CancellationSnapshot(registration.id(), registration.appointmentId(), registration.scheduleId(),
                registration.status(), ticket.status(), appointment == null ? null : appointment.status());
    }

    private ExecutionContext requireOrganizationContext(Long organizationId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null) {
            throw badRequest("RECEPTION_USER_REQUIRED", "挂号操作必须绑定当前用户");
        }
        if (!context.hasWorkContext()) {
            throw badRequest("RECEPTION_WORK_CONTEXT_REQUIRED", "请先选择当前机构");
        }
        if (organizationId != null && !context.canAccessOrganization(organizationId)) {
            throw badRequest("RECEPTION_CONTEXT_MISMATCH", "挂号机构必须与当前工作上下文一致");
        }
        return context;
    }

    private void requireDepartmentContextForDepartmentScope(ExecutionContext context, boolean organizationScope) {
        if (!organizationScope && context.departmentId() == null) {
            throw badRequest("RECEPTION_WORK_CONTEXT_REQUIRED", "按科室查看挂号队列前请先选择当前科室");
        }
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

    @Override
    @Transactional(readOnly = true)
    public Map<Long, EncounterRegistrationDetail> findEncounterRegistrationDetails(Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return Map.of();
        Long tenantId = TenantContext.requireTenantId();
        List<PatientRegistration> regs = registrationRepository.findByTenantIdAndEncounterIdIn(tenantId, encounterIds);
        if (regs.isEmpty()) return Map.of();

        List<Long> scheduleIds = regs.stream().map(PatientRegistration::scheduleId)
                .filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, ServiceSchedule> scheduleMap = scheduleIds.isEmpty() ? Map.of() :
                scheduleRepository.findByTenantIdAndIdIn(tenantId, scheduleIds).stream()
                        .collect(Collectors.toMap(ServiceSchedule::id, s -> s, (a, b) -> a));

        Map<Long, TicketSnapshot> tickets = queueing.findBySources("PAT_REG",
                regs.stream().map(PatientRegistration::id).toList());

        Map<Long, EncounterRegistrationDetail> result = new HashMap<>();
        for (PatientRegistration reg : regs) {
            ServiceSchedule schedule = reg.scheduleId() == null ? null : scheduleMap.get(reg.scheduleId());
            TicketSnapshot ticket = tickets.get(reg.id());
            result.put(reg.encounterId(), new EncounterRegistrationDetail(
                    reg.encounterId(),
                    reg.id(),
                    reg.registrationNo(),
                    ticket == null ? null : ticket.ticketCode(),
                    reg.scheduleId(),
                    schedule == null ? null : schedule.serviceName(),
                    schedule == null ? null : schedule.practitionerName(),
                    schedule == null ? null : schedule.locationName()
            ));
        }
        return result;
    }
}
