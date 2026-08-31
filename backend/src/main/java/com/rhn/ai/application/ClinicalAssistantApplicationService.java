package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.Capabilities;
import com.rhn.ai.api.ClinicalAssistantContracts.DiagnosisCandidate;
import com.rhn.ai.api.ClinicalAssistantContracts.DiagnosisInput;
import com.rhn.ai.api.ClinicalAssistantContracts.Draft;
import com.rhn.ai.api.ClinicalAssistantContracts.Event;
import com.rhn.ai.api.ClinicalAssistantContracts.EventRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.GenerateRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.RecordDraft;
import com.rhn.ai.api.ClinicalAssistantContracts.RecommendedPlan;
import com.rhn.ai.api.ClinicalAssistantContracts.SafetyAlert;
import com.rhn.ai.api.ClinicalAssistantContracts.Suggestion;
import com.rhn.ai.api.ClinicalAssistantContracts.SuggestionContent;
import com.rhn.ai.domain.AiSuggestion;
import com.rhn.ai.domain.AiSuggestionEvent;
import com.rhn.ai.infrastructure.AiSuggestionEventRepository;
import com.rhn.ai.infrastructure.AiSuggestionRepository;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
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
    private static final String ICD10_SYSTEM = "WHO.BD.CS.ICD10";
    private static final String OUTPATIENT_NOTE = "OUTPATIENT_NOTE";
    private static final String DISCLAIMER = "本结果仅为本地规则辅助生成的待核对建议，不构成诊断或处方；系统不会自动保存病历、确认诊断、开立医嘱或完成诊毕，须由医生独立判断并确认。";

    private final ClinicalAssistantSettings settings;
    private final EncounterDirectory encounterDirectory;
    private final AllergyDirectory allergyDirectory;
    private final ClinicalDocumentDirectory clinicalDocumentDirectory;
    private final TerminologyDirectory terminologyDirectory;
    private final OutpatientPlanTemplateDirectory planDirectory;
    private final ExecutionContextProvider contextProvider;
    private final AiSuggestionRepository suggestions;
    private final AiSuggestionEventRepository events;
    private final JsonCodec jsonCodec;

    public ClinicalAssistantApplicationService(ClinicalAssistantSettings settings,
                                               EncounterDirectory encounterDirectory,
                                               AllergyDirectory allergyDirectory,
                                               ClinicalDocumentDirectory clinicalDocumentDirectory,
                                               TerminologyDirectory terminologyDirectory,
                                               OutpatientPlanTemplateDirectory planDirectory,
                                               ExecutionContextProvider contextProvider,
                                               AiSuggestionRepository suggestions,
                                               AiSuggestionEventRepository events,
                                               JsonCodec jsonCodec) {
        this.settings = settings;
        this.encounterDirectory = encounterDirectory;
        this.allergyDirectory = allergyDirectory;
        this.clinicalDocumentDirectory = clinicalDocumentDirectory;
        this.terminologyDirectory = terminologyDirectory;
        this.planDirectory = planDirectory;
        this.contextProvider = contextProvider;
        this.suggestions = suggestions;
        this.events = events;
        this.jsonCodec = jsonCodec;
    }

    public Capabilities capabilities() {
        return new Capabilities(settings.mode().name(), settings.available(), settings.provider(), settings.model(),
                settings.message(), settings.features());
    }

    @Transactional
    public Suggestion generate(Long encounterId, GenerateRequest input) {
        requireAvailable();
        Access access = requireAccess(encounterId, true);
        Instant now = Instant.now();
        String contextHash = contextHash(access, input);
        ServerContext serverContext = loadServerContext(access);
        Analysis analysis = analyze(access, input, serverContext.allergies());
        SuggestionContent content = analysis.content();

        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("source", "LOCAL_ASSIST");
        evidence.put("clientContextHash", contextHash);
        evidence.put("serverContextHash", serverContext.hash());
        evidence.put("presentInputFields", presentInputFields(input));
        evidence.put("clinicalWriteInvoked", false);

        AiSuggestion value = suggestions.save(new AiSuggestion(access.context().tenantId(), access.encounter().residentId(),
                access.encounter().id(), access.encounter().organizationId(), access.encounter().departmentId(),
                input.clientContextFingerprint().trim(), contextHash, jsonCodec.write(content), jsonCodec.write(evidence),
                serverContext.hash(), analysis.riskLevel(), settings.provider(), settings.model(),
                access.context().practitionerId(), access.context().subjectId(), now,
                now.plus(settings.suggestionTtl())));
        events.save(new AiSuggestionEvent(value.tenantId(), value.id(), "GENERATED", null, "GENERATED",
                access.context().practitionerId(), access.context().subjectId(), null, value.contextHash(),
                "GENERATED-" + value.id(), "本地辅助建议生成", jsonCodec.write(Map.of(
                "provider", settings.provider(), "mode", settings.mode().name())), now));
        return view(value, content, now);
    }

    @Transactional(readOnly = true)
    public List<Suggestion> history(Long encounterId) {
        Access access = requireAccess(encounterId, false);
        Instant now = Instant.now();
        return suggestions.findByTenantIdAndEncounterIdOrderByGeneratedAtDesc(
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
            return "ADOPTED".equals(input.eventType()) && "EXPIRED".equals(replay.eventType())
                    ? EventRecordingOutcome.ADOPTION_REJECTED_EXPIRED : EventRecordingOutcome.RECORDED;
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

    private Analysis analyze(Access access, GenerateRequest input,
                             List<AllergyDirectory.AllergySnapshot> allergies) {
        Draft draft = input.draft();
        List<String> missing = missingInformation(draft);
        List<SafetyAlert> alerts = safetyAlerts(draft, allergies);
        List<DiagnosisCandidate> candidates = diagnosisCandidates(access.context().tenantId(), draft, alerts);
        List<RecommendedPlan> plans = recommendedPlans(input, candidates);
        String summary = "已核对病历完整性、生命体征、过敏风险及 " + draft.diagnoses().size()
                + " 条诊断编码；发现 " + missing.size() + " 项待补充信息、" + alerts.size()
                + " 项优先核对内容，并匹配 " + plans.size() + " 个院内既有方案。";
        SuggestionContent content = new SuggestionContent(summary, conservativeRecordDraft(draft),
                candidates, List.of(), missing, alerts, plans, DISCLAIMER);
        String risk = alerts.stream().anyMatch(value -> "CRITICAL".equals(value.level())) ? "CRITICAL"
                : alerts.isEmpty() ? "INFO" : "MEDIUM";
        return new Analysis(content, risk);
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
            try {
                var concept = terminologyDirectory.requireConcept(tenantId, ICD10_SYSTEM, code, LocalDate.now());
                result.add(new DiagnosisCandidate(concept.code(), concept.display(), input.type(), 1.0,
                        "当前草稿诊断编码已通过院内 ICD-10 术语目录校验；仍须由医生确认。"));
            } catch (BusinessException exception) {
                alerts.add(new SafetyAlert("WARNING", "诊断编码未通过术语目录校验",
                        code + " 未进入候选，请核对编码后重新分析。"));
            }
        }
        return result;
    }

    private List<RecommendedPlan> recommendedPlans(GenerateRequest input, List<DiagnosisCandidate> candidates) {
        String text = normalized(String.join(" ", safe(input.question()), safe(input.draft().chiefComplaint()),
                safe(input.draft().presentIllness()), candidates.stream()
                        .map(value -> value.code() + " " + value.display()).reduce("", (a, b) -> a + " " + b)));
        Set<String> diagnosisCodes = candidates.stream().map(value -> value.code().toUpperCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toSet());
        return planDirectory.visibleForCurrentContext().stream()
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

    private void requireAvailable() {
        if (!settings.available()) {
            throw new BusinessException("AI_CLINICAL_ASSISTANT_UNAVAILABLE", settings.message(),
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
        canonical.put("draft", input.draft());
        return sha256(canonical);
    }

    private ServerContext loadServerContext(Access access) {
        List<AllergyDirectory.AllergySnapshot> allergies = allergyDirectory
                .activeForResident(access.encounter().residentId()).stream()
                .filter(value -> "ALLERGY".equals(value.assertionType()))
                .sorted(Comparator.comparing(AllergyDirectory.AllergySnapshot::id,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        ClinicalDocumentDirectory.EncounterDocumentAnchor document = clinicalDocumentDirectory
                .findEncounterDocumentAnchor(access.encounter().id(), OUTPATIENT_NOTE).orElse(null);

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
        canonical.put("allergies", allergies.stream().map(this::allergyFact).toList());
        return new ServerContext(allergies, sha256(canonical));
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
        return new Suggestion(value.id(), status, value.contextHash(), value.clientContextFingerprint(),
                value.providerCode(), value.modelCode(), value.generatedAt(), value.expiresAt(), content.summary(),
                content.recordDraft(), content.diagnosisCandidates(), content.differentialDiagnoses(),
                content.missingInformation(), content.safetyAlerts(), content.recommendedPlans(), content.disclaimer());
    }

    private SuggestionContent readContent(AiSuggestion value) {
        return jsonCodec.read(value.contentJson(), SuggestionContent.class);
    }

    private static String normalized(String value) { return safe(value).toLowerCase(Locale.ROOT); }
    private static String safe(String value) { return value == null ? "" : value.trim(); }
    private static String clean(String value) { return blank(value) ? null : value.trim(); }
    private static boolean blank(String value) { return value == null || value.isBlank(); }

    private record Access(ExecutionContext context, EncounterDirectory.EncounterSnapshot encounter) {}
    private record ServerContext(List<AllergyDirectory.AllergySnapshot> allergies, String hash) {}
    private record Analysis(SuggestionContent content, String riskLevel) {}
    private record ScoredPlan(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan, int score) {}

    public enum EventRecordingOutcome {
        RECORDED, ADOPTION_REJECTED_EXPIRED, ADOPTION_REJECTED_SERVER_CONTEXT_CHANGED
    }
}
