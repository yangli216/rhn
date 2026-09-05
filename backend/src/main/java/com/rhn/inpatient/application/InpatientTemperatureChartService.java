package com.rhn.inpatient.application;

import com.rhn.healthcore.api.ClinicalValidationDirectory;

import com.rhn.inpatient.api.InpatientTemperatureChartViews.ChartEventView;
import com.rhn.inpatient.api.InpatientTemperatureChartViews.VitalObservationView;
import com.rhn.inpatient.api.InpatientTemperatureChartViews.WeekView;
import com.rhn.inpatient.domain.CareEpisode;
import com.rhn.inpatient.domain.InpatientChartEvent;
import com.rhn.inpatient.domain.InpatientEncounter;
import com.rhn.inpatient.domain.InpatientObservation;
import com.rhn.inpatient.domain.InpatientObservationGroup;
import com.rhn.inpatient.domain.ServiceLocation;
import com.rhn.inpatient.infrastructure.CareEpisodeRepository;
import com.rhn.inpatient.infrastructure.InpatientChartEventRepository;
import com.rhn.inpatient.infrastructure.InpatientEncounterRepository;
import com.rhn.inpatient.infrastructure.InpatientObservationGroupRepository;
import com.rhn.inpatient.infrastructure.InpatientObservationRepository;
import com.rhn.inpatient.infrastructure.ServiceLocationRepository;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InpatientTemperatureChartService {
    private static final String RECORD_AUTHORITY = "INPATIENT.VITALS_RECORD";
    private static final Set<String> TEMPERATURE_SITES = Set.of(
            "AXILLARY", "ORAL", "RECTAL", "EAR", "FOREHEAD");
    private static final Set<String> MANUAL_EVENT_TYPES = Set.of(
            "LEAVE", "RETURN", "SURGERY", "DELIVERY", "DEATH", "OTHER");
    private static final Set<String> SYSTEM_EVENT_TYPES = Set.of(
            "ADMISSION", "BED_TRANSFER", "WARD_TRANSFER", "DISCHARGE");

    private final ExecutionContextProvider contextProvider;
    private final OrganizationDirectory organizations;
    private final CareEpisodeRepository episodes;
    private final InpatientEncounterRepository encounters;
    private final ServiceLocationRepository locations;
    private final InpatientObservationGroupRepository groups;
    private final InpatientObservationRepository observations;
    private final InpatientChartEventRepository chartEvents;
    private final ClinicalValidationDirectory clinicalValidation;

    public InpatientTemperatureChartService(
            ExecutionContextProvider contextProvider,
            OrganizationDirectory organizations,
            CareEpisodeRepository episodes,
            InpatientEncounterRepository encounters,
            ServiceLocationRepository locations,
            InpatientObservationGroupRepository groups,
            InpatientObservationRepository observations,
            InpatientChartEventRepository chartEvents,
            ClinicalValidationDirectory clinicalValidation) {
        this.contextProvider = contextProvider;
        this.organizations = organizations;
        this.episodes = episodes;
        this.encounters = encounters;
        this.locations = locations;
        this.groups = groups;
        this.observations = observations;
        this.chartEvents = chartEvents;
        this.clinicalValidation = clinicalValidation;
    }

    @Transactional(readOnly = true)
    public WeekView week(Long episodeId, LocalDate requestedWeekStart) {
        ExecutionContext context = requireContext();
        EpisodeEncounter relation = requireEpisodeEncounter(context, episodeId, null);
        ZoneId zone = organizationZone(context);
        LocalDate weekStart = requestedWeekStart == null ? LocalDate.now(zone) : requestedWeekStart;
        LocalDate weekEnd = weekStart.plusDays(6);
        Instant from = weekStart.atStartOfDay(zone).toInstant();
        Instant to = weekStart.plusDays(7).atStartOfDay(zone).toInstant();

        List<InpatientObservationGroup> values = groups
                .findByTenantIdAndEpisodeIdAndMeasuredAtGreaterThanEqualAndMeasuredAtLessThanOrderByMeasuredAtAscIdAsc(
                        context.tenantId(), relation.episode().id(), from, to);
        Map<Long, List<InpatientObservation>> measurements = measurementsByGroup(context.tenantId(), values);
        List<VitalObservationView> observationViews = values.stream()
                .map(value -> vitalObservationView(value, measurements.getOrDefault(value.id(), List.of())))
                .toList();
        List<ChartEventView> eventViews = chartEvents
                .findByTenantIdAndEpisodeIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThanOrderByOccurredAtAscIdAsc(
                        context.tenantId(), relation.episode().id(), from, to).stream()
                .map(this::chartEventView)
                .toList();
        return new WeekView(relation.episode().id(), weekStart, weekEnd,
                !"ADMITTED".equals(relation.episode().status()), observationViews, eventViews);
    }

    @Transactional
    public VitalObservationView recordObservations(Long episodeId, ObservationCommand input) {
        ExecutionContext context = requireRecordContext();
        String commandCode = requireCommand(input.commandCode());
        EpisodeEncounter relation = requireEpisodeEncounter(context, episodeId, null);
        requireWritableEpisode(relation.episode());
        InpatientObservationGroup replay = groups.findByTenantIdAndCommandCode(context.tenantId(), commandCode)
                .orElse(null);
        if (replay != null) {
            requireReplayTarget(replay.episodeId(), replay.encounterId(), relation);
            return vitalObservationView(replay, observations
                    .findByTenantIdAndObservationGroupIdOrderByIdAsc(context.tenantId(), replay.id()));
        }
        if (chartEvents.findByTenantIdAndCommandCode(context.tenantId(), commandCode).isPresent()) {
            throw conflict("INPATIENT_COMMAND_REUSED", "业务请求号已用于其他体温单操作");
        }

        requireOccurredWithinEpisode(relation.episode(), input.observedAt(), "测量时间");
        String temperatureSite = normalize(input.temperatureSite());
        if (temperatureSite != null && !TEMPERATURE_SITES.contains(temperatureSite)) {
            throw badRequest("INPATIENT_TEMPERATURE_SITE_INVALID", "体温测量部位不合法");
        }
        requireCoolingObservation(relation.episode(), input);
        clinicalValidation.validateVitalSigns(new ClinicalValidationDirectory.VitalSignsInput(
                input.temperatureCelsius(), input.pulseRate(), input.respiratoryRate(),
                input.systolicBloodPressure(), input.diastolicBloodPressure(), input.oxygenSaturation(),
                null, input.bodyWeightKg(), input.intakeVolumeMl(), input.outputVolumeMl()));
        if (input.coolingTemperatureCelsius() != null) {
            clinicalValidation.validateVitalSigns(new ClinicalValidationDirectory.VitalSignsInput(
                    input.coolingTemperatureCelsius(), null, null, null, null, null,
                    null, null, null, null));
        }
        List<MeasurementSpec> measurementSpecs = measurementSpecs(input, temperatureSite);
        if (measurementSpecs.isEmpty()) {
            throw badRequest("INPATIENT_OBSERVATION_EMPTY", "请至少录入一项生命体征或出入量");
        }

        InpatientObservationGroup group = groups.save(new InpatientObservationGroup(
                context.tenantId(), relation.episode().id(), relation.encounter().id(), input.observedAt(),
                "MANUAL", commandCode, null, requireActor(context)));
        List<InpatientObservation> saved = observations.saveAll(measurementSpecs.stream()
                .map(value -> new InpatientObservation(context.tenantId(), group.id(), value.code(),
                        value.observedAt(), value.value(), value.unit(), value.bodySiteCode()))
                .toList());
        groups.flush();
        observations.flush();
        return vitalObservationView(group, saved);
    }

    @Transactional
    public ChartEventView recordChartEvent(Long episodeId, ChartEventCommand input) {
        ExecutionContext context = requireRecordContext();
        String commandCode = requireCommand(input.commandCode());
        EpisodeEncounter relation = requireEpisodeEncounter(context, episodeId, null);
        requireWritableEpisode(relation.episode());
        InpatientChartEvent replay = chartEvents.findByTenantIdAndCommandCode(context.tenantId(), commandCode)
                .orElse(null);
        if (replay != null) {
            requireReplayTarget(replay.episodeId(), replay.encounterId(), relation);
            return chartEventView(replay);
        }
        if (groups.findByTenantIdAndCommandCode(context.tenantId(), commandCode).isPresent()) {
            throw conflict("INPATIENT_COMMAND_REUSED", "业务请求号已用于其他体温单操作");
        }

        requireOccurredWithinEpisode(relation.episode(), input.occurredAt(), "事件时间");
        String eventType = normalize(input.eventType());
        if (!MANUAL_EVENT_TYPES.contains(eventType)) {
            throw badRequest("INPATIENT_CHART_EVENT_SYSTEM_MANAGED", "入院、转床、转科和出院事件由业务流程自动生成");
        }
        String displayText = requireDisplayText(input.displayText());

        InpatientChartEvent event = chartEvents.save(new InpatientChartEvent(
                context.tenantId(), relation.episode().id(), relation.encounter().id(), eventType,
                null, null, null, null, commandCode, displayText, null,
                input.occurredAt(), requireActor(context)));
        chartEvents.flush();
        return chartEventView(event);
    }

    /** Adds an immutable chart event from the admission workflow in the caller's transaction. */
    public ChartEventView appendSystemEvent(SystemChartEventCommand input) {
        String commandCode = requireCommand(input.commandCode());
        EpisodeEncounter relation = requireSystemRelation(input);
        InpatientChartEvent replay = chartEvents.findByTenantIdAndCommandCode(input.tenantId(), commandCode)
                .orElse(null);
        if (replay != null) {
            if (!replay.episodeId().equals(input.episodeId()) || !replay.encounterId().equals(input.encounterId())) {
                throw conflict("INPATIENT_COMMAND_REUSED", "业务请求号已用于其他住院记录");
            }
            return chartEventView(replay);
        }
        if (groups.findByTenantIdAndCommandCode(input.tenantId(), commandCode).isPresent()) {
            throw conflict("INPATIENT_COMMAND_REUSED", "业务请求号已用于其他体温单操作");
        }
        String eventType = normalize(input.eventType());
        if (!SYSTEM_EVENT_TYPES.contains(eventType)) {
            throw badRequest("INPATIENT_CHART_EVENT_TYPE_INVALID", "系统体温单事件类型不合法");
        }
        ServiceLocation source = requireSystemLocation(
                input.tenantId(), relation.episode().organizationId(), input.sourceLocationId());
        ServiceLocation target = requireSystemLocation(
                input.tenantId(), relation.episode().organizationId(), input.targetLocationId());
        if (Set.of("BED_TRANSFER", "WARD_TRANSFER").contains(eventType)
                && (source == null || target == null || source.id().equals(target.id()))) {
            throw badRequest("INPATIENT_TRANSFER_LOCATIONS_REQUIRED", "转移事件必须包含不同的转出和转入位置");
        }
        InpatientChartEvent event = chartEvents.save(new InpatientChartEvent(
                input.tenantId(), input.episodeId(), input.encounterId(), eventType,
                source == null ? null : source.id(), source == null ? null : source.name(),
                target == null ? null : target.id(), target == null ? null : target.name(),
                commandCode, requireDisplayText(input.displayText()), null,
                input.occurredAt(), input.actorId()));
        chartEvents.flush();
        return chartEventView(event);
    }

    private Map<Long, List<InpatientObservation>> measurementsByGroup(
            Long tenantId, Collection<InpatientObservationGroup> values) {
        if (values.isEmpty()) return Map.of();
        List<Long> groupIds = values.stream().map(InpatientObservationGroup::id).toList();
        Map<Long, List<InpatientObservation>> result = new LinkedHashMap<>();
        observations.findByTenantIdAndObservationGroupIdInOrderByObservationGroupIdAscIdAsc(tenantId, groupIds)
                .forEach(value -> result.computeIfAbsent(value.observationGroupId(), ignored -> new ArrayList<>())
                        .add(value));
        return result;
    }

    private List<MeasurementSpec> measurementSpecs(ObservationCommand input, String temperatureSite) {
        List<MeasurementSpec> result = new ArrayList<>();
        add(result, "BODY_TEMPERATURE", input.observedAt(), input.temperatureCelsius(), "Cel", temperatureSite,
                "体温");
        add(result, "COOLING_TEMPERATURE", input.coolingObservedAt(), input.coolingTemperatureCelsius(),
                "Cel", temperatureSite, "降温后体温");
        add(result, "PULSE_RATE", input.observedAt(), input.pulseRate(), "/min", null,
                "脉搏");
        add(result, "RESPIRATORY_RATE", input.observedAt(), input.respiratoryRate(), "/min", null,
                "呼吸");
        add(result, "SYSTOLIC_BLOOD_PRESSURE", input.observedAt(), input.systolicBloodPressure(), "mm[Hg]", null,
                "收缩压");
        add(result, "DIASTOLIC_BLOOD_PRESSURE", input.observedAt(), input.diastolicBloodPressure(), "mm[Hg]", null,
                "舒张压");
        add(result, "OXYGEN_SATURATION", input.observedAt(), input.oxygenSaturation(), "%", null,
                "血氧饱和度");
        add(result, "BODY_WEIGHT", input.observedAt(), input.bodyWeightKg(), "kg", null,
                "体重");
        add(result, "FLUID_INTAKE", input.observedAt(), input.intakeVolumeMl(), "mL", null,
                "入量");
        add(result, "FLUID_OUTPUT", input.observedAt(), input.outputVolumeMl(), "mL", null,
                "出量");
        return result;
    }

    private void add(List<MeasurementSpec> target, String code, Instant observedAt,
                     BigDecimal value, String unit,
                     String bodySiteCode, String label) {
        if (value == null) return;
        target.add(new MeasurementSpec(code, observedAt, value, unit, bodySiteCode));
    }

    private EpisodeEncounter requireEpisodeEncounter(
            ExecutionContext context, Long episodeId, Long expectedEncounterId) {
        CareEpisode episode = episodes.findByIdAndTenantId(episodeId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        if (!context.organizationId().equals(episode.organizationId())) {
            throw forbidden("INPATIENT_SCOPE_DENIED", "住院记录不属于当前机构");
        }
        InpatientEncounter encounter = encounters.findByTenantIdAndEpisodeId(context.tenantId(), episode.id())
                .orElseThrow(() -> notFound("INPATIENT_ENCOUNTER_NOT_FOUND", "住院接触不存在"));
        if (expectedEncounterId != null && !encounter.id().equals(expectedEncounterId)) {
            throw conflict("INPATIENT_ENCOUNTER_MISMATCH", "住院接触与当前住院记录不匹配");
        }
        if (!episode.organizationId().equals(encounter.organizationId())) {
            throw conflict("INPATIENT_EPISODE_RELATION_INVALID", "住院记录与住院接触关系异常");
        }
        return new EpisodeEncounter(episode, encounter);
    }

    private void requireReplayTarget(
            Long actualEpisodeId, Long actualEncounterId, EpisodeEncounter relation) {
        if (!actualEpisodeId.equals(relation.episode().id())
                || !actualEncounterId.equals(relation.encounter().id())) {
            throw conflict("INPATIENT_COMMAND_REUSED", "业务请求号已用于其他住院记录");
        }
    }

    private void requireWritableEpisode(CareEpisode episode) {
        if (!"ADMITTED".equals(episode.status())) {
            throw conflict("INPATIENT_CHART_READ_ONLY", "已结束住院的体温单仅供查看");
        }
    }

    private void requireCoolingObservation(CareEpisode episode, ObservationCommand input) {
        boolean coolingValue = input.coolingTemperatureCelsius() != null;
        boolean coolingTime = input.coolingObservedAt() != null;
        if (coolingValue != coolingTime) {
            throw badRequest("INPATIENT_COOLING_PAIR_REQUIRED", "降温后体温与复测时间必须同时录入");
        }
        if (!coolingValue) return;
        if (input.temperatureCelsius() == null) {
            throw badRequest("INPATIENT_COOLING_TEMPERATURE_REQUIRED", "录入降温后体温时必须同时录入原始体温");
        }
        if (input.coolingObservedAt().isBefore(input.observedAt())) {
            throw badRequest("INPATIENT_COOLING_TIME_INVALID", "降温后复测时间不能早于原始测量时间");
        }
        requireOccurredWithinEpisode(episode, input.coolingObservedAt(), "降温后复测时间");
    }

    private EpisodeEncounter requireSystemRelation(SystemChartEventCommand input) {
        CareEpisode episode = episodes.findByIdAndTenantId(input.episodeId(), input.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        InpatientEncounter encounter = encounters
                .findByTenantIdAndEpisodeId(input.tenantId(), input.episodeId())
                .orElseThrow(() -> notFound("INPATIENT_ENCOUNTER_NOT_FOUND", "住院接触不存在"));
        if (!encounter.id().equals(input.encounterId())
                || !episode.organizationId().equals(encounter.organizationId())) {
            throw conflict("INPATIENT_EPISODE_RELATION_INVALID", "住院记录与住院接触关系异常");
        }
        requireOccurredWithinEpisode(episode, input.occurredAt(), "事件时间");
        return new EpisodeEncounter(episode, encounter);
    }

    private ServiceLocation requireSystemLocation(Long tenantId, Long organizationId, Long locationId) {
        if (locationId == null) return null;
        ServiceLocation location = locations.findByIdAndTenantId(locationId, tenantId)
                .orElseThrow(() -> notFound("INPATIENT_LOCATION_NOT_FOUND", "体温单事件位置不存在"));
        if (!organizationId.equals(location.organizationId())) {
            throw forbidden("INPATIENT_LOCATION_SCOPE_DENIED", "体温单事件位置不属于住院机构");
        }
        return location;
    }

    private void requireOccurredWithinEpisode(CareEpisode episode, Instant occurredAt, String label) {
        if (occurredAt == null) throw badRequest("INPATIENT_OCCURRED_AT_REQUIRED", label + "不能为空");
        if (occurredAt.isBefore(episode.startAt())
                || episode.endAt() != null && occurredAt.isAfter(episode.endAt())) {
            throw badRequest("INPATIENT_OCCURRED_AT_OUTSIDE_EPISODE", label + "不在本次住院期间内");
        }
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.organizationId() == null) {
            throw badRequest("WORK_CONTEXT_REQUIRED", "请先选择医疗机构工作上下文");
        }
        organizations.requireOrganization(context.tenantId(), context.organizationId());
        return context;
    }

    private ExecutionContext requireRecordContext() {
        ExecutionContext context = requireContext();
        if (!context.hasAuthority(RECORD_AUTHORITY) && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("INPATIENT_VITALS_RECORD_DENIED", "当前岗位无权录入住院生命体征");
        }
        return context;
    }

    private ZoneId organizationZone(ExecutionContext context) {
        String code = organizations.requireOrganization(context.tenantId(), context.organizationId()).timezoneCode();
        return ZoneId.of(code == null || code.isBlank() ? "Asia/Shanghai" : code);
    }

    private VitalObservationView vitalObservationView(
            InpatientObservationGroup group, List<InpatientObservation> values) {
        Map<String, InpatientObservation> byCode = values.stream()
                .collect(java.util.stream.Collectors.toMap(
                        InpatientObservation::observationCode, value -> value));
        InpatientObservation temperature = byCode.get("BODY_TEMPERATURE");
        InpatientObservation cooling = byCode.get("COOLING_TEMPERATURE");
        return new VitalObservationView(
                group.id(), group.measuredAt(), value(byCode, "BODY_TEMPERATURE"),
                temperature == null ? null : temperature.bodySiteCode(),
                value(byCode, "COOLING_TEMPERATURE"), cooling == null ? null : cooling.observedAt(),
                value(byCode, "PULSE_RATE"), value(byCode, "RESPIRATORY_RATE"),
                value(byCode, "SYSTOLIC_BLOOD_PRESSURE"), value(byCode, "DIASTOLIC_BLOOD_PRESSURE"),
                value(byCode, "OXYGEN_SATURATION"), value(byCode, "BODY_WEIGHT"),
                value(byCode, "FLUID_INTAKE"), value(byCode, "FLUID_OUTPUT"),
                "RECORDED", null, null);
    }

    private ChartEventView chartEventView(InpatientChartEvent event) {
        return new ChartEventView(
                event.id(), event.eventType(), event.occurredAt(), event.displayText(),
                "RECORDED", null, null);
    }

    private static BigDecimal value(Map<String, InpatientObservation> values, String code) {
        InpatientObservation observation = values.get(code);
        return observation == null ? null : observation.valueNumber();
    }

    private static Long requireActor(ExecutionContext context) {
        if (context.subjectId() == null) throw forbidden("ACTOR_REQUIRED", "当前操作人身份不可用");
        return context.subjectId();
    }

    private static String requireCommand(String value) {
        String result = trim(value);
        if (result == null) throw badRequest("INPATIENT_COMMAND_REQUIRED", "业务请求号不能为空");
        return result;
    }

    private static String requireDisplayText(String value) {
        String result = trim(value);
        if (result == null) throw badRequest("INPATIENT_CHART_EVENT_TEXT_REQUIRED", "体温单事件显示内容不能为空");
        if (result.length() > 200) {
            throw badRequest("INPATIENT_CHART_EVENT_TEXT_TOO_LONG", "体温单事件显示内容不能超过200个字符");
        }
        return result;
    }

    private static String normalize(String value) {
        String result = trim(value);
        return result == null ? null : result.toUpperCase(Locale.ROOT);
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record ObservationCommand(
            Instant observedAt, String temperatureSite,
            BigDecimal temperatureCelsius, BigDecimal coolingTemperatureCelsius,
            Instant coolingObservedAt, BigDecimal pulseRate, BigDecimal respiratoryRate,
            BigDecimal systolicBloodPressure, BigDecimal diastolicBloodPressure,
            BigDecimal oxygenSaturation, BigDecimal bodyWeightKg,
            BigDecimal intakeVolumeMl, BigDecimal outputVolumeMl,
            String commandCode) {
    }

    public record ChartEventCommand(
            String eventType, Instant occurredAt, String displayText, String commandCode) {
    }

    public record SystemChartEventCommand(
            Long tenantId, Long episodeId, Long encounterId, String eventType,
            Instant occurredAt, Long sourceLocationId, Long targetLocationId,
            String displayText, String commandCode, Long actorId) {
    }

    private record EpisodeEncounter(CareEpisode episode, InpatientEncounter encounter) {
    }

    private record MeasurementSpec(
            String code, Instant observedAt, BigDecimal value, String unit, String bodySiteCode) {
    }
}
