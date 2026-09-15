package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.Capabilities;
import com.rhn.ai.api.ClinicalAssistantContracts.DiagnosisCandidate;
import com.rhn.ai.api.ClinicalAssistantContracts.DiagnosisInput;
import com.rhn.ai.api.ClinicalAssistantContracts.Draft;
import com.rhn.ai.api.ClinicalAssistantContracts.Event;
import com.rhn.ai.api.ClinicalAssistantContracts.EventRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.GenerateRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.KnowledgeReference;
import com.rhn.ai.api.ClinicalAssistantContracts.KnowledgeSearch;
import com.rhn.ai.api.ClinicalAssistantContracts.KnowledgeSearchRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.RecordDraft;
import com.rhn.ai.api.ClinicalAssistantContracts.RecommendedPlan;
import com.rhn.ai.api.ClinicalAssistantContracts.SafetyAlert;
import com.rhn.ai.api.ClinicalAssistantContracts.Suggestion;
import com.rhn.ai.api.ClinicalAssistantContracts.SuggestionContent;
import com.rhn.ai.api.ClinicalAssistantContracts.Transcription;
import com.rhn.ai.domain.AiSuggestion;
import com.rhn.ai.domain.AiSuggestionEvent;
import com.rhn.ai.infrastructure.AiSuggestionEventRepository;
import com.rhn.ai.infrastructure.AiSuggestionRepository;
import com.rhn.diagnostics.api.DiagnosticReportDirectory;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.rhn.shared.json.JsonCodec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ClinicalAssistantApplicationService {
    private static final Logger log = LoggerFactory.getLogger(ClinicalAssistantApplicationService.class);
    private static final String ICD10_SYSTEM = "WHO.BD.CS.ICD10";
    private static final String OUTPATIENT_NOTE = "OUTPATIENT_NOTE";
    private static final String PROMPT_VERSION = "RHN-CLINICAL-ASSISTANT-V8";
    private static final String LOCAL_PROMPT_VERSION = "local-assist-v1";
    private static final String DISCLAIMER = "本结果仅为本地规则辅助生成的待核对建议，不构成诊断或处方；系统不会自动保存病历、确认诊断、开立医嘱或完成诊毕，须由医生独立判断并确认。";
    private static final String MODEL_DISCLAIMER = "本结果由模型基于当前就诊资料生成，并已通过院内术语、方案白名单和确定性安全规则复核；不构成诊断或处方，须由医生独立判断并确认。";

    private final ClinicalAiRuntimePolicy runtimePolicy;
    private final EncounterDirectory encounterDirectory;
    private final AllergyDirectory allergyDirectory;
    private final ClinicalDocumentDirectory clinicalDocumentDirectory;
    private final DiagnosticReportDirectory diagnosticReportDirectory;
    private final ResidentDirectory residentDirectory;
    private final TerminologyDirectory terminologyDirectory;
    private final OutpatientPlanTemplateDirectory planDirectory;
    private final OutpatientClinicalHistoryDirectory historyDirectory;
    private final ExecutionContextProvider contextProvider;
    private final AiSuggestionRepository suggestions;
    private final AiSuggestionEventRepository events;
    private final JsonCodec jsonCodec;
    private final ClinicalAiModelGateway modelGateway;
    private final ClinicalAiSpeechGateway speechGateway;
    private final ClinicalKnowledgeGateway knowledgeGateway;
    private final ClinicalAiMetrics metrics;
    private final ClinicalTreatmentRecommendationService treatmentService;

    public ClinicalAssistantApplicationService(ClinicalAiRuntimePolicy runtimePolicy,
                                               EncounterDirectory encounterDirectory,
                                               AllergyDirectory allergyDirectory,
                                               ClinicalDocumentDirectory clinicalDocumentDirectory,
                                               DiagnosticReportDirectory diagnosticReportDirectory,
                                               ResidentDirectory residentDirectory,
                                               TerminologyDirectory terminologyDirectory,
                                               OutpatientPlanTemplateDirectory planDirectory,
                                               OutpatientClinicalHistoryDirectory historyDirectory,
                                               ExecutionContextProvider contextProvider,
                                               AiSuggestionRepository suggestions,
                                               AiSuggestionEventRepository events,
                                               JsonCodec jsonCodec,
                                               ClinicalAiModelGateway modelGateway,
                                               ClinicalAiSpeechGateway speechGateway,
                                               ClinicalKnowledgeGateway knowledgeGateway,
                                               ClinicalAiMetrics metrics, ClinicalTreatmentRecommendationService treatmentService) {
        this.runtimePolicy = runtimePolicy;
        this.encounterDirectory = encounterDirectory;
        this.allergyDirectory = allergyDirectory;
        this.clinicalDocumentDirectory = clinicalDocumentDirectory;
        this.diagnosticReportDirectory = diagnosticReportDirectory;
        this.residentDirectory = residentDirectory;
        this.terminologyDirectory = terminologyDirectory;
        this.planDirectory = planDirectory;
        this.historyDirectory = historyDirectory;
        this.contextProvider = contextProvider;
        this.suggestions = suggestions;
        this.events = events;
        this.jsonCodec = jsonCodec;
        this.modelGateway = modelGateway;
        this.speechGateway = speechGateway;
        this.knowledgeGateway = knowledgeGateway;
        this.metrics = metrics;
        this.treatmentService = treatmentService;
    }

    public Capabilities capabilities() {
        ExecutionContext context = contextProvider.requireCurrent();
        ClinicalAssistantSettings runtime = runtimePolicy.current(context);
        return new Capabilities(runtime.mode().name(), runtime.availableFor(context), runtime.provider(), runtime.model(),
                runtime.messageFor(context), runtime.featuresFor(context));
    }

    public Transcription transcribe(Long encounterId, String contentType, byte[] audio) {
        Access access = requireAccess(encounterId, true);
        ClinicalAssistantSettings runtime = runtimePolicy.current(access.context());
        requireAvailable(runtime, access.context());
        if (!runtime.speechAvailable()) {
            throw new BusinessException("AI_SPEECH_UNAVAILABLE",
                    "语音转写尚未配置；医生站其他功能不受影响。", HttpStatus.SERVICE_UNAVAILABLE);
        }
        String normalizedType = safe(contentType).toLowerCase(Locale.ROOT).split(";", 2)[0];
        Map<String, String> extensions = Map.of("audio/webm", "webm", "audio/wav", "wav",
                "audio/x-wav", "wav", "audio/mpeg", "mp3", "audio/mp4", "mp4",
                "audio/m4a", "m4a", "audio/x-m4a", "m4a");
        String extension = extensions.get(normalizedType);
        if (extension == null) {
            throw new BusinessException("AI_SPEECH_FORMAT_UNSUPPORTED", "仅支持 webm、wav、mp3、mp4 或 m4a 录音。",
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
        if (audio == null || audio.length == 0) {
            throw new BusinessException("AI_SPEECH_EMPTY", "录音内容为空，请重新录制。", HttpStatus.BAD_REQUEST);
        }
        if (audio.length > runtime.maxAudioBytes()) {
            throw new BusinessException("AI_SPEECH_TOO_LARGE",
                    "录音超过 " + displayBytes(runtime.maxAudioBytes()) + "，请缩短后重试。",
                    HttpStatus.PAYLOAD_TOO_LARGE);
        }
        String transcript;
        try {
            transcript = speechGateway.transcribe(new ClinicalAiSpeechGateway.SpeechRequest(
                    normalizedType, "clinical-dictation." + extension, audio, "zh"), runtime);
        } catch (RuntimeException exception) {
            throw new BusinessException("AI_SPEECH_PROVIDER_UNAVAILABLE",
                    "语音转写暂时不可用，请改用文字输入或稍后重试。", HttpStatus.BAD_GATEWAY);
        }
        return new Transcription(clipped(transcript, 10000), runtime.provider(), runtime.speechModel(),
                normalizedType, audio.length, Instant.now());
    }

    public KnowledgeSearch searchKnowledge(Long encounterId, KnowledgeSearchRequest input) {
        Access access = requireAccess(encounterId, true);
        ClinicalAssistantSettings runtime = runtimePolicy.current(access.context());
        requireAvailable(runtime, access.context());
        if (!runtime.knowledgeAvailable()) {
            throw new BusinessException("AI_KNOWLEDGE_UNAVAILABLE",
                    "医学知识检索尚未配置；医生站其他功能不受影响。", HttpStatus.SERVICE_UNAVAILABLE);
        }
        String query = clipped(input.query(), 500);
        List<ClinicalKnowledgeGateway.KnowledgeResult> raw;
        try {
            raw = knowledgeGateway.search(query, runtime.maxKnowledgeResults(), runtime);
        } catch (RuntimeException exception) {
            throw new BusinessException("AI_KNOWLEDGE_PROVIDER_UNAVAILABLE",
                    "医学知识检索暂时不可用，请稍后重试。", HttpStatus.BAD_GATEWAY);
        }
        List<KnowledgeReference> results = raw == null ? List.of() : raw.stream()
                .filter(java.util.Objects::nonNull)
                .filter(value -> !blank(value.id()) && !blank(value.title()) && !blank(value.sourceName()))
                .limit(runtime.maxKnowledgeResults())
                .map(value -> new KnowledgeReference(clipped(value.id(), 200), clipped(value.title(), 500),
                        clipped(value.excerpt(), 2000), value.score() == null ? null
                        : Math.max(0, Math.min(value.score(), 1)), clipped(value.sourceName(), 300),
                        clipped(value.sourceId(), 200), clipped(value.publishYear(), 32),
                        clipped(value.resourcePosition(), 500)))
                .toList();
        return new KnowledgeSearch(query, runtime.provider(), results, Instant.now());
    }

    private static String displayBytes(int bytes) {
        if (bytes % (1024 * 1024) == 0) return bytes / (1024 * 1024) + " MB";
        if (bytes % 1024 == 0) return bytes / 1024 + " KB";
        return bytes + " bytes";
    }

    @Transactional
    public Suggestion generate(Long encounterId, GenerateRequest input) {
        return generate(encounterId, input, null);
    }

    @Transactional
    public Suggestion generate(Long encounterId, GenerateRequest input, java.util.function.Consumer<String> onDelta) {
        long started = System.nanoTime();
        ExecutionContext requestContext = contextProvider.requireCurrent();
        ClinicalAssistantSettings runtime = runtimePolicy.current(requestContext);
        try {
        requireAvailable(runtime, requestContext);
        Access access = requireAccess(encounterId, true);
        Instant now = Instant.now();
        ServerContext serverContext = loadServerContext(access);
        if (input.receptionSceneContext() != null && input.receptionSceneContext().selectedReportIds() != null
                && !serverContext.reports().stream().map(DiagnosticReportResponse::id).toList()
                .containsAll(input.receptionSceneContext().selectedReportIds())) {
            throw conflict("AI_REPORT_CONTEXT_STALE", "选定报告已变化或不属于可用就诊资料，请刷新后重试");
        }
        SuggestionContent priorSuggestion = requirePriorSuggestion(access, input, serverContext, now, runtime);
        String contextHash = contextHash(access, input);
        Analysis analysis = runtime.mode() == ClinicalAssistantSettings.Mode.MODEL
                ? analyzeWithModel(input, serverContext, priorSuggestion, runtime, onDelta)
                : analyzeLocally(access, input, serverContext);
        SuggestionContent content = analysis.content();

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("source", runtime.mode().name());
        evidence.put("promptVersion", runtime.mode() == ClinicalAssistantSettings.Mode.MODEL ? PROMPT_VERSION : null);
        evidence.put("parentSuggestionId", input.parentSuggestionId());
        evidence.put("receptionScene", input.receptionScene());
        evidence.put("receptionSceneContext", input.receptionSceneContext());
        evidence.put("clientContextHash", contextHash);
        evidence.put("clinicalDraftHash", clinicalDraftHash(access, input));
        evidence.put("serverContextHash", serverContext.hash());
        evidence.put("presentInputFields", presentInputFields(input));
        evidence.put("clinicalWriteInvoked", false);

        AiSuggestion value = suggestions.save(new AiSuggestion(access.context().tenantId(), access.encounter().residentId(),
                access.encounter().id(), access.encounter().organizationId(), access.encounter().departmentId(),
                input.clientContextFingerprint().trim(), contextHash, jsonCodec.write(content), jsonCodec.write(evidence),
                serverContext.hash(), analysis.riskLevel(), runtime.provider(), runtime.model(),
                runtime.mode() == ClinicalAssistantSettings.Mode.MODEL ? PROMPT_VERSION : LOCAL_PROMPT_VERSION,
                access.context().practitionerId(), access.context().subjectId(), now,
                now.plus(runtime.suggestionTtl())));
        events.save(new AiSuggestionEvent(value.tenantId(), value.id(), "GENERATED", null, "GENERATED",
                access.context().practitionerId(), access.context().subjectId(), null, value.contextHash(),
                "GENERATED-" + value.id(), runtime.mode() == ClinicalAssistantSettings.Mode.MODEL
                        ? "模型辅助建议生成" : "本地辅助建议生成", jsonCodec.write(Map.of(
                "provider", runtime.provider(), "mode", runtime.mode().name())), now));
        Suggestion result = view(value, content, now);
        metrics.recordGeneration(runtime.mode().name(), runtime.provider(), "SUCCESS", System.nanoTime() - started);
        return result;
        } catch (RuntimeException exception) {
            String outcome = exception instanceof BusinessException business ? business.code() : "UNEXPECTED_ERROR";
            metrics.recordGeneration(runtime.mode().name(), runtime.provider(), outcome, System.nanoTime() - started);
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public List<Suggestion> history(Long encounterId) {
        Access access = requireAccess(encounterId, false);
        Instant now = Instant.now();
        return suggestions.findTop50ByTenantIdAndEncounterIdOrderByGeneratedAtDescIdDesc(
                        access.context().tenantId(), access.encounter().id()).stream()
                .map(value -> {
                    requireSuggestionScope(value, access);
                    return view(value, readContent(value), now);
                }).toList();
    }

    @Transactional
    public EventRecordingOutcome recordEvent(Long suggestionId, EventRequest input) {
        ExecutionContext context = requireDoctorContext();
        AiSuggestion value = suggestions.lockByIdAndTenantId(suggestionId, context.tenantId())
                .orElseThrow(() -> notFound("AI_SUGGESTION_NOT_FOUND", "未找到 AI 建议"));
        Access access = requireAccess(value.encounterId(), "ADOPTED".equals(input.eventType()));
        requireSuggestionScope(value, access);

        AiSuggestionEvent replay = events.findByTenantIdAndSuggestionIdAndCommandCode(
                context.tenantId(), value.id(), input.commandCode().trim()).orElse(null);
        if (replay != null) {
            if (!replay.contextHash().equals(input.contextHash())
                    || !(replay.eventType().equals(input.eventType()) || "EXPIRED".equals(replay.eventType()))) {
                throw conflict("AI_EVENT_COMMAND_CONFLICT", "相同命令编号已经用于其他 AI 建议事件");
            }
            EventRecordingOutcome replayOutcome = "ADOPTED".equals(input.eventType()) && "EXPIRED".equals(replay.eventType())
                    ? EventRecordingOutcome.ADOPTION_REJECTED_EXPIRED : EventRecordingOutcome.RECORDED;
            metrics.recordSuggestionEvent(input.eventType(), replayOutcome == EventRecordingOutcome.RECORDED
                    ? "REPLAY" : "REJECTED_EXPIRED");
            return replayOutcome;
        }
        if (!value.contextHash().equals(input.contextHash())) {
            throw conflict("AI_SUGGESTION_CONTEXT_CHANGED", "当前病历上下文与建议生成时不一致，请重新分析");
        }

        Instant now = Instant.now();
        String from = value.status();
        String eventType = input.eventType();
        boolean expiredAdoption = false;
        boolean terminal = Set.of("ADOPTED", "IGNORED", "FAILED").contains(value.status());
        if (!now.isBefore(value.expiresAt()) && !terminal) {
            value.expire(now, "建议超过有效期");
            eventType = "EXPIRED";
            expiredAdoption = "ADOPTED".equals(input.eventType());
        } else {
            if ("ADOPTED".equals(eventType)
                    && !value.serverContextHash().equals(loadServerContext(access).hash())) {
                metrics.recordSuggestionEvent(eventType, "REJECTED_SERVER_CONTEXT_CHANGED");
                return EventRecordingOutcome.ADOPTION_REJECTED_SERVER_CONTEXT_CHANGED;
            }
            try {
                if ("ADOPTED".equals(eventType)) value.adopt(clean(input.sectionCode()));
                if ("IGNORED".equals(eventType)) value.ignore();
            } catch (IllegalStateException exception) {
                throw conflict("AI_SUGGESTION_STATE_INVALID", "当前 AI 建议状态不允许执行该操作");
            }
        }
        events.save(new AiSuggestionEvent(context.tenantId(), value.id(), eventType, from, value.status(),
                context.practitionerId(), context.subjectId(), clean(input.sectionCode()), value.contextHash(),
                input.commandCode().trim(), clean(input.detail()), jsonCodec.write(input), now));
        metrics.recordSuggestionEvent(eventType, expiredAdoption ? "REJECTED_EXPIRED" : "RECORDED");
        return expiredAdoption ? EventRecordingOutcome.ADOPTION_REJECTED_EXPIRED : EventRecordingOutcome.RECORDED;
    }

    @Transactional(readOnly = true)
    public List<Event> eventHistory(Long suggestionId) {
        ExecutionContext context = requireDoctorContext();
        AiSuggestion value = suggestions.findById(suggestionId)
                .filter(item -> item.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> notFound("AI_SUGGESTION_NOT_FOUND", "未找到 AI 建议"));
        requireSuggestionScope(value, requireAccess(value.encounterId(), false));
        return events.findByTenantIdAndSuggestionIdOrderByOccurredAtAsc(context.tenantId(), suggestionId).stream()
                .map(item -> new Event(item.id(), item.eventType(), item.statusFrom(), item.statusTo(),
                        item.commandCode(), item.sectionCode(), item.contextHash(), item.detail(), item.occurredAt()))
                .toList();
    }

    private Analysis analyzeLocally(Access access, GenerateRequest input, ServerContext serverContext) {
        Draft draft = input.draft();
        List<String> missing = missingInformation(draft);
        List<SafetyAlert> alerts = safetyAlerts(draft, serverContext.allergies());
        List<DiagnosisCandidate> candidates = diagnosisCandidates(access.context().tenantId(), draft, alerts);
        List<RecommendedPlan> plans = recommendedPlans(input, candidates, serverContext.plans());
        String summary = "已核对病历完整性、生命体征、过敏风险及 " + draft.diagnoses().size()
                + " 条诊断编码；发现 " + missing.size() + " 项待补充信息、" + alerts.size()
                + " 项优先核对内容，并匹配 " + plans.size() + " 个院内既有方案。";
        SuggestionContent content = new SuggestionContent(summary, conservativeRecordDraft(draft),
                candidates, List.of(), missing, alerts, plans, DISCLAIMER);
        String risk = alerts.stream().anyMatch(value -> "CRITICAL".equals(value.level())) ? "CRITICAL"
                : alerts.isEmpty() ? "INFO" : "MEDIUM";
        return new Analysis(content, risk);
    }

    private Analysis analyzeWithModel(GenerateRequest input, ServerContext serverContext,
                                      SuggestionContent priorSuggestion, ClinicalAssistantSettings runtime,
                                      java.util.function.Consumer<String> onDelta) {
        SuggestionContent raw;
        try {
            var request = new ClinicalAiModelGateway.ModelRequest(PROMPT_VERSION,
                    clean(input.question()), clean(input.voiceTranscript()), input.draft(),
                    serverContext.resident(), serverContext.allergies(),
                    serverContext.plans(), serverContext.reports(), serverContext.clinicalHistory(), priorSuggestion, input.receptionScene(), input.receptionSceneContext());
            raw = onDelta == null ? modelGateway.analyze(request, runtime)
                    : modelGateway.analyzeStreaming(request, runtime, onDelta);
        } catch (RuntimeException exception) {
            ClinicalAiModelException modelException = exception instanceof ClinicalAiModelException value ? value : null;
            // Only diagnostic metadata: exception messages/stacks can contain clinical text or provider secrets.
            log.warn("Clinical AI generation failed, correlationId={}, reason={}, providerStatus={}, exceptionType={}",
                    contextProvider.requireCurrent().correlationId(),
                    modelException == null ? ClinicalAiModelException.Reason.UNKNOWN : modelException.reason(),
                    modelException == null ? null : modelException.providerStatus(), exception.getClass().getSimpleName());
            throw new BusinessException("AI_MODEL_UNAVAILABLE",
                    modelException == null ? "模型辅助暂时不可用，请稍后重试；医生站其他功能不受影响。"
                            : modelException.userMessage(), HttpStatus.BAD_GATEWAY);
        }
        if (raw == null) {
            throw new BusinessException("AI_MODEL_RESPONSE_INVALID", "模型未返回有效的结构化建议，请稍后重试。",
                    HttpStatus.BAD_GATEWAY);
        }

        List<SafetyAlert> alerts = safetyAlerts(input.draft(), serverContext.allergies());
        alerts.addAll(validatedAlerts(raw.safetyAlerts()));
        alerts = distinctAlerts(alerts, 10);
        List<String> missing = distinctStrings(merge(missingInformation(input.draft()), raw.missingInformation()), 10, 300);
        List<DiagnosisCandidate> candidates = validatedDiagnosisCandidates(raw.diagnosisCandidates(), 3);
        List<DiagnosisCandidate> differentials = validatedDiagnosisCandidates(raw.differentialDiagnoses(), 5);
        List<RecommendedPlan> plans = validatedPlans(raw.recommendedPlans(), serverContext.plans());
        RecordDraft recordDraft = validatedRecordDraft(raw.recordDraft());
        String summary = clipped(raw.summary(), 1000);
        if (blank(summary)) {
            summary = "已完成病历草稿、诊断与鉴别方向、风险和院内方案的结构化辅助分析，请逐项核对。";
        }
        SuggestionContent content = new SuggestionContent(summary, recordDraft, candidates, differentials,
                missing, alerts, plans, MODEL_DISCLAIMER);
        if (!raw.treatmentRecommendations().isEmpty()) {
            var request = new ClinicalAiModelGateway.ModelRequest(PROMPT_VERSION, clean(input.question()),
                    clean(input.voiceTranscript()), input.draft(), serverContext.resident(), serverContext.allergies(),
                    serverContext.plans(), serverContext.reports(), serverContext.clinicalHistory(), content,
                    input.receptionScene(), input.receptionSceneContext());
            var treatment = treatmentService.recommend(raw.treatmentRecommendations(), request, runtime);
            List<SafetyAlert> completeAlerts = new ArrayList<>(alerts);
            completeAlerts.addAll(treatment.alerts());
            alerts = distinctAlerts(completeAlerts, 20);
            content = new SuggestionContent(summary, recordDraft, candidates, differentials, missing,
                    alerts, plans, MODEL_DISCLAIMER, treatment.items());
        }
        String risk = alerts.stream().anyMatch(value -> "CRITICAL".equals(value.level())) ? "CRITICAL"
                : alerts.isEmpty() ? "INFO" : "MEDIUM";
        return new Analysis(content, risk);
    }

    private SuggestionContent requirePriorSuggestion(Access access, GenerateRequest input,
                                                     ServerContext serverContext, Instant now,
                                                     ClinicalAssistantSettings runtime) {
        if (input.parentSuggestionId() == null) return null;
        if (runtime.mode() != ClinicalAssistantSettings.Mode.MODEL) {
            throw conflict("AI_FOLLOW_UP_MODEL_REQUIRED", "连续追问仅在模型辅助模式下可用");
        }
        if (blank(input.question())) {
            throw conflict("AI_FOLLOW_UP_QUESTION_REQUIRED", "连续追问必须填写问题");
        }
        AiSuggestion parent = suggestions.findById(input.parentSuggestionId())
                .filter(value -> value.tenantId().equals(access.context().tenantId()))
                .orElseThrow(() -> notFound("AI_PARENT_SUGGESTION_NOT_FOUND", "未找到上一轮 AI 建议"));
        requireSuggestionScope(parent, access);
        if (!parent.encounterId().equals(access.encounter().id())) {
            throw conflict("AI_PARENT_SUGGESTION_ENCOUNTER_CHANGED", "上一轮建议不属于当前就诊");
        }
        if (!parent.clientContextFingerprint().equals(input.clientContextFingerprint().trim())
                || !parent.serverContextHash().equals(serverContext.hash())) {
            throw conflict("AI_PARENT_SUGGESTION_CONTEXT_CHANGED", "当前就诊资料已变化，请重新分析后再追问");
        }
        Object parentDraftHash = jsonCodec.readObject(parent.evidenceJson()).get("clinicalDraftHash");
        if (!(parentDraftHash instanceof String value) || !value.equals(clinicalDraftHash(access, input))) {
            throw conflict("AI_PARENT_SUGGESTION_DRAFT_CHANGED", "当前病历草稿已变化，请重新分析后再追问");
        }
        if (!now.isBefore(parent.expiresAt()) || Set.of("IGNORED", "EXPIRED", "FAILED").contains(parent.status())) {
            throw conflict("AI_PARENT_SUGGESTION_UNAVAILABLE", "上一轮建议已失效，请重新分析");
        }
        return readContent(parent);
    }

    private RecordDraft conservativeRecordDraft(Draft draft) {
        String presentIllness = null;
        if (blank(draft.presentIllness()) && !blank(draft.chiefComplaint())) {
            presentIllness = "患者因“" + draft.chiefComplaint().trim()
                    + "”就诊；起病时间、症状演变、伴随症状及已采取措施待医生补充核实。";
        }
        String physicalExam = null;
        if (blank(draft.physicalExam())) {
            List<String> vitalFacts = new ArrayList<>();
            if (draft.systolic() != null && draft.diastolic() != null) {
                vitalFacts.add("血压 " + draft.systolic() + "/" + draft.diastolic() + " mmHg");
            }
            if (draft.temperature() != null) vitalFacts.add("体温 " + draft.temperature() + "℃");
            if (draft.pulseRate() != null) vitalFacts.add("脉搏 " + draft.pulseRate() + " 次/分");
            if (draft.respiratoryRate() != null) vitalFacts.add("呼吸 " + draft.respiratoryRate() + " 次/分");
            if (draft.oxygenSaturation() != null) vitalFacts.add("SpO₂ " + draft.oxygenSaturation() + "%");
            if (!vitalFacts.isEmpty()) {
                physicalExam = "已录入生命体征：" + String.join("，", vitalFacts) + "；专科查体待医生补充核实。";
            }
        }
        return new RecordDraft(null, presentIllness, null, physicalExam, null);
    }

    private List<String> missingInformation(Draft draft) {
        List<String> result = new ArrayList<>();
        if (blank(draft.chiefComplaint())) result.add("补充主诉（主要症状、部位和持续时间）");
        if (blank(draft.presentIllness())) result.add("补充现病史（起病、演变、伴随症状和已采取措施）");
        if (blank(draft.medicalHistory())) result.add("补充既往史及长期用药情况");
        if (blank(draft.physicalExam())) result.add("补充与本次就诊相关的查体所见");
        if (blank(draft.treatmentPlan())) result.add("补充诊疗计划和随访安排");
        if (draft.systolic() == null || draft.diastolic() == null) result.add("补录血压");
        if (draft.diagnoses().isEmpty()) result.add("补充至少一条由医生确认的诊断");
        return result;
    }

    private List<SafetyAlert> safetyAlerts(Draft draft, List<AllergyDirectory.AllergySnapshot> allergies) {
        List<SafetyAlert> result = new ArrayList<>();
        if (draft.systolic() != null && draft.diastolic() != null) {
            if (draft.systolic() >= 180 || draft.diastolic() >= 110) {
                result.add(new SafetyAlert("CRITICAL", "血压达到危急值核对范围",
                        "当前记录为 " + draft.systolic() + "/" + draft.diastolic() + " mmHg，请立即复测并按临床流程评估。"));
            } else if (draft.systolic() >= 140 || draft.diastolic() >= 90
                    || draft.systolic() <= 90 || draft.diastolic() <= 60) {
                result.add(new SafetyAlert("WARNING", "血压需要复核",
                        "当前记录为 " + draft.systolic() + "/" + draft.diastolic() + " mmHg，请结合症状复测。"));
            }
        }
        if (draft.oxygenSaturation() != null && draft.oxygenSaturation() <= 94) {
            String level = draft.oxygenSaturation() <= 92 ? "CRITICAL" : "WARNING";
            result.add(new SafetyAlert(level, "血氧饱和度偏低",
                    "当前记录为 " + draft.oxygenSaturation() + "% ，请核对测量质量并及时评估。"));
        }
        if (draft.temperature() != null && draft.temperature().compareTo(new java.math.BigDecimal("38.0")) >= 0) {
            String level = draft.temperature().compareTo(new java.math.BigDecimal("39.0")) >= 0 ? "CRITICAL" : "WARNING";
            result.add(new SafetyAlert(level, "体温升高", "当前记录为 " + draft.temperature() + "℃，请结合病情评估。"));
        }
        if (!allergies.isEmpty()) {
            boolean severe = allergies.stream().anyMatch(value -> "HIGH".equalsIgnoreCase(value.criticalityCode())
                    || "SEVERE".equalsIgnoreCase(value.reactionSeverity()));
            String names = allergies.stream().map(AllergyDirectory.AllergySnapshot::substanceDisplay)
                    .filter(value -> value != null && !value.isBlank()).distinct().limit(5)
                    .reduce((left, right) -> left + "、" + right).orElse("已登记过敏原");
            result.add(new SafetyAlert(severe ? "CRITICAL" : "WARNING", "已登记活动性过敏信息",
                    "开立任何相关医嘱前请核对：" + names + "。"));
        }
        return result;
    }

    private List<DiagnosisCandidate> diagnosisCandidates(Long tenantId, Draft draft, List<SafetyAlert> alerts) {
        List<DiagnosisCandidate> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (DiagnosisInput input : draft.diagnoses()) {
            String code = input.code().trim().toUpperCase(Locale.ROOT);
            if (!seen.add(code) || result.size() >= 3) continue;
            terminologyDirectory.findConcept(tenantId, ICD10_SYSTEM, code, LocalDate.now()).ifPresentOrElse(concept ->
                result.add(new DiagnosisCandidate(concept.code(), concept.display(), input.type(), 1.0,
                        "当前草稿诊断编码已通过院内 ICD-10 术语目录校验；仍须由医生确认。")), () ->
                alerts.add(new SafetyAlert("WARNING", "诊断编码未通过术语目录校验",
                        code + " 未进入候选，请核对编码后重新分析。")));
        }
        return result;
    }

    private List<RecommendedPlan> recommendedPlans(GenerateRequest input, List<DiagnosisCandidate> candidates,
                                                    List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> availablePlans) {
        String text = normalized(String.join(" ", safe(input.question()), safe(input.draft().chiefComplaint()),
                safe(input.draft().presentIllness()), candidates.stream()
                        .map(value -> value.code() + " " + value.display()).reduce("", (a, b) -> a + " " + b)));
        Set<String> diagnosisCodes = candidates.stream().map(value -> value.code().toUpperCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toSet());
        return availablePlans.stream()
                .map(plan -> new ScoredPlan(plan, planScore(plan, text, diagnosisCodes)))
                .filter(value -> value.score() > 0)
                .sorted(Comparator.comparingInt(ScoredPlan::score).reversed()
                        .thenComparing(value -> value.plan().useCount(), Comparator.reverseOrder()))
                .limit(3)
                .map(value -> new RecommendedPlan(value.plan().id(), value.plan().name(), value.plan().description(),
                        value.plan().diagnoses().stream().anyMatch(item -> diagnosisCodes.contains(item.code().toUpperCase(Locale.ROOT)))
                                ? "与当前已录入且通过术语校验的诊断匹配；仅推荐既有方案，未生成药品剂量。"
                                : "与本次辅助重点或病历关键词匹配；带入前需由医生完整核对。"))
                .toList();
    }

    private List<DiagnosisCandidate> validatedDiagnosisCandidates(List<DiagnosisCandidate> values, int limit) {
        if (values == null) return List.of();
        List<DiagnosisCandidate> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        Long tenantId = contextProvider.requireCurrent().tenantId();
        for (DiagnosisCandidate value : values) {
            if (value == null || result.size() >= limit) continue;
            var concept = blank(value.code()) ? java.util.Optional.<com.rhn.platform.terminology.api.TerminologyConceptSnapshot>empty()
                    : terminologyDirectory.findConcept(tenantId, ICD10_SYSTEM, value.code().trim().toUpperCase(Locale.ROOT), LocalDate.now());
            if (concept.isEmpty() && !blank(value.display())) concept = terminologyDirectory
                    .findDiseaseByExactName(tenantId, ICD10_SYSTEM, value.display(), LocalDate.now());
            concept.ifPresent(mapped -> {
                if (!seen.add(mapped.code())) return;
                String type = "PRIMARY".equals(value.type()) ? "PRIMARY" : "SECONDARY";
                result.add(new DiagnosisCandidate(mapped.code(), mapped.display(), type,
                        Double.isFinite(value.confidence()) ? Math.max(0, Math.min(value.confidence(), 1)) : 0,
                        clipped(value.rationale(), 500)));
            });
        }
        return List.copyOf(result);
    }

    private List<RecommendedPlan> validatedPlans(List<RecommendedPlan> values,
                                                  List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> available) {
        if (values == null) return List.of();
        Map<Long, OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> plansById = new LinkedHashMap<>();
        available.forEach(value -> plansById.put(value.id(), value));
        List<RecommendedPlan> result = new ArrayList<>();
        Set<Long> seen = new LinkedHashSet<>();
        for (RecommendedPlan value : values) {
            if (value == null || value.templateId() == null || !seen.add(value.templateId()) || result.size() >= 3) continue;
            var plan = plansById.get(value.templateId());
            if (plan == null) continue;
            result.add(new RecommendedPlan(plan.id(), plan.name(), plan.description(), clipped(value.rationale(), 500)));
        }
        return List.copyOf(result);
    }

    private List<SafetyAlert> validatedAlerts(List<SafetyAlert> values) {
        if (values == null) return List.of();
        return values.stream().filter(java.util.Objects::nonNull)
                .filter(value -> !blank(value.title()) && !blank(value.detail()))
                .limit(8)
                .map(value -> new SafetyAlert(Set.of("INFO", "WARNING", "CRITICAL").contains(value.level())
                                ? value.level() : "WARNING",
                        clipped(value.title(), 200), clipped(value.detail(), 1000)))
                .toList();
    }

    private List<SafetyAlert> distinctAlerts(List<SafetyAlert> values, int limit) {
        Map<String, SafetyAlert> result = new LinkedHashMap<>();
        for (SafetyAlert value : values) {
            result.putIfAbsent(normalized(value.title()) + "|" + normalized(value.detail()), value);
            if (result.size() >= limit) break;
        }
        return List.copyOf(result.values());
    }

    private RecordDraft validatedRecordDraft(RecordDraft value) {
        if (value == null) return new RecordDraft(null, null, null, null, null);
        return new RecordDraft(clipped(value.chiefComplaint(), 1000), clipped(value.presentIllness(), 4000),
                clipped(value.medicalHistory(), 4000), clipped(value.physicalExam(), 4000),
                clipped(value.treatmentPlan(), 4000));
    }

    private List<String> merge(List<String> left, List<String> right) {
        List<String> result = new ArrayList<>(left);
        if (right != null) result.addAll(right);
        return result;
    }

    private List<String> distinctStrings(List<String> values, int limit, int maxLength) {
        Set<String> result = new LinkedHashSet<>();
        for (String value : values) {
            String clean = clipped(value, maxLength);
            if (!blank(clean)) result.add(clean);
            if (result.size() >= limit) break;
        }
        return List.copyOf(result);
    }

    private int planScore(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan, String text,
                          Set<String> diagnosisCodes) {
        int score = 0;
        for (var diagnosis : plan.diagnoses()) {
            if (diagnosisCodes.contains(diagnosis.code().toUpperCase(Locale.ROOT))) score += 10;
            if (!blank(diagnosis.display()) && text.contains(normalized(diagnosis.display()))) score += 4;
        }
        if (!blank(plan.name()) && text.contains(normalized(plan.name()))) score += 3;
        if (!blank(plan.description()) && text.contains(normalized(plan.description()))) score += 1;
        return score;
    }

    private Access requireAccess(Long encounterId, boolean requireActive) {
        ExecutionContext context = requireDoctorContext();
        EncounterDirectory.EncounterSnapshot encounter = encounterDirectory.requireAccessible(encounterId);
        if (!context.tenantId().equals(encounter.tenantId())
                || !context.organizationId().equals(encounter.organizationId())
                || !context.departmentId().equals(encounter.departmentId())) {
            throw forbidden("AI_ENCOUNTER_CONTEXT_FORBIDDEN", "AI 建议只能用于当前机构和科室的就诊");
        }
        if (encounter.clinicianId() == null || !encounter.clinicianId().equals(context.actor())) {
            throw forbidden("AI_ENCOUNTER_DOCTOR_FORBIDDEN", "只有当前接诊医生可以使用该就诊的 AI 建议");
        }
        if (requireActive && !"IN_PROGRESS".equals(encounter.status())) {
            throw conflict("AI_ENCOUNTER_NOT_ACTIVE", "只有接诊中的就诊可以生成 AI 建议");
        }
        return new Access(context, encounter);
    }

    private ExecutionContext requireDoctorContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.tenantId() == null || context.subjectId() == null || context.practitionerId() == null
                || context.organizationId() == null || context.departmentId() == null) {
            throw forbidden("AI_DOCTOR_WORK_CONTEXT_REQUIRED", "请先选择包含机构、科室和执业人员的工作上下文");
        }
        return context;
    }

    private void requireSuggestionScope(AiSuggestion value, Access access) {
        if (!value.tenantId().equals(access.context().tenantId())
                || !value.organizationId().equals(access.context().organizationId())
                || !value.departmentId().equals(access.context().departmentId())
                || !value.requestedPractitionerId().equals(access.context().practitionerId())
                || !value.residentId().equals(access.encounter().residentId())) {
            throw forbidden("AI_SUGGESTION_SCOPE_FORBIDDEN", "当前工作上下文不能访问该 AI 建议");
        }
    }

    private void requireAvailable(ClinicalAssistantSettings runtime, ExecutionContext context) {
        if (!runtime.availableFor(context)) {
            throw new BusinessException("AI_CLINICAL_ASSISTANT_UNAVAILABLE", runtime.messageFor(context),
                    HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private String contextHash(Access access, GenerateRequest input) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("tenantId", access.context().tenantId());
        canonical.put("encounterId", access.encounter().id());
        canonical.put("residentId", access.encounter().residentId());
        canonical.put("organizationId", access.encounter().organizationId());
        canonical.put("departmentId", access.encounter().departmentId());
        canonical.put("clientContextFingerprint", input.clientContextFingerprint().trim());
        canonical.put("question", clean(input.question()));
        canonical.put("voiceTranscript", clean(input.voiceTranscript()));
        canonical.put("parentSuggestionId", input.parentSuggestionId());
        canonical.put("receptionScene", input.receptionScene());
        canonical.put("receptionSceneContext", input.receptionSceneContext());
        canonical.put("draft", input.draft());
        return sha256(canonical);
    }

    private String clinicalDraftHash(Access access, GenerateRequest input) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("tenantId", access.context().tenantId());
        canonical.put("encounterId", access.encounter().id());
        canonical.put("residentId", access.encounter().residentId());
        canonical.put("organizationId", access.encounter().organizationId());
        canonical.put("departmentId", access.encounter().departmentId());
        canonical.put("draft", input.draft());
        canonical.put("voiceTranscript", clean(input.voiceTranscript()));
        return sha256(canonical);
    }

    private ServerContext loadServerContext(Access access) {
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshot(access.encounter().residentId());
        List<AllergyDirectory.AllergySnapshot> allergies = allergyDirectory
                .activeForResident(access.encounter().residentId()).stream()
                .filter(value -> "ALLERGY".equals(value.assertionType()))
                .sorted(Comparator.comparing(AllergyDirectory.AllergySnapshot::id,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        ClinicalDocumentDirectory.EncounterDocumentAnchor document = clinicalDocumentDirectory
                .findEncounterDocumentAnchor(access.encounter().id(), OUTPATIENT_NOTE).orElse(null);
        List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> plans = planDirectory.visibleForCurrentContext();
        Instant historySince = Instant.now().minus(java.time.Duration.ofDays(90));
        List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> clinicalHistory = historyDirectory
                .recentForResident(access.encounter().residentId(), access.encounter().id(), historySince, 10);
        List<DiagnosticReportResponse> reportCandidates = new ArrayList<>(diagnosticReportDirectory
                .listByEncounter(access.encounter().id()));
        Instant reportSince = Instant.now().minus(java.time.Duration.ofDays(14));
        clinicalHistory.stream().filter(value -> value.registeredAt() != null && !value.registeredAt().isBefore(reportSince))
                .forEach(value -> reportCandidates.addAll(diagnosticReportDirectory.listByEncounter(value.encounterId())));
        List<DiagnosticReportResponse> reports = currentReports(reportCandidates);

        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("tenantId", access.context().tenantId());
        canonical.put("encounterId", access.encounter().id());
        canonical.put("encounterRevision", access.encounter().revision());
        canonical.put("encounterStatus", access.encounter().status());
        Map<String, Object> documentAnchor = new LinkedHashMap<>();
        documentAnchor.put("present", document != null);
        if (document != null) {
            documentAnchor.put("id", document.id());
            documentAnchor.put("version", document.version());
            documentAnchor.put("status", document.status());
        }
        canonical.put("outpatientNote", documentAnchor);
        canonical.put("resident", Map.of("id", resident.id(), "gender", safe(resident.gender()),
                "birthDate", resident.birthDate() == null ? "" : resident.birthDate().toString(),
                "deceased", resident.deceased()));
        canonical.put("allergies", allergies.stream().map(this::allergyFact).toList());
        canonical.put("availablePlans", plans.stream().map(value -> Map.of(
                "id", value.id(), "name", safe(value.name()), "description", safe(value.description()),
                "diagnoses", value.diagnoses(), "medications", value.medications(),
                "services", value.services())).toList());
        canonical.put("diagnosticReports", reports.stream().map(value -> Map.of(
                "id", value.id(), "version", value.reportVersion(), "status", safe(value.status()),
                "digest", safe(value.contentDigest()), "issuedAt", value.issuedAt() == null ? "" : value.issuedAt().toString()))
                .toList());
        canonical.put("clinicalHistory", clinicalHistory);
        return new ServerContext(resident, allergies, plans, reports, clinicalHistory, sha256(canonical));
    }

    private List<DiagnosticReportResponse> currentReports(List<DiagnosticReportResponse> values) {
        Map<String, DiagnosticReportResponse> current = new LinkedHashMap<>();
        for (DiagnosticReportResponse value : values) {
            if (value == null) continue;
            String key = value.requestId() + "|" + safe(value.reportCode());
            DiagnosticReportResponse previous = current.get(key);
            if (previous == null || value.reportVersion() > previous.reportVersion()) current.put(key, value);
        }
        return current.values().stream().filter(value -> !"CANCELLED".equals(value.status()))
                .sorted(Comparator.comparing(DiagnosticReportResponse::issuedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(50).toList();
    }

    private Map<String, Object> allergyFact(AllergyDirectory.AllergySnapshot value) {
        Map<String, Object> fact = new LinkedHashMap<>();
        fact.put("id", value.id());
        fact.put("assertionType", value.assertionType());
        fact.put("categoryCode", value.categoryCode());
        fact.put("criticalityCode", value.criticalityCode());
        fact.put("reactionSeverity", value.reactionSeverity());
        fact.put("substanceCodeSystemUri", value.substanceCodeSystemUri());
        fact.put("substanceCode", value.substanceCode());
        fact.put("substanceDisplay", value.substanceDisplay());
        fact.put("reactionText", value.reactionText());
        return fact;
    }

    private List<String> presentInputFields(GenerateRequest input) {
        List<String> fields = new ArrayList<>();
        if (!blank(input.question())) fields.add("question");
        if (!blank(input.voiceTranscript())) fields.add("voiceTranscript");
        Draft draft = input.draft();
        if (!blank(draft.chiefComplaint())) fields.add("draft.chiefComplaint");
        if (!blank(draft.presentIllness())) fields.add("draft.presentIllness");
        if (!blank(draft.medicalHistory())) fields.add("draft.medicalHistory");
        if (!blank(draft.physicalExam())) fields.add("draft.physicalExam");
        if (!blank(draft.treatmentPlan())) fields.add("draft.treatmentPlan");
        if (draft.systolic() != null) fields.add("draft.systolic");
        if (draft.diastolic() != null) fields.add("draft.diastolic");
        if (draft.temperature() != null) fields.add("draft.temperature");
        if (draft.pulseRate() != null) fields.add("draft.pulseRate");
        if (draft.respiratoryRate() != null) fields.add("draft.respiratoryRate");
        if (draft.oxygenSaturation() != null) fields.add("draft.oxygenSaturation");
        if (!draft.diagnoses().isEmpty()) fields.add("draft.diagnoses");
        return List.copyOf(fields);
    }

    private String sha256(Object canonical) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest(jsonCodec.write(canonical).getBytes(StandardCharsets.UTF_8));
            return "sha256:" + HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private Suggestion view(AiSuggestion value, SuggestionContent content, Instant now) {
        String status = !now.isBefore(value.expiresAt()) && !Set.of("ADOPTED", "IGNORED", "FAILED").contains(value.status())
                ? "EXPIRED" : value.status();
        Object parent = jsonCodec.readObject(value.evidenceJson()).get("parentSuggestionId");
        Long parentSuggestionId = parent instanceof Number number ? number.longValue()
                : parent instanceof String text && text.matches("[0-9]+") ? Long.valueOf(text) : null;
        return new Suggestion(value.id(), parentSuggestionId, status, value.contextHash(), value.clientContextFingerprint(),
                value.providerCode(), value.modelCode(), value.promptVersion(), value.generatedAt(), value.expiresAt(), content.summary(),
                content.recordDraft(), content.diagnosisCandidates(), content.differentialDiagnoses(),
                content.missingInformation(), content.safetyAlerts(), content.recommendedPlans(), content.disclaimer(), content.treatmentRecommendations());
    }

    private SuggestionContent readContent(AiSuggestion value) {
        return jsonCodec.read(value.contentJson(), SuggestionContent.class);
    }

    private static String normalized(String value) { return safe(value).toLowerCase(Locale.ROOT); }
    private static String safe(String value) { return value == null ? "" : value.trim(); }
    private static String clean(String value) { return blank(value) ? null : value.trim(); }
    private static String clipped(String value, int maxLength) {
        String clean = clean(value);
        return clean == null || clean.length() <= maxLength ? clean : clean.substring(0, maxLength);
    }
    private static boolean blank(String value) { return value == null || value.isBlank(); }

    private record Access(ExecutionContext context, EncounterDirectory.EncounterSnapshot encounter) {}
    private record ServerContext(ResidentDirectory.ResidentSnapshot resident,
                                 List<AllergyDirectory.AllergySnapshot> allergies,
                                 List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> plans,
                                 List<DiagnosticReportResponse> reports,
                                 List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> clinicalHistory,
                                 String hash) {}
    private record Analysis(SuggestionContent content, String riskLevel) {}
    private record ScoredPlan(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan, int score) {}

    public enum EventRecordingOutcome {
        RECORDED, ADOPTION_REJECTED_EXPIRED, ADOPTION_REJECTED_SERVER_CONTEXT_CHANGED
    }
}
