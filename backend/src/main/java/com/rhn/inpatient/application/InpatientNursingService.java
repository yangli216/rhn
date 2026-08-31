package com.rhn.inpatient.application;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.inpatient.api.InpatientNursingViews.HandoffPatientView;
import com.rhn.inpatient.api.InpatientNursingViews.HandoffSignatureView;
import com.rhn.inpatient.api.InpatientNursingViews.NursingContent;
import com.rhn.inpatient.api.InpatientNursingViews.NursingAssessment;
import com.rhn.inpatient.api.InpatientNursingViews.NursingRecordView;
import com.rhn.inpatient.api.InpatientNursingViews.ObservationSummary;
import com.rhn.inpatient.api.InpatientNursingViews.ShiftHandoffView;
import com.rhn.inpatient.domain.CareEpisode;
import com.rhn.inpatient.domain.InpatientBedOccupancy;
import com.rhn.inpatient.domain.InpatientEncounter;
import com.rhn.inpatient.domain.InpatientNursingRecord;
import com.rhn.inpatient.domain.InpatientShiftHandoff;
import com.rhn.inpatient.domain.InpatientShiftHandoffItem;
import com.rhn.inpatient.domain.InpatientShiftHandoffSignature;
import com.rhn.inpatient.domain.ServiceLocation;
import com.rhn.inpatient.infrastructure.CareEpisodeRepository;
import com.rhn.inpatient.infrastructure.InpatientBedOccupancyRepository;
import com.rhn.inpatient.infrastructure.InpatientEncounterRepository;
import com.rhn.inpatient.infrastructure.InpatientNursingRecordRepository;
import com.rhn.inpatient.infrastructure.InpatientShiftHandoffItemRepository;
import com.rhn.inpatient.infrastructure.InpatientShiftHandoffRepository;
import com.rhn.inpatient.infrastructure.InpatientShiftHandoffSignatureRepository;
import com.rhn.inpatient.infrastructure.ServiceLocationRepository;
import com.rhn.platform.cryptography.api.CryptographicEvidenceService;
import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.platform.cryptography.api.ProtectionProfile;
import com.rhn.platform.cryptography.api.ProtectionRequest;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InpatientNursingService {
    private static final String NURSING_AUTHORITY = "INPATIENT.NURSING_RECORD";
    private static final String HANDOFF_AUTHORITY = "INPATIENT.SHIFT_HANDOFF";
    private static final String NURSING_SCHEMA = "RHN.INPATIENT_NURSING_RECORD.V2";
    private static final String HANDOFF_SCHEMA = "RHN.INPATIENT_SHIFT_HANDOFF.V1";
    private static final Set<String> RECORD_TYPES = Set.of(
            "ASSESSMENT", "ROUTINE", "CONDITION", "INTERVENTION", "MEDICATION", "SAFETY", "EDUCATION", "OTHER");
    private static final Set<String> CONSCIOUSNESS_CODES = Set.of(
            "ALERT", "DROWSY", "STUPOR", "COMA", "OTHER");
    private static final Set<String> ASSESSMENT_TYPES = Set.of("ADMISSION", "REASSESSMENT");
    private static final Set<String> ADMISSION_METHODS = Set.of("WALKING", "WHEELCHAIR", "STRETCHER", "AMBULANCE");
    private static final Set<String> COMMUNICATION_STATUSES = Set.of("NORMAL", "IMPAIRED", "UNABLE");
    private static final Set<String> SELF_CARE_LEVELS = Set.of("INDEPENDENT", "PARTIAL_ASSISTANCE", "DEPENDENT");
    private static final Set<String> MOBILITY_LEVELS = Set.of("INDEPENDENT", "ASSISTED", "BEDBOUND");
    private static final Set<String> SKIN_STATUSES = Set.of("INTACT", "AT_RISK", "DAMAGED");
    private static final Set<String> NUTRITION_STATUSES = Set.of("NORMAL", "AT_RISK", "MALNOURISHED");
    private static final Set<String> RISK_LEVELS = Set.of("LOW", "MEDIUM", "HIGH");

    private final ExecutionContextProvider contextProvider;
    private final CareEpisodeRepository episodes;
    private final InpatientEncounterRepository encounters;
    private final InpatientBedOccupancyRepository occupancies;
    private final ServiceLocationRepository locations;
    private final ResidentDirectory residents;
    private final InpatientNursingRecordRepository nursingRecords;
    private final InpatientShiftHandoffRepository handoffs;
    private final InpatientShiftHandoffItemRepository handoffItems;
    private final InpatientShiftHandoffSignatureRepository handoffSignatures;
    private final CryptographicEvidenceService evidenceService;
    private final JsonCodec jsonCodec;

    public InpatientNursingService(
            ExecutionContextProvider contextProvider,
            CareEpisodeRepository episodes,
            InpatientEncounterRepository encounters,
            InpatientBedOccupancyRepository occupancies,
            ServiceLocationRepository locations,
            ResidentDirectory residents,
            InpatientNursingRecordRepository nursingRecords,
            InpatientShiftHandoffRepository handoffs,
            InpatientShiftHandoffItemRepository handoffItems,
            InpatientShiftHandoffSignatureRepository handoffSignatures,
            CryptographicEvidenceService evidenceService,
            JsonCodec jsonCodec) {
        this.contextProvider = contextProvider;
        this.episodes = episodes;
        this.encounters = encounters;
        this.occupancies = occupancies;
        this.locations = locations;
        this.residents = residents;
        this.nursingRecords = nursingRecords;
        this.handoffs = handoffs;
        this.handoffItems = handoffItems;
        this.handoffSignatures = handoffSignatures;
        this.evidenceService = evidenceService;
        this.jsonCodec = jsonCodec;
    }

    @Transactional
    public NursingRecordView appendNursingRecord(Long episodeId, NursingRecordCommand input) {
        ExecutionContext context = requireAction(NURSING_AUTHORITY);
        String commandCode = requireCommand(input.commandCode());
        NursingContent content = normalizeContent(input.content());
        ObservationSummary summary = normalizeObservationSummary(input.observationSummary());
        String recordType = normalize(input.recordType());
        if (!RECORD_TYPES.contains(recordType)) {
            throw badRequest("INPATIENT_NURSING_RECORD_TYPE_INVALID", "护理记录类型不合法");
        }
        if (input.occurredAt() == null) {
            throw badRequest("INPATIENT_NURSING_TIME_REQUIRED", "护理业务时间不能为空");
        }
        NursingAssessment assessment = normalizeAssessment(input.assessment(), recordType);
        if (contentEmpty(content) && summary == null && assessment == null) {
            throw badRequest("INPATIENT_NURSING_CONTENT_EMPTY", "请至少录入一项护理内容或观察摘要");
        }
        String requestHash = hash(new NursingRequestDigest(
                episodeId, input.occurredAt(), recordType, content, summary, assessment, commandCode));

        InpatientNursingRecord replay = nursingRecords
                .findByTenantIdAndCommandCode(context.tenantId(), commandCode).orElse(null);
        if (replay != null) {
            requireRecordScope(context, replay);
            if (!replay.episodeId().equals(episodeId) || !replay.requestHash().equals(requestHash)) {
                throw conflict("INPATIENT_COMMAND_REUSED", "业务请求号已用于其他护理记录或负载不一致");
            }
            return nursingRecordView(replay);
        }

        EpisodeEncounter relation = requireEpisodeEncounter(context, episodeId);
        requireWritable(relation.episode());
        requireBusinessTime(relation.episode(), input.occurredAt(), "护理业务时间");

        String contentJson = jsonCodec.write(content);
        String summaryJson = summary == null ? null : jsonCodec.write(summary);
        String assessmentJson = assessment == null ? null : jsonCodec.write(assessment);
        InpatientNursingRecord record = new InpatientNursingRecord(
                context.tenantId(), context.organizationId(), context.departmentId(),
                relation.episode().id(), relation.encounter().id(), relation.episode().residentId(),
                input.occurredAt(), recordType, contentJson, summaryJson, assessmentJson, NURSING_SCHEMA,
                commandCode, requestHash, context.subjectId(), context.practitionerId(), requireActor(context));
        byte[] protectedContent = bytes(nursingIntegrity(record));
        EvidenceReceipt receipt = evidenceService.protect(new ProtectionRequest(
                ProtectionProfile.CLINICAL_DOCUMENT_CONTENT, "InpatientNursingRecord", record.id(), 1L,
                "APPEND", NURSING_SCHEMA, protectedContent, Map.of(
                "episodeId", record.episodeId().toString(),
                "encounterId", record.encounterId().toString(),
                "departmentId", record.departmentId().toString())));
        record.protect(receipt);
        nursingRecords.saveAndFlush(record);
        return nursingRecordView(record);
    }

    @Transactional(readOnly = true)
    public List<NursingRecordView> nursingRecords(Long episodeId, Instant from, Instant to) {
        ExecutionContext context = requireContext();
        requireRange(from, to, Duration.ofDays(31), "护理记录查询");
        requireEpisodeEncounter(context, episodeId);
        return nursingRecords
                .findByTenantIdAndOrganizationIdAndDepartmentIdAndEpisodeIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThanOrderByOccurredAtAscIdAsc(
                        context.tenantId(), context.organizationId(), context.departmentId(), episodeId, from, to)
                .stream().map(this::nursingRecordView).toList();
    }

    @Transactional
    public ShiftHandoffView createHandoff(HandoffCommand input) {
        ExecutionContext context = requireAction(HANDOFF_AUTHORITY);
        requireRange(input.from(), input.to(), Duration.ofHours(24), "交接班班次");
        String commandCode = requireCommand(input.commandCode());
        String wardSummary = requireText(input.wardSummary(), 2000, "病区摘要");
        List<String> generalItems = normalizedList(input.generalItems(), 100, 500, "病区交班事项");
        List<HandoffPatientCommand> patientCommands = input.patients() == null
                ? List.of() : input.patients().stream().map(this::normalizePatientCommand).toList();
        requireUniqueEpisodes(patientCommands);
        String requestHash = hash(new HandoffRequestDigest(
                input.from(), input.to(), wardSummary, generalItems, patientCommands, commandCode));

        InpatientShiftHandoff replay = handoffs
                .findByTenantIdAndCreateCommandCode(context.tenantId(), commandCode).orElse(null);
        if (replay != null) {
            requireHandoffScope(context, replay);
            if (!replay.createRequestHash().equals(requestHash)) {
                throw conflict("INPATIENT_COMMAND_REUSED", "业务请求号已用于其他交接班或负载不一致");
            }
            return handoffView(replay);
        }

        InpatientShiftHandoff handoff = new InpatientShiftHandoff(
                context.tenantId(), context.organizationId(), context.departmentId(),
                input.from(), input.to(), wardSummary, jsonCodec.write(generalItems),
                commandCode, requestHash, context.subjectId(), context.practitionerId(),
                requireActor(context), HANDOFF_SCHEMA);
        List<InpatientShiftHandoffItem> items = new ArrayList<>();
        for (int index = 0; index < patientCommands.size(); index++) {
            HandoffPatientCommand patient = patientCommands.get(index);
            EpisodeEncounter relation = requireEpisodeEncounter(context, patient.episodeId());
            requireWritable(relation.episode());
            ResidentSnapshot resident = residents.requireSnapshot(relation.episode().residentId());
            InpatientBedOccupancy occupancy = occupancies
                    .findByTenantIdAndEpisodeId(context.tenantId(), relation.episode().id()).orElse(null);
            ServiceLocation bed = occupancy == null ? null : locations
                    .findByIdAndTenantId(occupancy.bedLocationId(), context.tenantId()).orElse(null);
            items.add(new InpatientShiftHandoffItem(
                    context.tenantId(), handoff.id(), relation.episode().id(), relation.encounter().id(),
                    resident.id(), resident.fullName(), bed == null ? null : bed.name(), patient.situation(),
                    jsonCodec.write(patient.pendingActions()), jsonCodec.write(patient.riskFlags()), index));
        }
        byte[] protectedContent = handoffBytes(handoff, items);
        EvidenceReceipt receipt = evidenceService.protect(new ProtectionRequest(
                ProtectionProfile.CLINICAL_DOCUMENT_CONTENT, "InpatientShiftHandoff", handoff.id(), 1L,
                "CREATE", HANDOFF_SCHEMA, protectedContent, Map.of(
                "organizationId", context.organizationId().toString(),
                "departmentId", context.departmentId().toString(),
                "shiftFrom", handoff.shiftFrom().toString(),
                "shiftTo", handoff.shiftTo().toString())));
        handoff.protect(receipt);
        handoffs.save(handoff);
        handoffItems.saveAll(items);
        handoffs.flush();
        handoffItems.flush();
        return handoffView(handoff, items, List.of());
    }

    @Transactional(readOnly = true)
    public List<ShiftHandoffView> handoffs(Instant from, Instant to, String requestedStatus) {
        ExecutionContext context = requireContext();
        requireRange(from, to, Duration.ofDays(31), "交接班查询");
        String status = normalize(requestedStatus);
        if (status != null && !Set.of("DRAFT", "SUBMITTED", "ACCEPTED").contains(status)) {
            throw badRequest("INPATIENT_HANDOFF_STATUS_INVALID", "交接班状态不合法");
        }
        return handoffs
                .findByTenantIdAndOrganizationIdAndDepartmentIdAndShiftFromLessThanAndShiftToGreaterThanOrderByShiftFromDescIdDesc(
                        context.tenantId(), context.organizationId(), context.departmentId(), to, from)
                .stream().filter(value -> status == null || status.equals(value.status()))
                .map(this::handoffView).toList();
    }

    @Transactional(readOnly = true)
    public ShiftHandoffView handoff(Long handoffId) {
        ExecutionContext context = requireContext();
        return handoffView(requireHandoff(context, handoffId));
    }

    @Transactional
    public ShiftHandoffView submitHandoff(Long handoffId, SignatureCommand input) {
        return sign(handoffId, input, "HANDOVER", "HANDOVER_SIGN");
    }

    @Transactional
    public ShiftHandoffView acceptHandoff(Long handoffId, SignatureCommand input) {
        return sign(handoffId, input, "TAKEOVER", "TAKEOVER_SIGN");
    }

    private ShiftHandoffView sign(Long handoffId, SignatureCommand input, String stage, String operation) {
        ExecutionContext context = requireAction(HANDOFF_AUTHORITY);
        String commandCode = requireCommand(input.commandCode());
        String requestHash = hash(new SignatureRequestDigest(handoffId, stage, commandCode));
        InpatientShiftHandoffSignature replay = handoffSignatures
                .findByTenantIdAndCommandCode(context.tenantId(), commandCode).orElse(null);
        if (replay != null) {
            InpatientShiftHandoff replayHandoff = requireHandoff(context, replay.handoffId());
            if (!replay.handoffId().equals(handoffId) || !replay.stage().equals(stage)
                    || !replay.requestHash().equals(requestHash)) {
                throw conflict("INPATIENT_COMMAND_REUSED", "业务请求号已用于其他交接班签署");
            }
            return handoffView(replayHandoff);
        }

        InpatientShiftHandoff handoff = handoffs.findLocked(context.tenantId(), handoffId)
                .orElseThrow(() -> notFound("INPATIENT_HANDOFF_NOT_FOUND", "交接班记录不存在"));
        requireHandoffScope(context, handoff);
        if ("HANDOVER".equals(stage) && !"DRAFT".equals(handoff.status())) {
            throw conflict("INPATIENT_HANDOFF_NOT_DRAFT", "仅草稿交接班可以提交");
        }
        if ("TAKEOVER".equals(stage) && !"SUBMITTED".equals(handoff.status())) {
            throw conflict("INPATIENT_HANDOFF_NOT_SUBMITTED", "仅已提交交接班可以接班确认");
        }
        List<InpatientShiftHandoffItem> items = handoffItems
                .findByTenantIdAndHandoffIdOrderBySortOrderAscIdAsc(context.tenantId(), handoff.id());
        for (InpatientShiftHandoffItem item : items) {
            EpisodeEncounter relation = requireEpisodeEncounter(context, item.episodeId());
            requireWritable(relation.episode());
            if (!relation.encounter().id().equals(item.encounterId())) {
                throw conflict("INPATIENT_HANDOFF_PATIENT_CHANGED", "交班患者就诊关系已发生变化");
            }
        }
        byte[] protectedContent = handoffBytes(handoff, items);
        evidenceService.requireValid(handoff.integrityEvidenceId(), protectedContent);
        EvidenceReceipt receipt = evidenceService.protect(new ProtectionRequest(
                ProtectionProfile.CLINICAL_DOCUMENT_SIGNATURE, "InpatientShiftHandoff", handoff.id(), 1L,
                operation, HANDOFF_SCHEMA, protectedContent, Map.of(
                "departmentId", handoff.departmentId().toString(),
                "signatureMeaning", stage,
                "shiftFrom", handoff.shiftFrom().toString(),
                "shiftTo", handoff.shiftTo().toString())));
        InpatientShiftHandoffSignature signature = new InpatientShiftHandoffSignature(
                context.tenantId(), handoff.id(), stage, stage, context.subjectId(), context.practitionerId(),
                requireActor(context),
                commandCode, requestHash, receipt);
        handoffSignatures.save(signature);
        if ("HANDOVER".equals(stage)) handoff.submit();
        else handoff.accept();
        handoffSignatures.flush();
        handoffs.flush();
        List<InpatientShiftHandoffSignature> signatures = handoffSignatures
                .findByTenantIdAndHandoffIdOrderBySignedAtAscIdAsc(context.tenantId(), handoff.id());
        return handoffView(handoff, items, signatures);
    }

    private EpisodeEncounter requireEpisodeEncounter(ExecutionContext context, Long episodeId) {
        if (episodeId == null) throw badRequest("INPATIENT_EPISODE_REQUIRED", "住院记录不能为空");
        CareEpisode episode = episodes.findByIdAndTenantId(episodeId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "住院记录不存在"));
        InpatientEncounter encounter = encounters.findByTenantIdAndEpisodeId(context.tenantId(), episodeId)
                .orElseThrow(() -> notFound("INPATIENT_ENCOUNTER_NOT_FOUND", "住院就诊不存在"));
        if (!context.organizationId().equals(episode.organizationId())
                || !context.organizationId().equals(encounter.organizationId())
                || !context.departmentId().equals(encounter.departmentId())) {
            throw forbidden("INPATIENT_WARD_SCOPE_FORBIDDEN", "当前工作病区无权访问该住院记录");
        }
        return new EpisodeEncounter(episode, encounter);
    }

    private InpatientShiftHandoff requireHandoff(ExecutionContext context, Long handoffId) {
        InpatientShiftHandoff handoff = handoffs.findByIdAndTenantId(handoffId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_HANDOFF_NOT_FOUND", "交接班记录不存在"));
        requireHandoffScope(context, handoff);
        return handoff;
    }

    private void requireRecordScope(ExecutionContext context, InpatientNursingRecord record) {
        if (!context.organizationId().equals(record.organizationId())
                || !context.departmentId().equals(record.departmentId())) {
            throw forbidden("INPATIENT_WARD_SCOPE_FORBIDDEN", "当前工作病区无权访问该护理记录");
        }
    }

    private void requireHandoffScope(ExecutionContext context, InpatientShiftHandoff handoff) {
        if (!context.organizationId().equals(handoff.organizationId())
                || !context.departmentId().equals(handoff.departmentId())) {
            throw forbidden("INPATIENT_WARD_SCOPE_FORBIDDEN", "当前工作病区无权访问该交接班记录");
        }
    }

    private void requireWritable(CareEpisode episode) {
        if (!"ADMITTED".equals(episode.status())) {
            throw conflict("INPATIENT_NURSING_READ_ONLY", "患者已出院，护理与交接班记录只读");
        }
    }

    private void requireBusinessTime(CareEpisode episode, Instant value, String label) {
        if (value.isBefore(episode.startAt()) || (episode.endAt() != null && value.isAfter(episode.endAt()))) {
            throw badRequest("INPATIENT_NURSING_TIME_OUTSIDE_EPISODE", label + "必须位于本次住院期间");
        }
        if (value.isAfter(Instant.now().plusSeconds(300))) {
            throw badRequest("INPATIENT_NURSING_TIME_IN_FUTURE", label + "不能晚于当前时间");
        }
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.organizationId() == null || context.departmentId() == null) {
            throw badRequest("WORK_CONTEXT_REQUIRED", "请先选择当前机构和病区");
        }
        return context;
    }

    private ExecutionContext requireAction(String authority) {
        ExecutionContext context = requireContext();
        if (!context.hasAuthority(authority) && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("INPATIENT_ACTION_FORBIDDEN", "当前账号无权执行该住院护理操作");
        }
        return context;
    }

    private void requireRange(Instant from, Instant to, Duration maximum, String label) {
        if (from == null || to == null) throw badRequest("INPATIENT_TIME_RANGE_REQUIRED", label + "起止时间不能为空");
        if (!to.isAfter(from)) throw badRequest("INPATIENT_TIME_RANGE_INVALID", label + "结束时间必须晚于开始时间");
        if (Duration.between(from, to).compareTo(maximum) > 0) {
            throw badRequest("INPATIENT_TIME_RANGE_TOO_LONG", label + "时间跨度不能超过" + maximum.toHours() + "小时");
        }
    }

    private NursingContent normalizeContent(NursingContent value) {
        if (value == null) return new NursingContent(null, null, null, null, null, null);
        return new NursingContent(
                text(value.focus(), 300, "护理重点"), text(value.observation(), 2000, "病情观察"),
                text(value.intervention(), 2000, "护理措施"), text(value.response(), 2000, "护理反应"),
                text(value.education(), 1000, "健康教育"), text(value.note(), 1000, "护理备注"));
    }

    private ObservationSummary normalizeObservationSummary(ObservationSummary value) {
        if (value == null) return null;
        boolean systolic = value.systolicBloodPressure() != null;
        boolean diastolic = value.diastolicBloodPressure() != null;
        if (systolic != diastolic) {
            throw badRequest("INPATIENT_BLOOD_PRESSURE_PAIR_REQUIRED", "收缩压和舒张压必须同时录入");
        }
        requireRange(value.temperatureCelsius(), "30", "45", "体温");
        requireRange(value.pulseRate(), "0", "300", "脉搏");
        requireRange(value.respiratoryRate(), "0", "100", "呼吸");
        requireRange(value.systolicBloodPressure(), "20", "300", "收缩压");
        requireRange(value.diastolicBloodPressure(), "10", "200", "舒张压");
        requireRange(value.oxygenSaturation(), "0", "100", "血氧饱和度");
        requireRange(value.intakeVolumeMl(), "0", "100000", "入量");
        requireRange(value.outputVolumeMl(), "0", "100000", "出量");
        if (value.painScore() != null && (value.painScore() < 0 || value.painScore() > 10)) {
            throw badRequest("INPATIENT_PAIN_SCORE_INVALID", "疼痛评分必须在0至10之间");
        }
        String consciousness = normalize(value.consciousnessCode());
        if (consciousness != null && !CONSCIOUSNESS_CODES.contains(consciousness)) {
            throw badRequest("INPATIENT_CONSCIOUSNESS_INVALID", "意识状态编码不合法");
        }
        List<String> flags = normalizedList(value.riskFlags(), 20, 100, "护理风险标记");
        ObservationSummary normalized = new ObservationSummary(
                value.temperatureCelsius(), value.pulseRate(), value.respiratoryRate(),
                value.systolicBloodPressure(), value.diastolicBloodPressure(), value.oxygenSaturation(),
                value.intakeVolumeMl(), value.outputVolumeMl(), value.painScore(), consciousness, flags);
        return observationSummaryEmpty(normalized) ? null : normalized;
    }

    private NursingAssessment normalizeAssessment(NursingAssessment value, String recordType) {
        if (!"ASSESSMENT".equals(recordType)) {
            if (value != null) {
                throw badRequest("INPATIENT_NURSING_ASSESSMENT_TYPE_REQUIRED", "结构化评估只能用于护理评估记录");
            }
            return null;
        }
        if (value == null) {
            throw badRequest("INPATIENT_NURSING_ASSESSMENT_REQUIRED", "护理评估内容不能为空");
        }
        String assessmentType = requireCode(value.assessmentType(), ASSESSMENT_TYPES, "评估类型");
        String admissionMethod = requireCode(value.admissionMethod(), ADMISSION_METHODS, "入院方式");
        String communication = requireCode(value.communicationStatus(), COMMUNICATION_STATUSES, "沟通状态");
        String selfCare = requireCode(value.selfCareLevel(), SELF_CARE_LEVELS, "自理能力");
        String mobility = requireCode(value.mobilityLevel(), MOBILITY_LEVELS, "活动能力");
        String skin = requireCode(value.skinStatus(), SKIN_STATUSES, "皮肤状态");
        String nutrition = requireCode(value.nutritionStatus(), NUTRITION_STATUSES, "营养状态");
        String fallRisk = requireCode(value.fallRiskLevel(), RISK_LEVELS, "跌倒风险");
        String pressureRisk = requireCode(value.pressureInjuryRiskLevel(), RISK_LEVELS, "压力性损伤风险");
        if (value.painScore() != null && (value.painScore() < 0 || value.painScore() > 10)) {
            throw badRequest("INPATIENT_PAIN_SCORE_INVALID", "疼痛评分必须在0至10之间");
        }
        return new NursingAssessment(
                assessmentType, admissionMethod, communication, selfCare, mobility, skin, nutrition,
                fallRisk, pressureRisk, value.painScore(),
                normalizedList(value.riskFlags(), 20, 100, "护理评估风险标记"),
                text(value.conclusion(), 1000, "护理评估结论"),
                normalizedList(value.immediateActions(), 20, 500, "即时护理措施"));
    }

    private String requireCode(String value, Set<String> allowed, String label) {
        String normalized = normalize(value);
        if (normalized == null || !allowed.contains(normalized)) {
            throw badRequest("INPATIENT_NURSING_ASSESSMENT_CODE_INVALID", label + "编码不合法");
        }
        return normalized;
    }

    private HandoffPatientCommand normalizePatientCommand(HandoffPatientCommand value) {
        if (value == null || value.episodeId() == null) {
            throw badRequest("INPATIENT_HANDOFF_PATIENT_REQUIRED", "交班患者不能为空");
        }
        return new HandoffPatientCommand(value.episodeId(), requireText(value.situation(), 2000, "患者交班情况"),
                normalizedList(value.pendingActions(), 50, 500, "患者待办"),
                normalizedList(value.riskFlags(), 20, 100, "患者风险标记"));
    }

    private void requireUniqueEpisodes(List<HandoffPatientCommand> patients) {
        Set<Long> seen = new HashSet<>();
        for (HandoffPatientCommand patient : patients) {
            if (!seen.add(patient.episodeId())) {
                throw badRequest("INPATIENT_HANDOFF_PATIENT_DUPLICATE", "同一患者住院记录不能重复交班");
            }
        }
    }

    private void requireRange(BigDecimal value, String minimum, String maximum, String label) {
        if (value == null) return;
        if (value.compareTo(new BigDecimal(minimum)) < 0 || value.compareTo(new BigDecimal(maximum)) > 0) {
            throw badRequest("INPATIENT_OBSERVATION_VALUE_INVALID", label + "超出允许录入范围");
        }
    }

    private boolean contentEmpty(NursingContent value) {
        return value.focus() == null && value.observation() == null && value.intervention() == null
                && value.response() == null && value.education() == null && value.note() == null;
    }

    private boolean observationSummaryEmpty(ObservationSummary value) {
        return value.temperatureCelsius() == null && value.pulseRate() == null
                && value.respiratoryRate() == null && value.systolicBloodPressure() == null
                && value.diastolicBloodPressure() == null && value.oxygenSaturation() == null
                && value.intakeVolumeMl() == null && value.outputVolumeMl() == null
                && value.painScore() == null && value.consciousnessCode() == null && value.riskFlags().isEmpty();
    }

    private List<String> normalizedList(List<String> values, int maximumItems, int maximumLength, String label) {
        if (values == null) return List.of();
        if (values.size() > maximumItems) throw badRequest("INPATIENT_LIST_TOO_LONG", label + "条目过多");
        List<String> result = new ArrayList<>();
        for (String value : values) {
            String normalized = requireText(value, maximumLength, label);
            result.add(normalized);
        }
        return List.copyOf(result);
    }

    private String requireText(String value, int maximumLength, String label) {
        String normalized = text(value, maximumLength, label);
        if (normalized == null) throw badRequest("INPATIENT_TEXT_REQUIRED", label + "不能为空");
        return normalized;
    }

    private String text(String value, int maximumLength, String label) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.length() > maximumLength) throw badRequest("INPATIENT_TEXT_TOO_LONG", label + "过长");
        return normalized;
    }

    private String requireCommand(String value) {
        String command = text(value, 128, "业务请求号");
        if (command == null) throw badRequest("INPATIENT_COMMAND_REQUIRED", "业务请求号不能为空");
        return command;
    }

    private String requireActor(ExecutionContext context) {
        return context.actor() == null || context.actor().isBlank()
                ? context.subjectId().toString() : context.actor();
    }

    private String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    private String hash(Object value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes(value));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    private byte[] bytes(Object value) {
        return jsonCodec.write(value).getBytes(StandardCharsets.UTF_8);
    }

    private NursingIntegrity nursingIntegrity(InpatientNursingRecord value) {
        return new NursingIntegrity(
                value.id(), value.tenantId(), value.organizationId(), value.departmentId(),
                value.episodeId(), value.encounterId(), value.residentId(), value.occurredAt(),
                value.recordType(), value.contentJson(), value.observationSummaryJson(), value.assessmentJson(), value.contentSchema(),
                value.recordedBySubjectId(), value.recordedByPractitionerId(), value.recorderName(), value.recordedAt());
    }

    private byte[] handoffBytes(InpatientShiftHandoff handoff, List<InpatientShiftHandoffItem> items) {
        List<HandoffItemIntegrity> itemFacts = items.stream().map(value -> new HandoffItemIntegrity(
                value.episodeId(), value.encounterId(), value.residentId(), value.residentNameSnapshot(),
                value.bedNoSnapshot(), value.situation(), value.pendingActionsJson(), value.riskFlagsJson(),
                value.sortOrder())).toList();
        return bytes(new HandoffIntegrity(
                handoff.id(), handoff.tenantId(), handoff.organizationId(), handoff.departmentId(),
                handoff.shiftFrom(), handoff.shiftTo(), handoff.wardSummary(), handoff.generalItemsJson(),
                handoff.contentSchema(), handoff.createdBySubjectId(), handoff.createdByPractitionerId(),
                handoff.creatorName(), handoff.createdAt(), itemFacts));
    }

    private NursingRecordView nursingRecordView(InpatientNursingRecord value) {
        return new NursingRecordView(
                value.id(), value.episodeId(), value.encounterId(), value.residentId(),
                value.organizationId(), value.departmentId(), value.occurredAt(), value.recordType(),
                jsonCodec.read(value.contentJson(), NursingContent.class),
                value.observationSummaryJson() == null ? null
                        : jsonCodec.read(value.observationSummaryJson(), ObservationSummary.class),
                value.assessmentJson() == null ? null
                        : jsonCodec.read(value.assessmentJson(), NursingAssessment.class),
                value.recordedBySubjectId(), value.recordedByPractitionerId(), value.recorderName(),
                value.recordedAt(), value.contentDigestAlgorithm(), value.contentDigest(),
                value.integrityEvidenceId());
    }

    private ShiftHandoffView handoffView(InpatientShiftHandoff value) {
        List<InpatientShiftHandoffItem> items = handoffItems
                .findByTenantIdAndHandoffIdOrderBySortOrderAscIdAsc(value.tenantId(), value.id());
        List<InpatientShiftHandoffSignature> signatures = handoffSignatures
                .findByTenantIdAndHandoffIdOrderBySignedAtAscIdAsc(value.tenantId(), value.id());
        return handoffView(value, items, signatures);
    }

    private ShiftHandoffView handoffView(InpatientShiftHandoff value,
                                         List<InpatientShiftHandoffItem> items,
                                         List<InpatientShiftHandoffSignature> signatures) {
        return new ShiftHandoffView(
                value.id(), value.revision(), value.organizationId(), value.departmentId(),
                value.shiftFrom(), value.shiftTo(), value.wardSummary(), stringList(value.generalItemsJson()),
                value.status(), value.createdBySubjectId(), value.createdByPractitionerId(),
                value.creatorName(), value.createdAt(), value.updatedAt(), value.contentDigestAlgorithm(),
                value.contentDigest(), value.integrityEvidenceId(),
                items.stream().map(item -> new HandoffPatientView(
                        item.id(), item.episodeId(), item.encounterId(), item.residentId(),
                        item.residentNameSnapshot(), item.bedNoSnapshot(), item.situation(),
                        stringList(item.pendingActionsJson()), stringList(item.riskFlagsJson()),
                        item.sortOrder())).toList(),
                signatures.stream().map(signature -> new HandoffSignatureView(
                        signature.id(), signature.stage(), signature.signatureMeaning(),
                        signature.signerSubjectId(), signature.signerPractitionerId(), signature.signerName(),
                        signature.signedAt(), signature.signatureEvidenceId())).toList());
    }

    private List<String> stringList(String json) {
        JsonNode value = jsonCodec.readTree(json);
        List<String> result = new ArrayList<>();
        value.forEach(item -> result.add(item.asText()));
        return List.copyOf(result);
    }

    public record NursingRecordCommand(
            Instant occurredAt, String recordType, NursingContent content,
            ObservationSummary observationSummary, NursingAssessment assessment, String commandCode) {
    }

    public record HandoffPatientCommand(
            Long episodeId, String situation, List<String> pendingActions, List<String> riskFlags) {
        public HandoffPatientCommand {
            pendingActions = pendingActions == null ? List.of() : List.copyOf(pendingActions);
            riskFlags = riskFlags == null ? List.of() : List.copyOf(riskFlags);
        }
    }

    public record HandoffCommand(
            Instant from, Instant to, String wardSummary, List<String> generalItems,
            List<HandoffPatientCommand> patients, String commandCode) {
    }

    public record SignatureCommand(String commandCode) {
    }

    private record EpisodeEncounter(CareEpisode episode, InpatientEncounter encounter) {
    }

    private record NursingRequestDigest(
            Long episodeId, Instant occurredAt, String recordType, NursingContent content,
            ObservationSummary observationSummary, NursingAssessment assessment, String commandCode) {
    }

    private record HandoffRequestDigest(
            Instant from, Instant to, String wardSummary, List<String> generalItems,
            List<HandoffPatientCommand> patients, String commandCode) {
    }

    private record SignatureRequestDigest(Long handoffId, String stage, String commandCode) {
    }

    private record NursingIntegrity(
            Long id, Long tenantId, Long organizationId, Long departmentId,
            Long episodeId, Long encounterId, Long residentId, Instant occurredAt,
            String recordType, String contentJson, String observationSummaryJson, String assessmentJson, String contentSchema,
            Long recordedBySubjectId, Long recordedByPractitionerId, String recorderName, Instant recordedAt) {
    }

    private record HandoffIntegrity(
            Long id, Long tenantId, Long organizationId, Long departmentId,
            Instant from, Instant to, String wardSummary, String generalItemsJson, String contentSchema,
            Long createdBySubjectId, Long createdByPractitionerId, String creatorName, Instant createdAt,
            List<HandoffItemIntegrity> patients) {
    }

    private record HandoffItemIntegrity(
            Long episodeId, Long encounterId, Long residentId, String residentName, String bedNo,
            String situation, String pendingActionsJson, String riskFlagsJson, int sortOrder) {
    }
}
