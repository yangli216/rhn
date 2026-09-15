package com.rhn.inpatient.application;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.healthcore.api.EncounterDiagnosisDirectory.DiagnosisInput;
import com.rhn.healthcore.api.EncounterDiagnosisDirectory.ReplaceDiagnosesCommand;
import com.rhn.inpatient.api.InpatientViews.BedView;
import com.rhn.inpatient.api.InpatientViews.BootstrapView;
import com.rhn.inpatient.api.InpatientViews.EpisodeView;
import com.rhn.inpatient.api.InpatientViews.DischargeReadinessView;
import com.rhn.inpatient.api.InpatientViews.DischargeDiagnosisListView;
import com.rhn.inpatient.api.InpatientViews.DischargeDiagnosisView;
import com.rhn.inpatient.api.InpatientViews.AdmissionDiagnosisListView;
import com.rhn.inpatient.api.InpatientViews.AdmissionDiagnosisView;
import com.rhn.inpatient.domain.CareEpisode;
import com.rhn.inpatient.domain.EncounterLocationHistory;
import com.rhn.inpatient.domain.InpatientBedOccupancy;
import com.rhn.inpatient.domain.InpatientBedProfile;
import com.rhn.inpatient.domain.InpatientEncounter;
import com.rhn.inpatient.domain.InpatientEpisodeDetail;
import com.rhn.inpatient.domain.InpatientEvent;
import com.rhn.inpatient.domain.ServiceLocation;
import com.rhn.inpatient.infrastructure.CareEpisodeRepository;
import com.rhn.inpatient.infrastructure.EncounterLocationHistoryRepository;
import com.rhn.inpatient.infrastructure.InpatientBedOccupancyRepository;
import com.rhn.inpatient.infrastructure.InpatientBedProfileRepository;
import com.rhn.inpatient.infrastructure.InpatientEncounterRepository;
import com.rhn.inpatient.infrastructure.InpatientEpisodeDetailRepository;
import com.rhn.inpatient.infrastructure.InpatientEventRepository;
import com.rhn.inpatient.infrastructure.ServiceLocationRepository;
import com.rhn.inpatient.application.InpatientTemperatureChartService.SystemChartEventCommand;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import com.rhn.platform.idempotency.IdempotencyService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.LinkedHashSet;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InpatientApplicationService {
    private static final Set<String> ACTIVE_EPISODE_STATUSES = Set.of(
            "PLANNED", "PENDING_BED", "ADMITTED", "ON_LEAVE", "DISCHARGE_PENDING");
    private static final Set<String> BED_OPERATIONAL_STATUSES = Set.of(
            "AVAILABLE", "CLEANING", "BLOCKED", "MAINTENANCE");

    private final ExecutionContextProvider contextProvider;
    private final ResidentDirectory residents;
    private final OrganizationDirectory organizations;
    private final DictionaryDirectory dictionaries;
    private final ServiceLocationRepository locations;
    private final InpatientBedProfileRepository bedProfiles;
    private final CareEpisodeRepository episodes;
    private final InpatientEpisodeDetailRepository episodeDetails;
    private final InpatientEncounterRepository encounters;
    private final InpatientBedOccupancyRepository occupancies;
    private final EncounterLocationHistoryRepository locationHistories;
    private final InpatientEventRepository events;
    private final InpatientTemperatureChartService temperatureChart;
    private final InpatientDischargeReadinessService dischargeReadiness;
    private final EncounterDiagnosisDirectory encounterDiagnoses;
    private final IdempotencyService idempotency;
    private final JsonCodec jsonCodec;

    public InpatientApplicationService(
            ExecutionContextProvider contextProvider,
            ResidentDirectory residents,
            OrganizationDirectory organizations,
            DictionaryDirectory dictionaries,
            ServiceLocationRepository locations,
            InpatientBedProfileRepository bedProfiles,
            CareEpisodeRepository episodes,
            InpatientEpisodeDetailRepository episodeDetails,
            InpatientEncounterRepository encounters,
            InpatientBedOccupancyRepository occupancies,
            EncounterLocationHistoryRepository locationHistories,
            InpatientEventRepository events,
            InpatientTemperatureChartService temperatureChart,
            InpatientDischargeReadinessService dischargeReadiness,
            EncounterDiagnosisDirectory encounterDiagnoses,
            IdempotencyService idempotency,
            JsonCodec jsonCodec) {
        this.contextProvider = contextProvider;
        this.residents = residents;
        this.organizations = organizations;
        this.dictionaries = dictionaries;
        this.locations = locations;
        this.bedProfiles = bedProfiles;
        this.episodes = episodes;
        this.episodeDetails = episodeDetails;
        this.encounters = encounters;
        this.occupancies = occupancies;
        this.locationHistories = locationHistories;
        this.events = events;
        this.temperatureChart = temperatureChart;
        this.dischargeReadiness = dischargeReadiness;
        this.encounterDiagnoses = encounterDiagnoses;
        this.idempotency = idempotency;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    public BootstrapView bootstrap(String status, String keyword) {
        ExecutionContext context = requireContext();
        Collection<String> statuses = "ALL".equals(normalize(status))
                ? Set.of("ADMITTED", "DISCHARGED") : Set.of("ADMITTED");
        List<EpisodeView> episodeViews = episodeViews(context, statuses).stream()
                .filter(value -> matches(value, keyword))
                .toList();
        return new BootstrapView(bedViews(context), episodeViews);
    }

    @Transactional
    public EpisodeView admit(AdmissionCommand input) {
        ExecutionContext context = requireAction("INPATIENT.ADMIT");
        String commandCode = requireCommand(input.commandCode());
        EpisodeView replay = replayEpisode(context, commandCode);
        if (replay != null) return replay;
        String contactRelationship = requireContactRelationship(context, input.emergencyContactRelationship());

        ResidentSnapshot resident = residents.requireSnapshotForUpdate(input.residentId());
        if (resident.deceased()) throw badRequest("INPATIENT_RESIDENT_DECEASED", "已死亡居民不能办理入院");
        if (episodes.existsByTenantIdAndResidentIdAndEpisodeTypeAndStatusIn(
                context.tenantId(), resident.id(), "INPATIENT", ACTIVE_EPISODE_STATUSES)) {
            throw conflict("INPATIENT_ALREADY_ADMITTED", "该居民已有在院记录");
        }

        InpatientBedProfile bed = requireAvailableBed(context, input.bedId(), resident.gender());
        ServiceLocation bedLocation = requireBedLocation(context, bed.bedLocationId());
        if (occupancies.findByTenantIdAndBedLocationId(context.tenantId(), bedLocation.id()).isPresent()) {
            throw conflict("INPATIENT_BED_OCCUPIED", "该床位已被占用");
        }
        DepartmentView department = requireNursingDepartment(context, bedLocation.departmentId());

        Long actorId = requireActor(context);
        Instant admittedAt = input.admittedAt() == null ? Instant.now() : input.admittedAt();
        if (admittedAt.isAfter(Instant.now().plusSeconds(300))) {
            throw badRequest("INPATIENT_ADMISSION_TIME_FUTURE", "入院时间不能晚于当前时间");
        }
        CareEpisode episode = episodes.save(new CareEpisode(
                context.tenantId(), resident.id(), context.organizationId(), nextBusinessNo("IP"),
                context.practitionerId(), actorId, admittedAt));
        InpatientEncounter encounter = encounters.save(new InpatientEncounter(
                context.tenantId(), resident.id(), nextBusinessNo("IPE"), context.organizationId(),
                department.id(), episode.id(), bedLocation.id(), context.practitionerId(), admittedAt));
        episodeDetails.save(new InpatientEpisodeDetail(
                episode.id(), context.tenantId(), defaultCode(input.admissionTypeCode(), "GENERAL"),
                defaultCode(input.admissionSourceCode(), "OUTPATIENT"), bedLocation.id(), trim(input.admissionReason()),
                defaultCode(input.nursingLevelCode(), "LEVEL_III"), defaultCode(input.dietCode(), "NORMAL"),
                bedLocation.name(), input.responsibleNurseId(), defaultCode(input.admissionMethodCode(), "WALKING"),
                defaultCode(input.conditionCode(), "GENERAL"), defaultCode(input.paymentMethodCode(), "SELF_PAY"),
                trim(input.referralOrganizationName()), trim(input.emergencyContactName()),
                contactRelationship, trim(input.emergencyContactPhone()),
                trim(input.admissionNote())));
        occupancies.save(new InpatientBedOccupancy(
                context.tenantId(), bedLocation.id(), episode.id(), encounter.id(), resident.id(), admittedAt));
        locationHistories.save(new EncounterLocationHistory(
                context.tenantId(), encounter.id(), bedLocation.id(), "入院分床", actorId, admittedAt));
        events.save(new InpatientEvent(
                context.tenantId(), episode.id(), encounter.id(), "ADMITTED", null, "ADMITTED",
                null, bedLocation.id(), commandCode, trim(input.admissionReason()), actorId));
        temperatureChart.appendSystemEvent(new SystemChartEventCommand(
                context.tenantId(), episode.id(), encounter.id(), "ADMISSION", episode.startAt(),
                null, bedLocation.id(),
                "入院", commandCode + ":CHART", actorId));
        return episodeView(context, episode);
    }

    @Transactional
    public EpisodeView transfer(Long episodeId, MovementCommand input) {
        ExecutionContext context = requireAction("INPATIENT.TRANSFER");
        String commandCode = requireCommand(input.commandCode());
        EpisodeView replay = replayEpisode(context, commandCode);
        if (replay != null) return replay;

        CareEpisode episode = requireLockedEpisode(context, episodeId);
        InpatientBedOccupancy current = requireOccupancy(context, episode.id());
        if (current.bedLocationId().equals(input.targetBedId())) {
            throw conflict("INPATIENT_BED_UNCHANGED", "患者已在目标床位");
        }
        ResidentSnapshot resident = residents.requireSnapshot(episode.residentId());
        InpatientBedProfile targetBed = requireAvailableBed(context, input.targetBedId(), resident.gender());
        ServiceLocation targetLocation = requireBedLocation(context, targetBed.bedLocationId());
        DepartmentView targetDepartment = requireNursingDepartment(context, targetLocation.departmentId());
        if (occupancies.findByTenantIdAndBedLocationId(context.tenantId(), targetLocation.id()).isPresent()) {
            throw conflict("INPATIENT_BED_OCCUPIED", "目标床位已被占用");
        }

        InpatientBedProfile sourceBed = bedProfiles.findLocked(context.tenantId(), current.bedLocationId())
                .orElseThrow(() -> notFound("INPATIENT_BED_NOT_FOUND", "原床位不存在"));
        ServiceLocation sourceLocation = requireBedLocation(context, current.bedLocationId());
        InpatientEncounter encounter = requireEncounter(context, episode.id());
        EncounterLocationHistory activeHistory = requireActiveLocationHistory(context, encounter.id());
        Long actorId = requireActor(context);
        String reason = defaultText(input.reason(), "转床");

        activeHistory.close(reason, actorId);
        occupancies.delete(current);
        occupancies.flush();
        sourceBed.markCleaning(actorId);
        encounter.moveTo(targetDepartment.id(), targetLocation.id());
        episodeDetails.findByEpisodeIdAndTenantId(episode.id(), context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_DETAIL_NOT_FOUND", "住院明细不存在"))
                .moveTo(targetLocation.name());
        occupancies.save(new InpatientBedOccupancy(
                context.tenantId(), targetLocation.id(), episode.id(), encounter.id(), episode.residentId()));
        locationHistories.save(new EncounterLocationHistory(
                context.tenantId(), encounter.id(), targetLocation.id(), reason, actorId));
        episode.recordMovement(input.expectedRevision(), actorId);
        events.save(new InpatientEvent(
                context.tenantId(), episode.id(), encounter.id(), "TRANSFERRED", "ADMITTED", "ADMITTED",
                current.bedLocationId(), targetLocation.id(), commandCode, reason, actorId));
        temperatureChart.appendSystemEvent(new SystemChartEventCommand(
                context.tenantId(), episode.id(), encounter.id(), "BED_TRANSFER", java.time.Instant.now(),
                sourceLocation.id(), targetLocation.id(),
                sourceLocation.name() + "→" + targetLocation.name(), commandCode + ":CHART", actorId));
        episodes.flush();
        return episodeView(context, episode);
    }

    @Transactional
    public EpisodeView discharge(Long episodeId, DischargeCommand input) {
        ExecutionContext context = requireAction("INPATIENT.DISCHARGE");
        String commandCode = requireCommand(input.commandCode());
        EpisodeView replay = replayEpisode(context, commandCode);
        if (replay != null) return replay;

        CareEpisode episode = requireLockedEpisode(context, episodeId);
        InpatientEncounter encounter = requireEncounter(context, episode.id());
        dischargeReadiness.requireReady(dischargeReadiness.assess(episode, encounter));
        InpatientBedOccupancy occupancy = requireOccupancy(context, episode.id());
        InpatientBedProfile bed = bedProfiles.findLocked(context.tenantId(), occupancy.bedLocationId())
                .orElseThrow(() -> notFound("INPATIENT_BED_NOT_FOUND", "当前床位不存在"));
        ServiceLocation bedLocation = requireBedLocation(context, occupancy.bedLocationId());
        EncounterLocationHistory activeHistory = requireActiveLocationHistory(context, encounter.id());
        InpatientEpisodeDetail detail = episodeDetails.findByEpisodeIdAndTenantId(episode.id(), context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_DETAIL_NOT_FOUND", "住院明细不存在"));
        Long actorId = requireActor(context);
        String reason = defaultText(input.note(), "办理出院");

        activeHistory.close(reason, actorId);
        occupancies.delete(occupancy);
        occupancies.flush();
        bed.markCleaning(actorId);
        encounter.complete();
        detail.discharge(occupancy.bedLocationId(), defaultCode(input.dispositionCode(), "HOME"), trim(input.note()));
        episode.discharge(input.expectedRevision(), actorId);
        events.save(new InpatientEvent(
                context.tenantId(), episode.id(), encounter.id(), "DISCHARGED", "ADMITTED", "DISCHARGED",
                occupancy.bedLocationId(), null, commandCode, reason, actorId));
        temperatureChart.appendSystemEvent(new SystemChartEventCommand(
                context.tenantId(), episode.id(), encounter.id(), "DISCHARGE", episode.endAt(),
                bedLocation.id(), null,
                "出院", commandCode + ":CHART", actorId));
        episodes.flush();
        return episodeView(context, episode);
    }

    @Transactional(readOnly = true)
    public DischargeReadinessView dischargeReadiness(Long episodeId) {
        ExecutionContext context = requireContext();
        CareEpisode episode = requireEpisode(context, episodeId);
        return dischargeReadiness.assess(episode, requireEncounter(context, episode.id()));
    }

    @Transactional(readOnly = true)
    public AdmissionDiagnosisListView admissionDiagnoses(Long episodeId) {
        ExecutionContext context = requireContext();
        CareEpisode episode = requireEpisode(context, episodeId);
        InpatientEncounter encounter = requireEncounter(context, episode.id());
        List<AdmissionDiagnosisView> values = encounterDiagnoses
                .findActiveDiagnoses(context.tenantId(), encounter.id(), "ADMISSION").stream()
                .map(InpatientApplicationService::admissionDiagnosisView)
                .toList();
        return new AdmissionDiagnosisListView(episode.id(), encounter.id(), values);
    }

    @Transactional
    public AdmissionDiagnosisListView recordAdmissionDiagnoses(
            Long episodeId, RecordAdmissionDiagnosesCommand input) {
        ExecutionContext context = requireAction("INPATIENT.ADMIT");
        String commandCode = requireCommand(input.commandCode());
        List<DiagnosisInput> normalized = normalizeDiagnoses(input.diagnoses(), "入院");
        String canonicalRequest = jsonCodec.write(Map.of(
                "episodeId", episodeId, "expectedEpisodeRevision", input.expectedEpisodeRevision(),
                "diagnoses", normalized));
        var reservation = idempotency.reserve("INPATIENT_ADMISSION_DIAGNOSES", commandCode, canonicalRequest);
        if (reservation.replay()) {
            return jsonCodec.read(reservation.responseJson(), AdmissionDiagnosisListView.class);
        }
        CareEpisode episode = requireLockedEpisode(context, episodeId);
        if (!"ADMITTED".equals(episode.status())) {
            throw conflict("INPATIENT_EPISODE_NOT_ADMITTED", "只有在院患者可以维护入院诊断");
        }
        if (episode.revision() != input.expectedEpisodeRevision()) {
            throw conflict("INPATIENT_REVISION_CONFLICT", "住院记录已被其他用户更新，请刷新后重试");
        }
        InpatientEncounter encounter = requireEncounter(context, episode.id());
        List<AdmissionDiagnosisView> values = encounterDiagnoses.replaceActiveDiagnoses(
                        new ReplaceDiagnosesCommand(context.tenantId(), encounter.id(), "ADMISSION", normalized,
                                context.practitionerId(), requireActor(context), "住院入院诊断更新"))
                .stream().map(InpatientApplicationService::admissionDiagnosisView)
                .toList();
        AdmissionDiagnosisListView response = new AdmissionDiagnosisListView(episode.id(), encounter.id(), values);
        idempotency.complete("INPATIENT_ADMISSION_DIAGNOSES", commandCode, "CareEpisode", episode.id(),
                200, jsonCodec.write(response));
        return response;
    }

    @Transactional(readOnly = true)
    public DischargeDiagnosisListView dischargeDiagnoses(Long episodeId) {
        ExecutionContext context = requireContext();
        CareEpisode episode = requireEpisode(context, episodeId);
        InpatientEncounter encounter = requireEncounter(context, episode.id());
        List<DischargeDiagnosisView> values = encounterDiagnoses
                .findActiveDiagnoses(context.tenantId(), encounter.id(), "DISCHARGE").stream()
                .map(InpatientApplicationService::diagnosisView)
                .toList();
        return new DischargeDiagnosisListView(episode.id(), encounter.id(), values);
    }

    @Transactional
    public DischargeDiagnosisListView recordDischargeDiagnoses(
            Long episodeId, RecordDischargeDiagnosesCommand input) {
        ExecutionContext context = requireAction("INPATIENT.DISCHARGE");
        String commandCode = requireCommand(input.commandCode());
        List<DiagnosisInput> normalized = normalizeDiagnoses(input.diagnoses(), "出院");
        String canonicalRequest = jsonCodec.write(Map.of(
                "episodeId", episodeId, "expectedEpisodeRevision", input.expectedEpisodeRevision(),
                "diagnoses", normalized));
        var reservation = idempotency.reserve("INPATIENT_DISCHARGE_DIAGNOSES", commandCode, canonicalRequest);
        if (reservation.replay()) {
            return jsonCodec.read(reservation.responseJson(), DischargeDiagnosisListView.class);
        }
        CareEpisode episode = requireLockedEpisode(context, episodeId);
        if (!"ADMITTED".equals(episode.status())) {
            throw conflict("INPATIENT_EPISODE_NOT_ADMITTED", "只有在院患者可以维护出院诊断");
        }
        if (episode.revision() != input.expectedEpisodeRevision()) {
            throw conflict("INPATIENT_REVISION_CONFLICT", "住院记录已被其他用户更新，请刷新后重试");
        }
        InpatientEncounter encounter = requireEncounter(context, episode.id());
        List<DischargeDiagnosisView> values = encounterDiagnoses.replaceActiveDiagnoses(
                        new ReplaceDiagnosesCommand(context.tenantId(), encounter.id(), "DISCHARGE", normalized,
                                context.practitionerId(), requireActor(context), "住院出院诊断更新"))
                .stream().map(InpatientApplicationService::diagnosisView)
                .toList();
        DischargeDiagnosisListView response = new DischargeDiagnosisListView(episode.id(), encounter.id(), values);
        idempotency.complete("INPATIENT_DISCHARGE_DIAGNOSES", commandCode, "CareEpisode", episode.id(),
                200, jsonCodec.write(response));
        return response;
    }

    @Transactional
    public BedView changeBedStatus(Long bedId, BedStatusCommand input) {
        ExecutionContext context = requireAction("INPATIENT.BED_MANAGE");
        String commandCode = requireCommand(input.commandCode());
        if (events.findByTenantIdAndCommandCode(context.tenantId(), commandCode).isPresent()) {
            return bedViews(context).stream().filter(value -> value.id().equals(bedId)).findFirst()
                    .orElseThrow(() -> notFound("INPATIENT_BED_NOT_FOUND", "床位不存在"));
        }
        String status = normalize(input.status());
        if (!BED_OPERATIONAL_STATUSES.contains(status)) {
            throw badRequest("INPATIENT_BED_STATUS_INVALID", "床位状态不合法");
        }
        InpatientBedProfile bed = bedProfiles.findLocked(context.tenantId(), bedId)
                .orElseThrow(() -> notFound("INPATIENT_BED_NOT_FOUND", "床位不存在"));
        ServiceLocation location = requireBedLocation(context, bedId);
        if (occupancies.findByTenantIdAndBedLocationId(context.tenantId(), bedId).isPresent()) {
            throw conflict("INPATIENT_BED_OCCUPIED", "占用中的床位不能调整运行状态");
        }
        String before = bed.operationalStatus();
        try {
            bed.changeStatus(status, input.expectedRevision(), requireActor(context));
        } catch (IllegalStateException exception) {
            throw conflict("INPATIENT_REVISION_CONFLICT", "床位已被其他人更新，请刷新后重试");
        }
        events.save(new InpatientEvent(
                context.tenantId(), null, null, "BED_STATUS_CHANGED", before, status,
                location.id(), location.id(), commandCode, trim(input.reason()), requireActor(context)));
        bedProfiles.flush();
        return bedViews(context).stream().filter(value -> value.id().equals(bedId)).findFirst()
                .orElseThrow(() -> notFound("INPATIENT_BED_NOT_FOUND", "床位不存在"));
    }

    private List<BedView> bedViews(ExecutionContext context) {
        List<ServiceLocation> allLocations = locations.findByTenantIdAndOrganizationIdOrderBySortOrderAscCodeAsc(
                context.tenantId(), context.organizationId());
        Map<Long, ServiceLocation> locationsById = allLocations.stream()
                .collect(Collectors.toMap(ServiceLocation::id, Function.identity()));
        Map<Long, InpatientBedOccupancy> occupancyByBed = occupancies.findByTenantId(context.tenantId()).stream()
                .collect(Collectors.toMap(InpatientBedOccupancy::bedLocationId, Function.identity()));
        Map<Long, String> departmentNames = new LinkedHashMap<>();
        return bedProfiles.findByTenantId(context.tenantId()).stream()
                .filter(profile -> {
                    ServiceLocation location = locationsById.get(profile.bedLocationId());
                    return location != null && context.organizationId().equals(location.organizationId());
                })
                .map(profile -> {
                    ServiceLocation bed = locationsById.get(profile.bedLocationId());
                    ServiceLocation room = locationsById.get(bed.parentId());
                    ServiceLocation ward = room != null && "ROOM".equals(room.locationType())
                            ? locationsById.get(room.parentId()) : room;
                    InpatientBedOccupancy occupancy = occupancyByBed.get(bed.id());
                    String departmentName = departmentNames.computeIfAbsent(bed.departmentId(), id ->
                            organizations.requireDepartment(context.tenantId(), context.organizationId(), id).name());
                    ResidentSnapshot resident = occupancy == null ? null : residents.requireSnapshot(occupancy.residentId());
                    return new BedView(
                            bed.id(), profile.revision(), bed.organizationId(), bed.departmentId(), departmentName,
                            ward == null ? null : ward.id(), ward == null ? null : ward.name(),
                            room == null || "WARD".equals(room.locationType()) ? null : room.id(),
                            room == null || "WARD".equals(room.locationType()) ? null : room.name(),
                            bed.code(), bed.name(), profile.bedType(), profile.genderRestriction(),
                            profile.operationalStatus(), occupancy == null ? profile.operationalStatus() : "OCCUPIED",
                            profile.nursingGroupCode(), profile.dailyBedRate(),
                            occupancy == null ? null : occupancy.episodeId(),
                            occupancy == null ? null : occupancy.residentId(),
                            resident == null ? null : resident.fullName(),
                            occupancy == null ? null : occupancy.startedAt());
                })
                .toList();
    }

    private List<EpisodeView> episodeViews(ExecutionContext context, Collection<String> statuses) {
        return episodes.findByTenantIdAndOrganizationIdAndEpisodeTypeAndStatusInOrderByStartAtDesc(
                        context.tenantId(), context.organizationId(), "INPATIENT", statuses).stream()
                .map(value -> episodeView(context, value))
                .toList();
    }

    private EpisodeView episodeView(ExecutionContext context, CareEpisode episode) {
        ResidentSnapshot resident = residents.requireSnapshot(episode.residentId());
        InpatientEncounter encounter = requireEncounter(context, episode.id());
        InpatientEpisodeDetail detail = episodeDetails.findByEpisodeIdAndTenantId(episode.id(), context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_DETAIL_NOT_FOUND", "住院明细不存在"));
        InpatientBedOccupancy occupancy = occupancies.findByTenantIdAndEpisodeId(context.tenantId(), episode.id())
                .orElse(null);
        Map<Long, ServiceLocation> locationMap = locations.findByTenantIdAndOrganizationIdOrderBySortOrderAscCodeAsc(
                        context.tenantId(), context.organizationId()).stream()
                .collect(Collectors.toMap(ServiceLocation::id, Function.identity()));
        ServiceLocation bed = occupancy == null ? null : locationMap.get(occupancy.bedLocationId());
        ServiceLocation room = bed == null ? null : locationMap.get(bed.parentId());
        ServiceLocation ward = room != null && "ROOM".equals(room.locationType())
                ? locationMap.get(room.parentId()) : room;
        DepartmentView department = organizations.requireDepartment(
                context.tenantId(), context.organizationId(), encounter.departmentId());
        return new EpisodeView(
                episode.id(), episode.revision(), episode.episodeNo(), episode.status(),
                resident.id(), resident.fullName(), resident.healthRecordNo(), resident.gender(), resident.birthDate(),
                episode.organizationId(), encounter.departmentId(), department.name(),
                encounter.id(), encounter.encounterNo(),
                ward == null ? null : ward.id(), ward == null ? null : ward.name(),
                room == null || "WARD".equals(room.locationType()) ? null : room.id(),
                room == null || "WARD".equals(room.locationType()) ? null : room.name(),
                bed == null ? null : bed.id(), bed == null ? detail.bedNoSnapshot() : bed.name(),
                detail.admissionTypeCode(), detail.admissionSourceCode(), detail.admissionReason(),
                detail.admissionMethodCode(), detail.conditionCode(), detail.paymentMethodCode(),
                detail.referralOrganizationName(), detail.emergencyContactName(),
                detail.emergencyContactRelationship(), detail.emergencyContactPhone(), detail.admissionNote(),
                detail.nursingLevelCode(), detail.dietCode(), episode.primaryPractitionerId(),
                episode.startAt(), episode.endAt(), detail.dischargeDispositionCode(), detail.dischargeNote());
    }

    private EpisodeView replayEpisode(ExecutionContext context, String commandCode) {
        return events.findByTenantIdAndCommandCode(context.tenantId(), commandCode)
                .filter(value -> value.episodeId() != null)
                .map(value -> episodes.findByIdAndTenantId(value.episodeId(), context.tenantId())
                        .map(episode -> episodeView(context, episode))
                        .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在")))
                .orElse(null);
    }

    private InpatientBedProfile requireAvailableBed(ExecutionContext context, Long bedId, String residentGender) {
        InpatientBedProfile bed = bedProfiles.findLocked(context.tenantId(), bedId)
                .orElseThrow(() -> notFound("INPATIENT_BED_NOT_FOUND", "床位不存在"));
        if (!"AVAILABLE".equals(bed.operationalStatus())) {
            throw conflict("INPATIENT_BED_UNAVAILABLE", "床位当前不可分配");
        }
        if (!"ANY".equals(bed.genderRestriction()) && !bed.genderRestriction().equals(residentGender)) {
            throw conflict("INPATIENT_BED_GENDER_RESTRICTED", "床位性别限制与患者不匹配");
        }
        return bed;
    }

    private ServiceLocation requireBedLocation(ExecutionContext context, Long bedId) {
        ServiceLocation location = locations.findByIdAndTenantId(bedId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_BED_NOT_FOUND", "床位位置不存在"));
        if (!context.organizationId().equals(location.organizationId()) || !"BED".equals(location.locationType())
                || !"ACTIVE".equals(location.status())) {
            throw forbidden("INPATIENT_BED_SCOPE_DENIED", "床位不属于当前机构或已停用");
        }
        return location;
    }

    private DepartmentView requireNursingDepartment(ExecutionContext context, Long departmentId) {
        DepartmentView department = organizations.requireDepartment(
                context.tenantId(), context.organizationId(), departmentId);
        if (!"NURSING".equals(department.sdDepartmentProperty()) || !"ACTIVE".equals(department.sdOrgStatus())) {
            throw badRequest("INPATIENT_NURSING_UNIT_REQUIRED", "床位必须归属已启用的护理单元");
        }
        return department;
    }

    private CareEpisode requireLockedEpisode(ExecutionContext context, Long episodeId) {
        CareEpisode episode = episodes.findLocked(context.tenantId(), episodeId)
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        if (!context.organizationId().equals(episode.organizationId())) {
            throw forbidden("INPATIENT_SCOPE_DENIED", "住院记录不属于当前机构");
        }
        return episode;
    }

    private CareEpisode requireEpisode(ExecutionContext context, Long episodeId) {
        CareEpisode episode = episodes.findByIdAndTenantId(episodeId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        if (!context.organizationId().equals(episode.organizationId())) {
            throw forbidden("INPATIENT_SCOPE_DENIED", "住院记录不属于当前机构");
        }
        return episode;
    }

    private InpatientBedOccupancy requireOccupancy(ExecutionContext context, Long episodeId) {
        return occupancies.findByTenantIdAndEpisodeId(context.tenantId(), episodeId)
                .orElseThrow(() -> conflict("INPATIENT_OCCUPANCY_MISSING", "患者当前没有有效床位"));
    }

    private InpatientEncounter requireEncounter(ExecutionContext context, Long episodeId) {
        return encounters.findByTenantIdAndEpisodeId(context.tenantId(), episodeId)
                .orElseThrow(() -> notFound("INPATIENT_ENCOUNTER_NOT_FOUND", "住院接触不存在"));
    }

    private EncounterLocationHistory requireActiveLocationHistory(ExecutionContext context, Long encounterId) {
        return locationHistories.findFirstByTenantIdAndEncounterIdAndStatusOrderByStartAtDesc(
                        context.tenantId(), encounterId, "ACTIVE")
                .orElseThrow(() -> conflict("INPATIENT_LOCATION_HISTORY_MISSING", "当前床位历史不存在"));
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.organizationId() == null) {
            throw badRequest("WORK_CONTEXT_REQUIRED", "请先选择医疗机构工作上下文");
        }
        organizations.requireOrganization(context.tenantId(), context.organizationId());
        return context;
    }

    private ExecutionContext requireAction(String authority) {
        ExecutionContext context = requireContext();
        if (!context.hasAuthority(authority) && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("INPATIENT_ACTION_DENIED", "当前岗位无权执行该住院操作");
        }
        return context;
    }

    private static Long requireActor(ExecutionContext context) {
        if (context.subjectId() == null) throw forbidden("ACTOR_REQUIRED", "当前操作人身份不可用");
        return context.subjectId();
    }

    private static String requireCommand(String value) {
        String command = trim(value);
        if (command == null) throw badRequest("INPATIENT_COMMAND_REQUIRED", "业务请求号不能为空");
        return command;
    }

    private static String nextBusinessNo(String prefix) {
        String id = Long.toString(GlobalIds.next());
        String suffix = id.substring(Math.max(0, id.length() - 8));
        return prefix + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE) + suffix;
    }

    private static boolean matches(EpisodeView value, String keyword) {
        String normalized = trim(keyword);
        if (normalized == null) return true;
        String lowered = normalized.toLowerCase(Locale.ROOT);
        return value.residentName().toLowerCase(Locale.ROOT).contains(lowered)
                || value.healthRecordNo().toLowerCase(Locale.ROOT).contains(lowered)
                || value.episodeNo().toLowerCase(Locale.ROOT).contains(lowered)
                || value.bedNo() != null && value.bedNo().toLowerCase(Locale.ROOT).contains(lowered);
    }

    private static String normalize(String value) {
        String trimmed = trim(value);
        return trimmed == null ? "" : trimmed.toUpperCase(Locale.ROOT);
    }

    private static String defaultCode(String value, String fallback) {
        String normalized = normalize(value);
        return normalized.isEmpty() ? fallback : normalized;
    }

    private static String defaultText(String value, String fallback) {
        String normalized = trim(value);
        return normalized == null ? fallback : normalized;
    }

    private static List<DiagnosisInput> normalizeDiagnoses(List<DiagnosisCommand> values, String stageName) {
        if (values == null || values.isEmpty()) {
            throw badRequest("INPATIENT_DIAGNOSIS_REQUIRED", "至少需要一条" + stageName + "诊断");
        }
        List<DiagnosisInput> normalized = values.stream().map(value -> new DiagnosisInput(
                requiredText(value.code(), "INPATIENT_DIAGNOSIS_CODE_REQUIRED", "诊断编码不能为空").toUpperCase(Locale.ROOT),
                requiredText(value.display(), "INPATIENT_DIAGNOSIS_DISPLAY_REQUIRED", "诊断名称不能为空"),
                requiredDiagnosisType(value.diagnosisType()),
                requiredVerificationStatus(value.verificationStatus()))).toList();
        if (normalized.stream().filter(value -> "PRIMARY".equals(value.diagnosisType())).count() > 1) {
            throw badRequest("INPATIENT_PRIMARY_DIAGNOSIS_DUPLICATE", stageName + "诊断只能有一条主要诊断");
        }
        if (new LinkedHashSet<>(normalized.stream().map(DiagnosisInput::code).toList()).size() != normalized.size()) {
            throw badRequest("INPATIENT_DIAGNOSIS_CODE_DUPLICATE", "同一诊断编码不能重复提交");
        }
        return normalized;
    }

    private static DischargeDiagnosisView diagnosisView(
            EncounterDiagnosisDirectory.DiagnosisSnapshot value) {
        return new DischargeDiagnosisView(value.id(), value.diagnosisStage(), value.code(), value.display(),
                value.diagnosisType(), value.verificationStatus(), value.diagnosisStatus());
    }

    private static AdmissionDiagnosisView admissionDiagnosisView(
            EncounterDiagnosisDirectory.DiagnosisSnapshot value) {
        return new AdmissionDiagnosisView(value.id(), value.diagnosisStage(), value.code(), value.display(),
                value.diagnosisType(), value.verificationStatus(), value.diagnosisStatus());
    }

    private static String requiredDiagnosisType(String value) {
        String normalized = normalize(value);
        if (!Set.of("PRIMARY", "SECONDARY").contains(normalized)) {
            throw badRequest("INPATIENT_DIAGNOSIS_TYPE_INVALID", "诊断类型必须为主要诊断或次要诊断");
        }
        return normalized;
    }

    private static String requiredVerificationStatus(String value) {
        String normalized = normalize(value);
        if (!Set.of("CONFIRMED", "PROVISIONAL").contains(normalized)) {
            throw badRequest("INPATIENT_DIAGNOSIS_VERIFICATION_INVALID", "诊断确认状态不合法");
        }
        return normalized;
    }

    private static String requiredText(String value, String code, String message) {
        String normalized = trim(value);
        if (normalized == null) throw badRequest(code, message);
        return normalized;
    }

    private String requireContactRelationship(ExecutionContext context, String value) {
        String normalized = trim(value);
        if (normalized == null) return null;
        boolean valid = dictionaries.resolveActiveItems(context.tenantId(), "PI_RELATED_PERSON_RELATIONSHIP")
                .stream().anyMatch(item -> item.code().equals(normalized));
        if (!valid) throw badRequest("INPATIENT_CONTACT_RELATIONSHIP_INVALID", "患者关系不在基础字典中");
        return normalized;
    }

    private static String trim(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    public record AdmissionCommand(
            Long residentId, Long bedId, String admissionTypeCode, String admissionSourceCode,
            String admissionReason, String nursingLevelCode, String dietCode,
            Long responsibleNurseId, Instant admittedAt, String admissionMethodCode, String conditionCode,
            String paymentMethodCode, String referralOrganizationName, String emergencyContactName,
            String emergencyContactRelationship, String emergencyContactPhone, String admissionNote,
            String commandCode) {
    }

    public record RecordDischargeDiagnosesCommand(
            long expectedEpisodeRevision, List<DiagnosisCommand> diagnoses, String commandCode) {
    }

    public record RecordAdmissionDiagnosesCommand(
            long expectedEpisodeRevision, List<DiagnosisCommand> diagnoses, String commandCode) {
    }

    public record DiagnosisCommand(
            String code, String display, String diagnosisType, String verificationStatus) {
    }

    public record MovementCommand(long expectedRevision, Long targetBedId, String reason, String commandCode) {
    }

    public record DischargeCommand(long expectedRevision, String dispositionCode, String note, String commandCode) {
    }

    public record BedStatusCommand(long expectedRevision, String status, String reason, String commandCode) {
    }
}
