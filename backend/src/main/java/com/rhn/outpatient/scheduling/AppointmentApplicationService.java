package com.rhn.outpatient.scheduling;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.OutpatientAppointmentDirectory;
import com.rhn.outpatient.scheduling.AppointmentContracts.AppointmentView;
import com.rhn.outpatient.scheduling.AppointmentContracts.CancelAppointmentRequest;
import com.rhn.outpatient.scheduling.AppointmentContracts.CreateAppointmentRequest;
import com.rhn.outpatient.scheduling.AppointmentContracts.RescheduleAppointmentRequest;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class AppointmentApplicationService implements OutpatientAppointmentDirectory {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    private static final List<String> ACTIVE_STATUSES = List.of("BOOKED", "REGISTERED");
    private static final List<String> BOOKING_SOURCES = List.of(
            "WINDOW", "PHONE", "INTERNAL", "PATIENT_APP", "WECHAT", "THIRD_PARTY");

    private final AppointmentRepository appointmentRepository;
    private final AppointmentEventRepository appointmentEventRepository;
    private final PatientRegistrationRepository registrationRepository;
    private final ServiceScheduleRepository scheduleRepository;
    private final ScheduleSlotPoolRepository poolRepository;
    private final SlotEventRepository slotEventRepository;
    private final ResidentDirectory residentDirectory;
    private final ExecutionContextProvider contextProvider;

    AppointmentApplicationService(AppointmentRepository appointmentRepository,
                                  AppointmentEventRepository appointmentEventRepository,
                                  PatientRegistrationRepository registrationRepository,
                                  ServiceScheduleRepository scheduleRepository,
                                  ScheduleSlotPoolRepository poolRepository,
                                  SlotEventRepository slotEventRepository,
                                  ResidentDirectory residentDirectory,
                                  ExecutionContextProvider contextProvider) {
        this.appointmentRepository = appointmentRepository;
        this.appointmentEventRepository = appointmentEventRepository;
        this.registrationRepository = registrationRepository;
        this.scheduleRepository = scheduleRepository;
        this.poolRepository = poolRepository;
        this.slotEventRepository = slotEventRepository;
        this.residentDirectory = residentDirectory;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    List<AppointmentView> list(LocalDate dateFrom, LocalDate dateTo, String status, String query) {
        ExecutionContext context = requireContext();
        LocalDate from = dateFrom == null ? LocalDate.now(BUSINESS_ZONE) : dateFrom;
        LocalDate to = dateTo == null ? from.plusDays(30) : dateTo;
        requireDateRange(from, to);
        String normalizedStatus = normalizeOptionalStatus(status);

        List<ServiceSchedule> schedules = scheduleRepository
                .findByTenantIdAndOrganizationIdAndDepartmentIdAndServiceDateBetweenOrderByStartAt(
                        context.tenantId(), context.organizationId(), context.departmentId(), from, to);
        if (schedules.isEmpty()) return List.of();
        Map<Long, ServiceSchedule> scheduleById = schedules.stream()
                .collect(Collectors.toMap(ServiceSchedule::id, Function.identity()));
        Instant start = from.atStartOfDay(BUSINESS_ZONE).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
        String normalizedQuery = clean(query);
        if (normalizedQuery != null) normalizedQuery = normalizedQuery.toLowerCase(Locale.ROOT);

        String filter = normalizedQuery;
        return appointmentRepository.findByTenantIdAndScheduleIdInAndStartAtBetweenOrderByStartAt(
                        context.tenantId(), scheduleById.keySet(), start, end).stream()
                .filter(value -> normalizedStatus == null || normalizedStatus.equals(value.status()))
                .map(value -> toView(value, scheduleById.get(value.scheduleId())))
                .filter(value -> filter == null || matches(value, filter))
                .sorted(Comparator.comparing(AppointmentView::startAt).thenComparing(AppointmentView::appointmentNo))
                .toList();
    }

    @Transactional(readOnly = true)
    AppointmentView get(Long appointmentId) {
        ExecutionContext context = requireContext();
        Appointment appointment = appointmentRepository.findByIdAndTenantId(appointmentId, context.tenantId())
                .orElseThrow(() -> notFound("APPOINTMENT_NOT_FOUND", "未找到预约记录"));
        return requireScopedView(context, appointment);
    }

    @Override
    @Transactional
    public BookingSnapshot prepareRegistration(Long appointmentId, Long residentId,
                                               Long organizationId, Long departmentId) {
        ExecutionContext context = requireContext();
        if (!context.organizationId().equals(organizationId) || !context.departmentId().equals(departmentId)) {
            throw badRequest("APPOINTMENT_CONTEXT_MISMATCH", "预约挂号机构科室与当前工作上下文不一致");
        }
        Appointment appointment = appointmentRepository.findWithLockByIdAndTenantId(appointmentId, context.tenantId())
                .orElseThrow(() -> notFound("APPOINTMENT_NOT_FOUND", "未找到预约记录"));
        ServiceSchedule schedule = requireScopedSchedule(context, appointment.scheduleId());
        if (!appointment.residentId().equals(residentId)) {
            throw badRequest("APPOINTMENT_RESIDENT_MISMATCH", "预约居民与本次挂号居民不一致");
        }
        if (!"BOOKED".equals(appointment.status())) {
            throw conflict("APPOINTMENT_NOT_CHECK_IN_READY", "预约当前状态不能办理挂号");
        }
        if (!schedule.serviceDate().equals(LocalDate.now(BUSINESS_ZONE))) {
            throw conflict("APPOINTMENT_NOT_TODAY", "只能在预约就诊当日办理挂号");
        }
        return new BookingSnapshot(appointment.id(), appointment.residentId(), schedule.id(),
                schedule.catalogItemId(), appointment.serviceCode(), appointment.serviceName());
    }

    @Transactional
    AppointmentView create(CreateAppointmentRequest request) {
        ExecutionContext context = requireContext();
        String commandCode = requireCode(request.idempotencyCode());
        Optional<Appointment> replay = appointmentRepository
                .findByTenantIdAndIdempotencyCode(context.tenantId(), commandCode);
        if (replay.isPresent()) return requireScopedView(context, replay.get());

        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshotForUpdate(request.residentId());
        if (resident.deceased()) throw conflict("APPOINTMENT_RESIDENT_DECEASED", "已登记死亡的居民不能新建预约");
        ServiceSchedule schedule = requireBookableSchedule(context, request.scheduleId());
        if (appointmentRepository.existsByTenantIdAndResidentIdAndScheduleIdAndStatusIn(
                context.tenantId(), resident.id(), schedule.id(), ACTIVE_STATUSES)) {
            throw conflict("APPOINTMENT_ACTIVE_DUPLICATE", "该居民在所选班次已有有效预约");
        }
        ScheduleSlotPool pool = poolRepository.findByTenantIdAndScheduleId(context.tenantId(), schedule.id())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "所选排班缺少号源池"));
        pool.occupyOne();
        String source = normalizeSource(request.bookingSource());
        Appointment appointment = appointmentRepository.save(new Appointment(context.tenantId(), schedule, pool,
                resident.id(), commandCode, source, null, context.subjectId()));
        appendSlotEvent(context, pool, schedule.id(), "OCCUPIED", 1, commandCode, "预约确认占用共享号源");
        appointmentEventRepository.save(new AppointmentEvent(context.tenantId(), appointment.id(), null,
                "BOOKED", null, "BOOKED", commandCode, context.subjectId(),
                clean(request.reason()) == null ? "工作人员创建预约" : clean(request.reason())));
        return toView(appointment, schedule, resident);
    }

    @Transactional
    AppointmentView cancel(Long appointmentId, CancelAppointmentRequest request) {
        ExecutionContext context = requireContext();
        String commandCode = requireCode(request.commandCode());
        Appointment appointment = appointmentRepository.findWithLockByIdAndTenantId(appointmentId, context.tenantId())
                .orElseThrow(() -> notFound("APPOINTMENT_NOT_FOUND", "未找到预约记录"));
        Optional<AppointmentEvent> replay = appointmentEventRepository
                .findByTenantIdAndAppointmentIdAndCommandCode(context.tenantId(), appointment.id(), commandCode);
        if (replay.isPresent()) return requireScopedView(context, appointment);
        ServiceSchedule schedule = requireScopedSchedule(context, appointment.scheduleId());
        if (registrationRepository.existsByTenantIdAndAppointmentId(context.tenantId(), appointment.id())) {
            throw conflict("APPOINTMENT_ALREADY_REGISTERED", "该预约已转为挂号，请通过撤号流程处理");
        }
        ScheduleSlotPool pool = poolRepository.findWithLockByIdAndTenantId(
                        appointment.slotPoolId(), context.tenantId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "预约关联的号源池不存在"));
        String previous = appointment.status();
        appointment.cancel(request.reason().trim(), context.subjectId());
        pool.releaseOccupiedOne();
        appendSlotEvent(context, pool, schedule.id(), "RELEASED", -1, commandCode, "取消预约返还共享号源");
        appointmentEventRepository.save(new AppointmentEvent(context.tenantId(), appointment.id(), null,
                "CANCELLED", previous, "CANCELLED", commandCode, context.subjectId(), request.reason().trim()));
        return toView(appointment, schedule);
    }

    @Transactional
    AppointmentView reschedule(Long appointmentId, RescheduleAppointmentRequest request) {
        ExecutionContext context = requireContext();
        String commandCode = requireCode(request.commandCode());
        Appointment original = appointmentRepository.findWithLockByIdAndTenantId(appointmentId, context.tenantId())
                .orElseThrow(() -> notFound("APPOINTMENT_NOT_FOUND", "未找到预约记录"));
        Optional<AppointmentEvent> replay = appointmentEventRepository
                .findByTenantIdAndAppointmentIdAndCommandCode(context.tenantId(), original.id(), commandCode);
        if (replay.isPresent() && replay.get().replacementAppointmentId() != null) {
            Appointment replacement = appointmentRepository
                    .findByIdAndTenantId(replay.get().replacementAppointmentId(), context.tenantId())
                    .orElseThrow(() -> notFound("APPOINTMENT_REPLACEMENT_NOT_FOUND", "改约后的预约记录不存在"));
            return requireScopedView(context, replacement);
        }
        if (!"BOOKED".equals(original.status())) {
            throw conflict("APPOINTMENT_NOT_RESCHEDULABLE", "只有待就诊预约可以改约");
        }
        if (registrationRepository.existsByTenantIdAndAppointmentId(context.tenantId(), original.id())) {
            throw conflict("APPOINTMENT_ALREADY_REGISTERED", "该预约已转为挂号，不能直接改约");
        }
        ServiceSchedule originalSchedule = requireScopedSchedule(context, original.scheduleId());
        ServiceSchedule targetSchedule = requireBookableSchedule(context, request.targetScheduleId());
        if (originalSchedule.id().equals(targetSchedule.id())) {
            throw badRequest("APPOINTMENT_SCHEDULE_UNCHANGED", "请选择不同的班次进行改约");
        }
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshotForUpdate(original.residentId());
        if (appointmentRepository.existsByTenantIdAndResidentIdAndScheduleIdAndStatusIn(
                context.tenantId(), resident.id(), targetSchedule.id(), ACTIVE_STATUSES)) {
            throw conflict("APPOINTMENT_TARGET_DUPLICATE", "该居民在目标班次已有有效预约");
        }

        ScheduleSlotPool sourceSnapshot = poolRepository
                .findSnapshotByTenantIdAndScheduleId(context.tenantId(), originalSchedule.id())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "原预约号源池不存在"));
        ScheduleSlotPool targetSnapshot = poolRepository
                .findSnapshotByTenantIdAndScheduleId(context.tenantId(), targetSchedule.id())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "目标排班缺少号源池"));
        List<ScheduleSlotPool> locked = List.of(sourceSnapshot, targetSnapshot).stream()
                .sorted(Comparator.comparing(ScheduleSlotPool::id))
                .map(value -> poolRepository.findWithLockByIdAndTenantId(value.id(), context.tenantId())
                        .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "预约号源池不存在")))
                .toList();
        Map<Long, ScheduleSlotPool> lockedById = locked.stream()
                .collect(Collectors.toMap(ScheduleSlotPool::id, Function.identity()));
        ScheduleSlotPool sourcePool = lockedById.get(sourceSnapshot.id());
        ScheduleSlotPool targetPool = lockedById.get(targetSnapshot.id());
        targetPool.occupyOne();
        sourcePool.releaseOccupiedOne();

        Appointment replacement = appointmentRepository.save(new Appointment(context.tenantId(), targetSchedule,
                targetPool, resident.id(), commandCode, original.bookingSource(), original.id(), context.subjectId()));
        String previous = original.status();
        original.cancel("改约：" + request.reason().trim(), context.subjectId());
        appendSlotEvent(context, sourcePool, originalSchedule.id(), "RELEASED", -1,
                commandCode, "改约返还原班次号源");
        appendSlotEvent(context, targetPool, targetSchedule.id(), "OCCUPIED", 1,
                commandCode, "改约占用目标班次号源");
        appointmentEventRepository.save(new AppointmentEvent(context.tenantId(), original.id(), replacement.id(),
                "RESCHEDULED", previous, "CANCELLED", commandCode, context.subjectId(), request.reason().trim()));
        appointmentEventRepository.save(new AppointmentEvent(context.tenantId(), replacement.id(), null,
                "BOOKED", null, "BOOKED", commandCode, context.subjectId(), "由预约 " + original.appointmentNo() + " 改约生成"));
        return toView(replacement, targetSchedule, resident);
    }

    private void appendSlotEvent(ExecutionContext context, ScheduleSlotPool pool, Long scheduleId,
                                 String eventType, int occupiedDelta, String commandCode, String description) {
        int sequence = slotEventRepository.findTopByTenantIdAndPoolIdOrderBySequenceNoDesc(
                context.tenantId(), pool.id()).map(SlotEvent::sequenceNo).orElse(0) + 1;
        slotEventRepository.save(new SlotEvent(context.tenantId(), pool.id(), scheduleId, eventType, sequence,
                0, occupiedDelta, commandCode, context.subjectId(), description));
    }

    private AppointmentView requireScopedView(ExecutionContext context, Appointment appointment) {
        return toView(appointment, requireScopedSchedule(context, appointment.scheduleId()));
    }

    private AppointmentView toView(Appointment appointment, ServiceSchedule schedule) {
        return toView(appointment, schedule, residentDirectory.requireSnapshot(appointment.residentId()));
    }

    private AppointmentView toView(Appointment appointment, ServiceSchedule schedule,
                                   ResidentDirectory.ResidentSnapshot resident) {
        return new AppointmentView(appointment.id(), appointment.revision(), appointment.appointmentNo(),
                resident.id(), resident.healthRecordNo(), resident.fullName(), resident.gender(), resident.birthDate(),
                schedule.id(), schedule.scheduleCode(), schedule.serviceDate(), schedule.dayPart(),
                appointment.startAt(), appointment.endAt(), appointment.practitionerId(), appointment.practitionerName(),
                appointment.serviceCode(), appointment.serviceName(), schedule.locationName(), appointment.status(),
                appointment.bookingSource(), appointment.confirmedAt(), appointment.checkedInAt(),
                appointment.cancelledAt(), appointment.cancellationReason(), appointment.rescheduledFromId(),
                appointment.createdAt(), appointment.updatedAt());
    }

    private boolean matches(AppointmentView value, String query) {
        return value.appointmentNo().toLowerCase(Locale.ROOT).contains(query)
                || value.residentName().toLowerCase(Locale.ROOT).contains(query)
                || value.healthRecordNo().toLowerCase(Locale.ROOT).contains(query);
    }

    private ServiceSchedule requireBookableSchedule(ExecutionContext context, Long scheduleId) {
        ServiceSchedule schedule = requireScopedSchedule(context, scheduleId);
        if (!"PUBLISHED".equals(schedule.status())) {
            throw conflict("SERVICE_SCHEDULE_NOT_AVAILABLE", "所选排班当前不可预约");
        }
        if (!schedule.startAt().isAfter(Instant.now())) {
            throw conflict("SERVICE_SCHEDULE_ALREADY_STARTED", "所选排班已经开始，不能再预约");
        }
        return schedule;
    }

    private ServiceSchedule requireScopedSchedule(ExecutionContext context, Long scheduleId) {
        ServiceSchedule schedule = scheduleRepository.findByIdAndTenantId(scheduleId, context.tenantId())
                .orElseThrow(() -> notFound("SERVICE_SCHEDULE_NOT_FOUND", "未找到所选排班"));
        if (!schedule.organizationId().equals(context.organizationId())
                || !schedule.departmentId().equals(context.departmentId())) {
            throw badRequest("APPOINTMENT_CONTEXT_MISMATCH", "预约不属于当前机构科室");
        }
        return schedule;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null || !context.hasWorkContext() || context.departmentId() == null) {
            throw badRequest("APPOINTMENT_WORK_CONTEXT_REQUIRED", "请先选择预约办理的机构和科室");
        }
        return context;
    }

    private void requireDateRange(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) throw badRequest("APPOINTMENT_DATE_RANGE_INVALID", "结束日期不能早于开始日期");
        if (to.isAfter(from.plusDays(92))) {
            throw badRequest("APPOINTMENT_DATE_RANGE_TOO_LARGE", "单次最多查询 93 天预约");
        }
    }

    private String requireCode(String value) {
        String normalized = clean(value);
        if (normalized == null || normalized.length() > 128) {
            throw badRequest("APPOINTMENT_COMMAND_REQUIRED", "预约操作必须提供不超过 128 位的业务命令号");
        }
        return normalized;
    }

    private String normalizeSource(String value) {
        String normalized = requireCode(value).toUpperCase(Locale.ROOT);
        if (!BOOKING_SOURCES.contains(normalized)) {
            throw badRequest("APPOINTMENT_SOURCE_INVALID", "预约来源不正确");
        }
        return normalized;
    }

    private String normalizeOptionalStatus(String value) {
        String normalized = clean(value);
        if (normalized == null) return null;
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!List.of("BOOKED", "REGISTERED", "VISITED", "CANCELLED", "NO_SHOW").contains(normalized)) {
            throw badRequest("APPOINTMENT_STATUS_INVALID", "预约状态不正确");
        }
        return normalized;
    }

    private String clean(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }
}
