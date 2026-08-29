package com.rhn.outpatient.scheduling;

import cn.hutool.core.util.StrUtil;
import com.rhn.outpatient.scheduling.SchedulingContracts.PeriodDefault;
import com.rhn.outpatient.scheduling.SchedulingContracts.PractitionerOption;
import com.rhn.outpatient.scheduling.SchedulingContracts.QuickScheduleRequest;
import com.rhn.outpatient.scheduling.SchedulingContracts.QuickScheduleResult;
import com.rhn.outpatient.scheduling.SchedulingContracts.ScheduleView;
import com.rhn.outpatient.scheduling.SchedulingContracts.SchedulingBootstrap;
import com.rhn.outpatient.scheduling.SchedulingContracts.ChangeScheduleStatusRequest;
import com.rhn.outpatient.scheduling.SchedulingContracts.UpdateScheduleRequest;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory.ServiceCatalogSnapshot;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.StaffAssignmentView;
import com.rhn.platform.organization.api.StaffDetailView;
import com.rhn.platform.organization.api.StaffView;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.idempotency.CommandCodes;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class SchedulingApplicationService {
    static final String MODE_KEY = "outpatient.scheduling.management-mode";
    static final String CAPACITY_KEY = "outpatient.scheduling.simple.default-capacity";
    static final String GENERATE_DAYS_KEY = "outpatient.scheduling.simple.generate-days";
    static final String MORNING_KEY = "outpatient.scheduling.simple.morning-period";
    static final String AFTERNOON_KEY = "outpatient.scheduling.simple.afternoon-period";

    private final ServiceResourceRepository resourceRepository;
    private final ScheduleTemplateRepository templateRepository;
    private final ScheduleTemplatePeriodRepository periodRepository;
    private final ScheduleGenerationRunRepository runRepository;
    private final ServiceScheduleRepository scheduleRepository;
    private final ScheduleSlotPoolRepository poolRepository;
    private final ServiceScheduleEventRepository scheduleEventRepository;
    private final SlotEventRepository slotEventRepository;
    private final OrganizationDirectory organizationDirectory;
    private final ServiceCatalogDirectory serviceCatalogDirectory;
    private final ConfigurationDirectory configurationDirectory;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    SchedulingApplicationService(ServiceResourceRepository resourceRepository,
                                 ScheduleTemplateRepository templateRepository,
                                 ScheduleTemplatePeriodRepository periodRepository,
                                 ScheduleGenerationRunRepository runRepository,
                                 ServiceScheduleRepository scheduleRepository,
                                 ScheduleSlotPoolRepository poolRepository,
                                 ServiceScheduleEventRepository scheduleEventRepository,
                                 SlotEventRepository slotEventRepository,
                                 OrganizationDirectory organizationDirectory,
                                 ServiceCatalogDirectory serviceCatalogDirectory,
                                 ConfigurationDirectory configurationDirectory,
                                 ExecutionContextProvider contextProvider,
                                 JsonCodec jsonCodec) {
        this.resourceRepository = resourceRepository;
        this.templateRepository = templateRepository;
        this.periodRepository = periodRepository;
        this.runRepository = runRepository;
        this.scheduleRepository = scheduleRepository;
        this.poolRepository = poolRepository;
        this.scheduleEventRepository = scheduleEventRepository;
        this.slotEventRepository = slotEventRepository;
        this.organizationDirectory = organizationDirectory;
        this.serviceCatalogDirectory = serviceCatalogDirectory;
        this.configurationDirectory = configurationDirectory;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    SchedulingBootstrap bootstrap() {
        ExecutionContext context = requireWorkContext();
        PeriodDefault morning = periodValue(context, MORNING_KEY);
        PeriodDefault afternoon = periodValue(context, AFTERNOON_KEY);
        LocalDate today = LocalDate.now();
        List<PractitionerOption> practitioners = organizationDirectory.listStaff(context.tenantId()).stream()
                .filter(value -> "ACTIVE".equals(value.sdPersonnelStatus()))
                .map(value -> optionFor(context, value, today))
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(PractitionerOption::name))
                .toList();
        return new SchedulingBootstrap(textValue(context, MODE_KEY), intValue(context, CAPACITY_KEY),
                intValue(context, GENERATE_DAYS_KEY), morning, afternoon, practitioners);
    }

    @Transactional(readOnly = true)
    List<ScheduleView> list(LocalDate dateFrom, LocalDate dateTo) {
        ExecutionContext context = requireWorkContext();
        LocalDate from = dateFrom == null ? LocalDate.now() : dateFrom;
        LocalDate to = dateTo == null ? from.plusDays(13) : dateTo;
        requireDateRange(from, to, false);
        return toViews(context.tenantId(), scheduleRepository
                .findByTenantIdAndOrganizationIdAndDepartmentIdAndServiceDateBetweenOrderByStartAt(
                        context.tenantId(), context.organizationId(), context.departmentId(), from, to));
    }

    @Transactional
    QuickScheduleResult quickCreate(QuickScheduleRequest request) {
        ExecutionContext context = requireWorkContext();
        requireQuickRequest(request);
        String idempotencyCode = request.idempotencyCode().trim();
        ScheduleGenerationRun replay = runRepository
                .findByTenantIdAndIdempotencyCode(context.tenantId(), idempotencyCode).orElse(null);
        if (replay != null) {
            List<ServiceSchedule> existing = scheduleRepository
                    .findByTenantIdAndGenerationRunIdOrderByStartAt(context.tenantId(), replay.id());
            return new QuickScheduleResult(replay.id(), true, replay.generatedCount(), replay.skippedCount(),
                    toViews(context.tenantId(), existing));
        }

        StaffDetailView staff = organizationDirectory.requireStaff(context.tenantId(), request.practitionerId());
        StaffAssignmentView assignment = assignmentFor(context, staff, request.dateFrom(), request.dateTo());
        ServiceCatalogSnapshot service = serviceCatalogDirectory.requireActiveService(
                context.tenantId(), request.catalogItemId(), request.dateFrom());
        serviceCatalogDirectory.requireActiveService(context.tenantId(), request.catalogItemId(), request.dateTo());
        String timezoneCode = StrUtil.blankToDefault(organizationDirectory
                .requireOrganization(context.tenantId(), context.organizationId()).timezoneCode(), "Asia/Shanghai");
        ZoneId zoneId = ZoneId.of(timezoneCode);
        String locationName = StrUtil.isBlank(request.locationName()) ? null : request.locationName().trim();

        ServiceResource resource = resourceRepository
                .findByTenantIdAndOrganizationIdAndDepartmentIdAndPractitionerIdAndCatalogItemId(
                        context.tenantId(), context.organizationId(), context.departmentId(),
                        request.practitionerId(), request.catalogItemId())
                .orElseGet(() -> new ServiceResource(context.tenantId(), context.organizationId(),
                        context.departmentId(), request.practitionerId(), assignment.id(), request.catalogItemId(),
                        staff.practitioner().fullName(), service.code(), service.name(), context.subjectId()));
        resource.refresh(assignment.id(), staff.practitioner().fullName(), service.code(), service.name(), context.subjectId());
        resourceRepository.saveAndFlush(resource);

        ScheduleTemplate template = templateRepository.saveAndFlush(new ScheduleTemplate(context.tenantId(),
                resource.id(), staff.practitioner().fullName() + "简易门诊排班", timezoneCode,
                request.dateFrom(), request.dateTo(), context.subjectId()));
        List<ScheduleTemplatePeriod> periods = buildPeriods(context.tenantId(), template.id(), request);
        periodRepository.saveAllAndFlush(periods);

        ScheduleGenerationRun run = runRepository.saveAndFlush(new ScheduleGenerationRun(context.tenantId(),
                template.id(), idempotencyCode, request.dateFrom(), request.dateTo(), jsonCodec.write(request),
                context.subjectId()));
        List<ServiceSchedule> generated = new ArrayList<>();
        int skipped = 0;
        for (LocalDate date = request.dateFrom(); !date.isAfter(request.dateTo()); date = date.plusDays(1)) {
            LocalDate serviceDate = date;
            int dayOfWeek = date.getDayOfWeek().getValue();
            if (!request.weekdays().contains(dayOfWeek)) continue;
            for (ScheduleDayPart dayPart : request.dayParts()) {
                ScheduleTemplatePeriod period = periods.stream()
                        .filter(value -> value.dayOfWeek() == dayOfWeek && value.dayPart().equals(dayPart.name()))
                        .findFirst().orElseThrow();
                Instant startAt = date.atTime(toTime(period.minuteStart())).atZone(zoneId).toInstant();
                Instant endAt = date.atTime(toTime(period.minuteEnd())).atZone(zoneId).toInstant();
                boolean overlaps = scheduleRepository.countPractitionerOverlaps(context.tenantId(),
                        request.practitionerId(), date, 0L, startAt, endAt) > 0
                        || generated.stream().anyMatch(value -> value.serviceDate().equals(serviceDate)
                        && value.practitionerId().equals(request.practitionerId())
                        && value.startAt().isBefore(endAt) && value.endAt().isAfter(startAt));
                if (overlaps || scheduleRepository.existsByTenantIdAndResourceIdAndStartAtAndEndAt(
                        context.tenantId(), resource.id(), startAt, endAt)) {
                    skipped++;
                    continue;
                }
                generated.add(new ServiceSchedule(context.tenantId(), resource.id(), template.id(), period.id(),
                        run.id(), context.organizationId(), context.departmentId(), request.practitionerId(),
                        assignment.id(), request.catalogItemId(), dayPart, staff.practitioner().fullName(),
                        service.code(), service.name(), locationName, timezoneCode, date, startAt, endAt,
                        request.capacity(), context.subjectId()));
            }
        }
        scheduleRepository.saveAllAndFlush(generated);

        List<ScheduleSlotPool> pools = generated.stream()
                .map(value -> new ScheduleSlotPool(context.tenantId(), value.id(), request.capacity()))
                .toList();
        poolRepository.saveAllAndFlush(pools);
        Map<Long, ScheduleSlotPool> poolsBySchedule = pools.stream()
                .collect(Collectors.toMap(ScheduleSlotPool::scheduleId, Function.identity()));
        scheduleEventRepository.saveAll(generated.stream()
                .map(value -> new ServiceScheduleEvent(context.tenantId(), value.id(),
                        idempotencyCode + ":schedule:" + value.id(), context.subjectId()))
                .toList());
        slotEventRepository.saveAll(generated.stream().map(value -> {
            ScheduleSlotPool pool = poolsBySchedule.get(value.id());
            return new SlotEvent(context.tenantId(), pool.id(), value.id(), pool.totalCount(),
                    idempotencyCode + ":pool:" + pool.id(), context.subjectId());
        }).toList());
        run.complete(generated.size(), skipped);
        runRepository.save(run);
        return new QuickScheduleResult(run.id(), false, generated.size(), skipped,
                toViews(context.tenantId(), generated));
    }

    @Transactional
    ScheduleView update(Long scheduleId, UpdateScheduleRequest request) {
        ExecutionContext context = requireWorkContext();
        ServiceSchedule schedule = requireScheduleForUpdate(context, scheduleId);
        String commandCode = request.commandCode().trim();
        if (scheduleEventRepository.existsByTenantIdAndScheduleIdAndCommandCode(
                context.tenantId(), schedule.id(), commandCode)) {
            return toView(context.tenantId(), schedule);
        }
        requireOperable(schedule);
        if (!"PUBLISHED".equals(schedule.status()) && !"SUSPENDED".equals(schedule.status())) {
            throw conflict("SCHEDULE_NOT_EDITABLE", "当前状态的班次不能修改");
        }
        if (!request.endTime().isAfter(request.startTime())) {
            throw badRequest("SCHEDULE_TIME_INVALID", "排班结束时间必须晚于开始时间");
        }
        ZoneId zoneId = ZoneId.of(schedule.timezoneCode());
        Instant startAt = schedule.serviceDate().atTime(request.startTime()).atZone(zoneId).toInstant();
        Instant endAt = schedule.serviceDate().atTime(request.endTime()).atZone(zoneId).toInstant();
        if (scheduleRepository.countPractitionerOverlaps(context.tenantId(), schedule.practitionerId(),
                schedule.serviceDate(), schedule.id(), startAt, endAt) > 0) {
            throw conflict("SCHEDULE_PRACTITIONER_TIME_OVERLAP", "所选医生在该时间段已有其他排班");
        }
        ScheduleSlotPool pool = requirePool(context.tenantId(), schedule.id());
        boolean timeChanged = !schedule.startAt().equals(startAt) || !schedule.endAt().equals(endAt);
        if (timeChanged && pool.heldCount() + pool.occupiedCount() > 0) {
            throw conflict("SCHEDULE_TIME_CHANGE_HAS_USAGE", "班次已有暂占或挂号记录，不能直接调整出诊时间");
        }
        int previousCapacity = pool.totalCount();
        pool.changeCapacity(request.capacity());
        String locationName = StrUtil.isBlank(request.locationName()) ? null : request.locationName().trim();
        schedule.update(startAt, endAt, request.capacity(), locationName, context.subjectId());
        scheduleEventRepository.save(new ServiceScheduleEvent(context.tenantId(), schedule.id(), "UPDATED",
                schedule.status(), schedule.status(), commandCode, context.subjectId(), request.reason().trim()));
        if (previousCapacity != request.capacity()) {
            int sequence = nextSlotSequence(context.tenantId(), pool.id());
            slotEventRepository.save(new SlotEvent(context.tenantId(), pool.id(), schedule.id(), sequence,
                    request.capacity() - previousCapacity, CommandCodes.prefixed("CAPACITY-", commandCode), context.subjectId(),
                    "调整班次号源上限：" + previousCapacity + " → " + request.capacity()));
        }
        return toView(context.tenantId(), schedule);
    }

    @Transactional
    ScheduleView changeStatus(Long scheduleId, ChangeScheduleStatusRequest request) {
        ExecutionContext context = requireWorkContext();
        ServiceSchedule schedule = requireScheduleForUpdate(context, scheduleId);
        String commandCode = request.commandCode().trim();
        if (scheduleEventRepository.existsByTenantIdAndScheduleIdAndCommandCode(
                context.tenantId(), schedule.id(), commandCode)) {
            return toView(context.tenantId(), schedule);
        }
        requireOperable(schedule);
        ScheduleSlotPool pool = requirePool(context.tenantId(), schedule.id());
        String target;
        String eventType;
        String poolEventType;
        switch (request.action()) {
            case SUSPEND -> {
                if ("SUSPENDED".equals(schedule.status())) return toView(context.tenantId(), schedule);
                if (!"PUBLISHED".equals(schedule.status())) {
                    throw conflict("SCHEDULE_NOT_SUSPENDABLE", "只有可预约班次可以暂停");
                }
                target = "SUSPENDED";
                eventType = "SUSPENDED";
                poolEventType = "FROZEN";
                pool.freeze();
            }
            case RESUME -> {
                if ("PUBLISHED".equals(schedule.status())) return toView(context.tenantId(), schedule);
                if (!"SUSPENDED".equals(schedule.status())) {
                    throw conflict("SCHEDULE_NOT_RESUMABLE", "只有已暂停班次可以恢复");
                }
                target = "PUBLISHED";
                eventType = "PUBLISHED";
                poolEventType = "UNFROZEN";
                pool.activate();
            }
            case CANCEL -> {
                if ("CANCELLED".equals(schedule.status())) return toView(context.tenantId(), schedule);
                if (!List.of("PUBLISHED", "SUSPENDED").contains(schedule.status())) {
                    throw conflict("SCHEDULE_NOT_CANCELLABLE", "当前状态的班次不能取消");
                }
                pool.close();
                target = "CANCELLED";
                eventType = "CANCELLED";
                poolEventType = "CANCELLED";
            }
            default -> throw badRequest("SCHEDULE_ACTION_INVALID", "排班操作不正确");
        }
        String previous = schedule.changeStatus(target, context.subjectId());
        scheduleEventRepository.save(new ServiceScheduleEvent(context.tenantId(), schedule.id(), eventType,
                previous, target, commandCode, context.subjectId(), request.reason().trim()));
        slotEventRepository.save(new SlotEvent(context.tenantId(), pool.id(), schedule.id(), poolEventType,
                nextSlotSequence(context.tenantId(), pool.id()), 0, 0,
                CommandCodes.prefixed("POOL-", commandCode), context.subjectId(), request.reason().trim()));
        return toView(context.tenantId(), schedule);
    }

    private List<ScheduleTemplatePeriod> buildPeriods(Long tenantId, Long templateId, QuickScheduleRequest request) {
        List<ScheduleTemplatePeriod> result = new ArrayList<>();
        for (Integer weekday : request.weekdays()) {
            for (ScheduleDayPart dayPart : request.dayParts()) {
                LocalTime start = startTime(request, dayPart);
                LocalTime end = endTime(request, dayPart);
                result.add(new ScheduleTemplatePeriod(tenantId, templateId, weekday, dayPart,
                        start.toSecondOfDay() / 60, end.toSecondOfDay() / 60, request.capacity()));
            }
        }
        return result;
    }

    private void requireQuickRequest(QuickScheduleRequest request) {
        requireDateRange(request.dateFrom(), request.dateTo(), true);
        if (!Set.of(ScheduleDayPart.MORNING, ScheduleDayPart.AFTERNOON).containsAll(request.dayParts())) {
            throw badRequest("SIMPLE_SCHEDULE_DAY_PART_INVALID", "简易排班只需选择上午或下午");
        }
        for (ScheduleDayPart dayPart : request.dayParts()) {
            LocalTime start = startTime(request, dayPart);
            LocalTime end = endTime(request, dayPart);
            if (start == null || end == null || !end.isAfter(start)) {
                throw badRequest("SIMPLE_SCHEDULE_TIME_INVALID", "排班结束时间必须晚于开始时间");
            }
        }
    }

    private void requireDateRange(LocalDate from, LocalDate to, boolean futureOnly) {
        if (to.isBefore(from)) throw badRequest("SCHEDULE_DATE_RANGE_INVALID", "排班结束日期不能早于开始日期");
        if (futureOnly && from.isBefore(LocalDate.now())) {
            throw badRequest("SCHEDULE_DATE_IN_PAST", "不能生成过去日期的排班");
        }
        if (Duration.between(from.atStartOfDay(), to.plusDays(1).atStartOfDay()).toDays() > 90) {
            throw badRequest("SCHEDULE_DATE_RANGE_TOO_LARGE", "单次最多生成或查询 90 天排班");
        }
    }

    private StaffAssignmentView assignmentFor(ExecutionContext context, StaffDetailView staff,
                                               LocalDate from, LocalDate to) {
        return staff.assignments().stream()
                .filter(value -> value.organizationId().equals(context.organizationId())
                        && value.departmentId().equals(context.departmentId())
                        && "ACTIVE".equals(value.sdPersonnelStatus())
                        && !value.validFrom().isAfter(from)
                        && (value.validTo() == null || !value.validTo().isBefore(to)))
                .sorted(Comparator.comparing(StaffAssignmentView::primaryAssignment).reversed()
                        .thenComparing(StaffAssignmentView::id))
                .findFirst()
                .orElseThrow(() -> badRequest("SCHEDULE_PRACTITIONER_NOT_ASSIGNED",
                        "所选医生在当前机构科室或排班日期内没有有效任职"));
    }

    private PractitionerOption optionFor(ExecutionContext context, StaffView staff, LocalDate date) {
        StaffDetailView detail = organizationDirectory.requireStaff(context.tenantId(), staff.id());
        try {
            StaffAssignmentView assignment = assignmentFor(context, detail, date, date);
            return new PractitionerOption(staff.id(), staff.code(), staff.fullName(), assignment.id());
        } catch (BusinessException ignored) {
            return null;
        }
    }

    private List<ScheduleView> toViews(Long tenantId, List<ServiceSchedule> schedules) {
        if (schedules.isEmpty()) return List.of();
        List<Long> ids = schedules.stream().map(ServiceSchedule::id).toList();
        Map<Long, ScheduleSlotPool> pools = poolRepository.findByTenantIdAndScheduleIdIn(tenantId, ids).stream()
                .collect(Collectors.toMap(ScheduleSlotPool::scheduleId, Function.identity()));
        return schedules.stream().map(schedule -> {
            ScheduleSlotPool pool = pools.get(schedule.id());
            int available = pool.totalCount() - pool.heldCount() - pool.occupiedCount() - pool.frozenCount();
            return new ScheduleView(schedule.id(), schedule.scheduleCode(), schedule.serviceDate(), schedule.dayPart(),
                    schedule.startAt(), schedule.endAt(), schedule.practitionerId(), schedule.practitionerName(),
                    schedule.catalogItemId(), schedule.serviceCode(), schedule.serviceName(), schedule.locationName(),
                    pool.totalCount(), pool.heldCount(), pool.occupiedCount(), pool.frozenCount(), available,
                    schedule.status(), schedule.managementMode(), schedule.bookingPolicy(), pool.slotMode());
        }).toList();
    }

    private ScheduleView toView(Long tenantId, ServiceSchedule schedule) {
        return toViews(tenantId, List.of(schedule)).getFirst();
    }

    private ServiceSchedule requireScheduleForUpdate(ExecutionContext context, Long scheduleId) {
        ServiceSchedule schedule = scheduleRepository.findWithLockByIdAndTenantId(scheduleId, context.tenantId())
                .orElseThrow(() -> notFound("SERVICE_SCHEDULE_NOT_FOUND", "未找到所选排班"));
        if (!schedule.organizationId().equals(context.organizationId())
                || !schedule.departmentId().equals(context.departmentId())) {
            throw badRequest("SERVICE_SCHEDULE_CONTEXT_MISMATCH", "所选排班不属于当前机构科室");
        }
        return schedule;
    }

    private ScheduleSlotPool requirePool(Long tenantId, Long scheduleId) {
        return poolRepository.findByTenantIdAndScheduleId(tenantId, scheduleId)
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "所选排班缺少号源池"));
    }

    private void requireOperable(ServiceSchedule schedule) {
        if (schedule.serviceDate().isBefore(LocalDate.now()) || !schedule.endAt().isAfter(Instant.now())) {
            throw conflict("SCHEDULE_ALREADY_ENDED", "已结束的班次不能调整");
        }
    }

    private int nextSlotSequence(Long tenantId, Long poolId) {
        return slotEventRepository.findTopByTenantIdAndPoolIdOrderBySequenceNoDesc(tenantId, poolId)
                .map(SlotEvent::sequenceNo).orElse(0) + 1;
    }

    private PeriodDefault periodValue(ExecutionContext context, String key) {
        ConfigurationValue value = value(context, key);
        return new PeriodDefault(LocalTime.parse(value.value().get("start").asText()),
                LocalTime.parse(value.value().get("end").asText()));
    }

    private int intValue(ExecutionContext context, String key) { return value(context, key).value().asInt(); }
    private String textValue(ExecutionContext context, String key) { return value(context, key).value().asText(); }

    private ConfigurationValue value(ExecutionContext context, String key) {
        return configurationDirectory.resolveCurrent(context.tenantId(), context.subjectId(),
                context.organizationId(), context.departmentId(), key);
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.organizationId() == null || context.departmentId() == null) {
            throw badRequest("SCHEDULE_WORK_CONTEXT_REQUIRED", "请先选择当前机构和科室");
        }
        organizationDirectory.requireDepartment(context.tenantId(), context.organizationId(), context.departmentId());
        return context;
    }

    private static LocalTime startTime(QuickScheduleRequest request, ScheduleDayPart part) {
        return part == ScheduleDayPart.MORNING ? request.morningStart() : request.afternoonStart();
    }

    private static LocalTime endTime(QuickScheduleRequest request, ScheduleDayPart part) {
        return part == ScheduleDayPart.MORNING ? request.morningEnd() : request.afternoonEnd();
    }

    private static LocalTime toTime(int minuteOfDay) {
        return LocalTime.of(minuteOfDay / 60, minuteOfDay % 60);
    }
}
