package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.CompileGuidelinePlanRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.CompilePlanDraftRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.MinedPlanSuggestionView;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanTextDraft;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanReviewItem;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.DiagnosisInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.MedicationInput;
import com.rhn.outpatient.api.AiPlanOrderInstructions;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.PlanTaskInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.SaveRequest;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.platform.masterdata.api.ClinicalDoseUnits;
import com.rhn.platform.masterdata.api.ClinicalFrequencySemantics;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.regex.Pattern;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;

/** Converts model-extracted intent into reviewable plan tasks and verified catalog entries. */
@Service
public class ClinicalPlanTemplateAiApplicationService {
    private static final Logger log = LoggerFactory.getLogger(ClinicalPlanTemplateAiApplicationService.class);
    private static final String PROMPT_VERSION = "RHN-PLAN-COMPILER-V3";
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> KINDS = Set.of("DIAGNOSIS", "MEDICATION", "LABORATORY",
            "EXAMINATION", "EDUCATION", "FOLLOW_UP", "CONDITION");
    private static final Pattern DAILY_MAXIMUM = Pattern.compile(
            "(?:24\\s*小时|每日|每天|一日)[^，,；;。\\n]{0,12}?(?:不超过|最多|至多)\\s*([0-9]+(?:\\.[0-9]+)?)\\s*次");

    private final MedicationIntentParser medicationParser;
    private final MedicationCandidateMatchingService medicationMatcher;
    private final MedicationKnowledgeDirectory medicationKnowledgeDirectory;
    private final MedicationRouteDirectory routes;
    private final OrderFrequencyDirectory frequencies;
    private final PlanInvestigationDecisionService investigationDecisions;
    private final DiagnosisNormalizationService diagnosisNormalizer;
    private final ClinicalPlanRetrievalService planRetrieval;
    private final OutpatientPlanTemplateDirectory planDirectory;
    private final ExecutionContextProvider contextProvider;
    private final ClinicalAiRuntimePolicy runtimePolicy;
    private final ClinicalAiModelGateway modelGateway;
    private final JsonCodec jsonCodec;

    public ClinicalPlanTemplateAiApplicationService(MedicationIntentParser medicationParser,
                                                     MedicationCandidateMatchingService medicationMatcher,
                                                     MedicationKnowledgeDirectory medicationKnowledgeDirectory,
                                                     MedicationRouteDirectory routes, OrderFrequencyDirectory frequencies,
                                                     PlanInvestigationDecisionService investigationDecisions,
                                                     DiagnosisNormalizationService diagnosisNormalizer,
                                                     ClinicalPlanRetrievalService planRetrieval,
                                                     OutpatientPlanTemplateDirectory planDirectory,
                                                     ExecutionContextProvider contextProvider,
                                                     ClinicalAiRuntimePolicy runtimePolicy,
                                                     ClinicalAiModelGateway modelGateway,
                                                     JsonCodec jsonCodec) {
        this.medicationParser = medicationParser;
        this.medicationMatcher = medicationMatcher;
        this.medicationKnowledgeDirectory = medicationKnowledgeDirectory;
        this.routes = routes; this.frequencies = frequencies;
        this.investigationDecisions = investigationDecisions;
        this.diagnosisNormalizer = diagnosisNormalizer;
        this.planRetrieval = planRetrieval;
        this.planDirectory = planDirectory;
        this.contextProvider = contextProvider;
        this.runtimePolicy = runtimePolicy;
        this.modelGateway = modelGateway;
        this.jsonCodec = jsonCodec;
    }

    public PlanTextDraft compilePlanDraftFromInput(CompilePlanDraftRequest input) {
        return compilePlanDraftFromInput(input, null);
    }

    public PlanTextDraft compilePlanDraftFromInput(CompilePlanDraftRequest input,
                                                   java.util.function.Consumer<String> onDelta) {
        String text = input.naturalInput() == null ? "" : input.naturalInput().trim();
        if (text.isBlank()) throw badRequest("AI_PLAN_INPUT_BLANK", "请输入用于编译方案的临床意图或描述");
        return preview(text, "INPUT", normalizeScope(input.scopeType()), null, null,
                input.confirmedNarrative(), input.revisionInstruction(), onDelta);
    }

    public SaveRequest convertPlanDraftFromInput(CompilePlanDraftRequest input) {
        String text = effectiveConfirmedText(input.naturalInput(), input.confirmedNarrative());
        if (text.isBlank()) throw badRequest("AI_PLAN_INPUT_BLANK", "请先确认文字方案内容");
        return compile(text, "INPUT", normalizeScope(input.scopeType()), null, null,
                input.confirmedName(), input.reviewItems());
    }

    public PlanTextDraft compilePlanFromGuideline(CompileGuidelinePlanRequest input) {
        return compilePlanFromGuideline(input, null);
    }

    public PlanTextDraft compilePlanFromGuideline(CompileGuidelinePlanRequest input,
                                                  java.util.function.Consumer<String> onDelta) {
        String text = input.guidelineText() == null ? "" : input.guidelineText().trim();
        if (text.isBlank()) throw badRequest("GUIDELINE_TEXT_BLANK", "指南或专家共识文本不能为空");
        String scope = input.scopeType() == null || input.scopeType().isBlank()
                ? "HOSPITAL" : normalizeScope(input.scopeType());
        return preview(text, "GUIDELINE", scope, input.guidelineName(), input.versionYear(),
                input.confirmedNarrative(), input.revisionInstruction(), onDelta);
    }

    public SaveRequest convertPlanFromGuideline(CompileGuidelinePlanRequest input) {
        String text = effectiveConfirmedText(input.guidelineText(), input.confirmedNarrative());
        if (text.isBlank()) throw badRequest("GUIDELINE_TEXT_BLANK", "请先确认文字方案内容");
        String scope = input.scopeType() == null || input.scopeType().isBlank()
                ? "HOSPITAL" : normalizeScope(input.scopeType());
        return compile(text, "GUIDELINE", scope, input.guidelineName(), input.versionYear(), null, null);
    }

    private String effectiveConfirmedText(String original, String confirmed) {
        String source = original == null ? "" : original.trim();
        String value = confirmed == null ? "" : confirmed.trim();
        if (value.isBlank()) return source;
        if (source.isBlank() || source.equals(value)) return value;
        return source + "\n医生确认后的文字方案：\n" + value;
    }

    private PlanTextDraft preview(String text, String mode, String scope, String guidelineName, String versionYear,
                                  String currentNarrative, String revisionInstruction,
                                  java.util.function.Consumer<String> onDelta) {
        ExecutionContext context = requireContext();
        ClinicalAssistantSettings runtime = runtimePolicy.current(context);
        if (runtime.mode() != ClinicalAssistantSettings.Mode.MODEL || !runtime.availableFor(context)) {
            throw new BusinessException("AI_PLAN_MODEL_UNAVAILABLE",
                    "方案编译需要在当前工作上下文启用并配置真实模型服务。", HttpStatus.SERVICE_UNAVAILABLE);
        }
        List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> visiblePlans = planDirectory.visibleForCurrentContext();
        List<ClinicalPlanRetrievalService.Match> retrievedPlans = planRetrieval.retrieve(visiblePlans,
                new ClinicalPlanRetrievalService.Query(text, scope),
                ClinicalPlanRetrievalService.MODEL_CANDIDATE_LIMIT);
        List<ClinicalAiModelGateway.PlanCandidate> availablePlans = retrievedPlans.stream()
                .map(match -> candidate(match.plan(), match.evidence())).toList();
        ClinicalAiModelGateway.PlanIntent rawIntent;
        try {
            var request = new ClinicalAiModelGateway.PlanInput(PROMPT_VERSION, mode, text, availablePlans,
                    currentNarrative, revisionInstruction);
            rawIntent = onDelta == null ? modelGateway.compilePlan(request, runtime)
                    : modelGateway.compilePlanStreaming(request, runtime, onDelta);
        } catch (RuntimeException exception) {
            ClinicalAiModelException modelError = exception instanceof ClinicalAiModelException value ? value : null;
            log.warn("Plan preview model call failed, correlationId={}, reason={}, providerStatus={}, exceptionType={}",
                    context.correlationId(), modelError == null ? ClinicalAiModelException.Reason.UNKNOWN : modelError.reason(),
                    modelError == null ? null : modelError.providerStatus(), exception.getClass().getSimpleName());
            throw new BusinessException("AI_PLAN_MODEL_UNAVAILABLE",
                    modelError == null ? "模型方案编译暂时不可用，请稍后重试。" : modelError.userMessage(),
                    HttpStatus.BAD_GATEWAY);
        }
        ClinicalAiModelGateway.PlanIntent intent = sanitizeIntent(rawIntent);
        if (intent == null || intent.items() == null || intent.items().isEmpty() || intent.items().size() > 30) {
            throw new BusinessException("AI_PLAN_NO_INTENT", "模型未提取到可确认的文字方案，请补充具体诊疗意图。",
                    HttpStatus.UNPROCESSABLE_ENTITY);
        }
        if (intent.referenceTemplateId() != null && visiblePlans.stream()
                .noneMatch(plan -> intent.referenceTemplateId().equals(plan.id()))) {
            throw new BusinessException("AI_PLAN_RESPONSE_INVALID", "模型引用了不可用的院内方案，请重试。",
                    HttpStatus.BAD_GATEWAY);
        }
        String name = "GUIDELINE".equals(mode) && guidelineName != null && !guidelineName.isBlank()
                ? guidelineName.trim() : clipped(intent.name(), 100);
        if (name == null || name.isBlank()) name = clipped(text, 100);
        String narrative = intent.narrative();
        if (narrative == null || narrative.isBlank()) {
            narrative = revisionContext(intent.items());
        }
        String guidelineReference = null;
        if ("GUIDELINE".equals(mode)) {
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("nameSuppliedByUser", guidelineName == null ? "" : guidelineName.trim());
            metadata.put("versionSuppliedByUser", versionYear == null ? "" : versionYear.trim());
            metadata.put("verificationStatus", "UNVERIFIED_USER_PASTED_TEXT");
            metadata.put("extractedAt", Instant.now().toString());
            guidelineReference = jsonCodec.write(metadata);
        }
        LocalDate today = LocalDate.now(ZONE);
        List<PlanReviewItem> reviewItems = intent.items().stream()
                .map(item -> reviewItem(item, context, today))
                .toList();
        return new PlanTextDraft(scope, name, clipped(narrative, 4000),
                "GUIDELINE".equals(mode) ? "AI_GUIDELINE" : "AI_INPUT", guidelineReference, reviewItems, noteTemplateContent(intent),
                com.rhn.outpatient.api.RecordAnnotation.anchored(intent.recordAnnotations(), noteTemplateContent(intent), false));
    }

    private String revisionContext(List<ClinicalAiModelGateway.PlanIntentItem> items) {
        return items.stream()
                .map(item -> switch (item.kind()) {
                    case "DIAGNOSIS" -> "诊断";
                    case "CONDITION" -> "适用条件";
                    case "MEDICATION" -> "用药";
                    case "LABORATORY" -> "检验";
                    case "EXAMINATION" -> "检查";
                    case "EDUCATION" -> "健康宣教";
                    case "FOLLOW_UP" -> "复诊与转诊";
                    default -> "其他";
                } + "：" + item.name()
                        + (item.details() == null || item.details().isBlank() ? "" : "；" + item.details()))
                .collect(java.util.stream.Collectors.joining("\n"));
    }

    private static final java.util.regex.Pattern BEDSIDE_PHYSICAL_EXAM_PATTERN = java.util.regex.Pattern.compile(
            ".*(?:触诊|听诊|叩诊|视诊|查体|体格检查|咽部检查|扁桃体检查|淋巴结检查).*");

    private boolean isBedsidePhysicalExam(ClinicalAiModelGateway.PlanIntentItem item) {
        if (item == null || item.name() == null) return false;
        if (!"LABORATORY".equals(item.kind()) && !"EXAMINATION".equals(item.kind())) {
            return false;
        }
        return BEDSIDE_PHYSICAL_EXAM_PATTERN.matcher(item.name()).matches();
    }

    private ClinicalAiModelGateway.PlanIntent sanitizeIntent(ClinicalAiModelGateway.PlanIntent intent) {
        if (intent == null || intent.items() == null) return intent;
        var sanitizedItems = intent.items().stream()
                .filter(item -> !isBedsidePhysicalExam(item))
                .toList();
        return new ClinicalAiModelGateway.PlanIntent(intent.name(), intent.description(), intent.narrative(),
                sanitizedItems, intent.referenceTemplateId(), intent.noteTemplateContent(), intent.recordAnnotations());
    }

    private static final java.util.regex.Pattern FABRICATED_VITALS_PREFIX = java.util.regex.Pattern.compile(
            "^(?:(?:[Tt体温]\\s*[:：]?\\s*\\d+(?:\\.\\d+)?\\s*[℃度]?|[Pp脉搏心率]\\s*[:：]?\\s*\\d+\\s*(?:次/分|bpm)?|[Rr呼吸]\\s*[:：]?\\s*\\d+\\s*(?:次/分)?|[Bb][Pp]血压\\s*[:：]?\\s*\\d+/\\d+\\s*(?:mmHg)?)[,，、；;\\s]*)+");

    private Map<String, String> noteTemplateContent(ClinicalAiModelGateway.PlanIntent intent) {
        Map<String, String> content = new LinkedHashMap<>();
        for (String key : List.of("chiefComplaint", "presentIllness", "medicalHistory", "physicalExam",
                "healthEducation", "followUp")) {
            String value = intent.noteTemplateContent().get(key);
            if (value != null && !value.isBlank()) {
                if ("physicalExam".equals(key)) {
                    value = FABRICATED_VITALS_PREFIX.matcher(value.stripLeading()).replaceFirst("").stripLeading();
                }
                content.put(key, clipped(value, "chiefComplaint".equals(key) ? 1000 : 4000));
            }
        }
        return content;
    }

    private PlanReviewItem reviewItem(ClinicalAiModelGateway.PlanIntentItem item, ExecutionContext context, LocalDate today) {
        if ("MEDICATION".equals(item.kind()) && context.organizationId() != null && context.departmentId() != null) {
            String specification = medicationMatcher.suggestPreparationSpecification(context.tenantId(),
                    context.organizationId(), context.departmentId(), item.name()).orElse(null);
            String details = MedicationSpecificationEvidence.addSuggestedSpecification(
                    item.name(), item.details(), specification);
            return new PlanReviewItem(item.kind(), item.name(), item.sourceQuote(), item.origin(), clipped(details, 500));
        }
        if (!"DIAGNOSIS".equals(item.kind())) {
            return new PlanReviewItem(item.kind(), item.name(), item.sourceQuote(), item.origin(), item.details());
        }
        var resolution = diagnosisNormalizer.normalize(context.tenantId(), null, null, item.name(), today);
        if (resolution.matched()) {
            var matched = resolution.concept();
            return new PlanReviewItem("DIAGNOSIS", matched.display() + " [" + matched.code() + "]",
                    item.sourceQuote(), item.origin(), item.details());
        }
        String details = item.details();
        details = (details == null || details.isBlank() ? "" : details + "；")
                + (resolution.status() == DiagnosisNormalizationService.Status.AMBIGUOUS
                ? "存在多个同名标准诊断，请通过对话补充编码或选择具体诊断"
                : "尚未匹配院内 ICD-10 术语或指定诊断域的标准术语，请通过对话补充或调整诊断");
        return new PlanReviewItem("CONDITION", item.name(), item.sourceQuote(), item.origin(), clipped(details, 500));
    }

    private SaveRequest compile(String text, String mode, String scope, String guidelineName, String versionYear,
                                String confirmedName, List<PlanReviewItem> reviewedItems) {
        ExecutionContext context = requireContext();
        List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> visiblePlans = planDirectory.visibleForCurrentContext();
        List<ClinicalPlanRetrievalService.Match> retrievedPlans = planRetrieval.retrieve(visiblePlans,
                new ClinicalPlanRetrievalService.Query(text, scope),
                ClinicalPlanRetrievalService.MODEL_CANDIDATE_LIMIT);
        List<ClinicalAiModelGateway.PlanCandidate> availablePlans = retrievedPlans.stream()
                .map(match -> candidate(match.plan(), match.evidence())).toList();
        ClinicalAiModelGateway.PlanIntent intent = resolveIntent(context, mode, text, confirmedName,
                reviewedItems, availablePlans);
        OutpatientPlanTemplateDirectory.PlanTemplateSnapshot reference = resolveReference(visiblePlans,
                availablePlans, intent);

        List<DiagnosisInput> diagnoses = new ArrayList<>();
        List<MedicationInput> medications = new ArrayList<>();
        List<ServiceInput> services = new ArrayList<>();
        List<PlanTaskInput> tasks = new ArrayList<>();
        Set<String> diagnosisCodes = new LinkedHashSet<>();
        Set<Long> medicationProductIds = new LinkedHashSet<>();
        Set<Long> medicationIds = new LinkedHashSet<>();
        Set<Long> serviceIds = new LinkedHashSet<>();
        LocalDate today = LocalDate.now(ZONE);
        boolean doctorConfirmedItems = reviewedItems != null;
        var validatedItems = intent.items().stream().map(item -> validateItem(item, text, doctorConfirmedItems)).toList();
        var investigationMatches = investigationDecisions.resolve(validatedItems.stream()
                .filter(value -> doctorConfirmedItems || value.explicit())
                .filter(value -> Set.of("LABORATORY", "EXAMINATION").contains(value.kind()))
                .map(value -> new PlanInvestigationDecisionService.Intent(value.kind(), value.name())).toList(), context, today);
        for (int index = 0; index < intent.items().size(); index++) {
            var item = intent.items().get(index);
            ValidatedItem value = validatedItems.get(index);
            String status = "NEEDS_REVIEW";
            String details = value.details();
            if (doctorConfirmedItems || value.explicit()) {
                ItemOutcome outcome = switch (value.kind()) {
                    case "DIAGNOSIS", "CONDITION" ->
                            matchDiagnoses(value, context, today, diagnoses, diagnosisCodes);
                    case "LABORATORY", "EXAMINATION" ->
                            matchInvestigations(value, investigationMatches.get(value.kind() + "|" + value.name()), services, serviceIds);
                    case "MEDICATION" -> matchMedications(value, item, context, medications,
                            medicationProductIds, medicationIds);
                    default -> new ItemOutcome(status, details);
                };
                status = outcome.status();
                details = outcome.details();
            }
            if (!value.explicit() && reference != null && occursInPlan(value, reference)) {
                details = appendDetails(details, "参考院内方案：“" + reference.name() + "”");
            }
            tasks.add(new PlanTaskInput(value.kind(), value.name(), value.sourceQuote(),
                    value.origin(), status, clipped(details, 500)));
        }

        return assembleResult(mode, scope, guidelineName, versionYear, text, intent,
                diagnoses, medications, services, tasks);
    }

    private ClinicalAiModelGateway.PlanIntent resolveIntent(ExecutionContext context, String mode, String text,
                                                            String confirmedName, List<PlanReviewItem> reviewedItems,
                                                            List<ClinicalAiModelGateway.PlanCandidate> availablePlans) {
        ClinicalAiModelGateway.PlanIntent rawIntent;
        if (reviewedItems != null) {
            if (reviewedItems.isEmpty()) {
                throw badRequest("AI_PLAN_REVIEW_ITEMS_EMPTY", "请至少保留一个诊疗项目后再匹配院内目录");
            }
            rawIntent = new ClinicalAiModelGateway.PlanIntent(clipped(confirmedName, 100),
                    "由医生审核确认的诊疗方案", reviewedItems.stream()
                    .map(item -> new ClinicalAiModelGateway.PlanIntentItem(item.kind(), item.text(),
                            item.sourceQuote(), item.origin(), item.details()))
                    .toList(), null);
        } else {
            ClinicalAssistantSettings runtime = runtimePolicy.current(context);
            if (runtime.mode() != ClinicalAssistantSettings.Mode.MODEL || !runtime.availableFor(context)) {
                throw new BusinessException("AI_PLAN_MODEL_UNAVAILABLE",
                        "方案编译需要在当前工作上下文启用并配置真实模型服务。", HttpStatus.SERVICE_UNAVAILABLE);
            }
            try {
                rawIntent = modelGateway.compilePlan(new ClinicalAiModelGateway.PlanInput(
                        PROMPT_VERSION, mode, text, availablePlans), runtime);
            } catch (RuntimeException exception) {
                ClinicalAiModelException modelError = exception instanceof ClinicalAiModelException value ? value : null;
                log.warn("Plan compilation model call failed, correlationId={}, reason={}, providerStatus={}, exceptionType={}",
                        context.correlationId(), modelError == null ? ClinicalAiModelException.Reason.UNKNOWN : modelError.reason(),
                        modelError == null ? null : modelError.providerStatus(), exception.getClass().getSimpleName());
                throw new BusinessException("AI_PLAN_MODEL_UNAVAILABLE",
                        modelError == null ? "模型方案编译暂时不可用，请稍后重试。" : modelError.userMessage(),
                        HttpStatus.BAD_GATEWAY);
            }
        }
        ClinicalAiModelGateway.PlanIntent intent = sanitizeIntent(rawIntent);
        if (intent == null || intent.items() == null || intent.items().isEmpty() || intent.items().size() > 30) {
            throw new BusinessException("AI_PLAN_NO_INTENT", "模型未提取到可核对的方案任务，请补充具体诊疗意图。",
                    HttpStatus.UNPROCESSABLE_ENTITY);
        }
        return intent;
    }

    private OutpatientPlanTemplateDirectory.PlanTemplateSnapshot resolveReference(
            List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> visiblePlans,
            List<ClinicalAiModelGateway.PlanCandidate> availablePlans,
            ClinicalAiModelGateway.PlanIntent intent) {
        OutpatientPlanTemplateDirectory.PlanTemplateSnapshot reference = null;
        if (intent.referenceTemplateId() != null) {
            reference = visiblePlans.stream().filter(plan -> intent.referenceTemplateId().equals(plan.id()))
                    .findFirst().orElse(null);
            if (reference == null || availablePlans.stream().noneMatch(plan -> plan.id().equals(intent.referenceTemplateId()))) {
                throw new BusinessException("AI_PLAN_RESPONSE_INVALID", "模型引用了不可用的院内方案，请重试。",
                    HttpStatus.BAD_GATEWAY);
            }
        }
        return reference;
    }

    private ItemOutcome matchDiagnoses(ValidatedItem value, ExecutionContext context, LocalDate today,
                                       List<DiagnosisInput> diagnoses, Set<String> diagnosisCodes) {
        String status = "NEEDS_REVIEW";
        String details = value.details();
        var resolution = diagnosisNormalizer.normalize(context.tenantId(), null, null,
                value.name(), today);
        if (resolution.matched()) {
            var matched = resolution.concept();
            if (diagnosisCodes.add(matched.code())) {
                diagnoses.add(new DiagnosisInput(resolution.codeSystem(), resolution.diagnosisDomain(),
                        matched.code(), matched.display(),
                        diagnoses.isEmpty() ? "PRIMARY" : "SECONDARY"));
            }
            status = "MATCHED";
        } else {
            status = resolution.status() == DiagnosisNormalizationService.Status.AMBIGUOUS
                    ? "NEEDS_REVIEW" : "UNMATCHED";
            details = appendDetails(details, resolution.status()
                    == DiagnosisNormalizationService.Status.AMBIGUOUS
                    ? "同名标准诊断不唯一，请明确诊断编码"
                    : "未匹配到指定诊断域中的标准诊断");
        }
        return new ItemOutcome(status, details);
    }

    private ItemOutcome matchInvestigations(ValidatedItem value, PlanInvestigationDecisionService.Resolution resolution,
                                            List<ServiceInput> services, Set<Long> serviceIds) {
        String details = value.details();
        if (resolution != null && !resolution.detail().isBlank()) details = appendDetails(details, resolution.detail());
        if (resolution != null && resolution.requiresReview()) return new ItemOutcome("NEEDS_REVIEW", details);
        if (resolution != null && !resolution.items().isEmpty()) {
            String evidence = Stream.of(value.name(), value.sourceQuote(), value.details())
                    .filter(s -> s != null && !s.isBlank()).distinct().collect(Collectors.joining("；"));
            // Wording such as "必要时" stays in the order note for the reviewing doctor; only amounts are read from it,
            // and advice fields (适用条件/目的/嘱托…) are not amounts.
            String directions = PlanInvestigationAmounts.withoutAdvice(evidence);
            if (resolution.groupMatch() && PlanInvestigationAmounts.hasAmount(directions)) {
                return new ItemOutcome("NEEDS_REVIEW", appendDetails(details,
                        "原文另有数量要求，不能直接替换或倍乘组套成员数量，请逐项核对"));
            }
            var pending = new ArrayList<ServiceInput>();
            var pendingIds = new LinkedHashSet<Long>();
            for (var matched : resolution.items()) {
                if (matched.id() == null || matched.id() <= 0 || matched.code() == null || matched.code().isBlank()
                        || matched.name() == null || matched.name().isBlank() || !value.kind().equals(matched.serviceType())
                        || matched.unitCode() == null || matched.unitCode().isBlank()) {
                    return new ItemOutcome("NEEDS_REVIEW", appendDetails(details, "目录项目身份、类型或数量单位不完整，请核实目录"));
                }
                if (resolution.groupMatch() && !matched.requiredMember()) {
                    return new ItemOutcome("NEEDS_REVIEW", appendDetails(details,
                            "组套包含可选成员“" + matched.name() + "”，请确认实际开立成员，未自动全选"));
                }
                if (!matched.unitCode().equals(matched.catalogUnitCode())) {
                    return new ItemOutcome("NEEDS_REVIEW", appendDetails(details,
                            "组套单位与目录单位不一致，未自动换算数量，请核实换算关系"));
                }
                if (!Boolean.TRUE.equals(matched.chargeable())) {
                    return new ItemOutcome("NEEDS_REVIEW", appendDetails(details,
                            "当前机构目录未确认支持计价，未自动生成计价或免计价医嘱，请核实"));
                }
                String memberDescription = matched.memberDescription();
                String clinicalDescription = memberDescription == null || memberDescription.isBlank()
                        ? evidence : evidence + "；组套成员说明：" + memberDescription;
                if (clinicalDescription.length() > 2000) {
                    return new ItemOutcome("NEEDS_REVIEW", appendDetails(details,
                            "原文与组套成员说明超过医嘱说明长度，未截断，请核对后整理"));
                }
                if (serviceIds.contains(matched.id()) || !pendingIds.add(matched.id())) {
                    return new ItemOutcome("NEEDS_REVIEW", appendDetails(details,
                            "同一项目已有方案明细或组套成员重复，未自动合并，请核对重复开立要求"));
                }
                boolean explicitAmount = PlanInvestigationAmounts.hasAmount(directions);
                var quantity = resolution.groupMatch() ? matched.quantity()
                        : explicitAmount ? PlanInvestigationAmounts.quantity(directions, matched.unitCode()) : BigDecimal.ONE;
                if (quantity == null || quantity.signum() <= 0) {
                    return new ItemOutcome("NEEDS_REVIEW", appendDetails(details,
                            "缺少明确有效的数量，或数量与目录单位不一致，请确认数量及单位后重新匹配"));
                }
                pending.add(new ServiceInput(matched.id(), matched.code(), matched.name(),
                        matched.serviceType(), quantity, matched.unitCode(), "SALE", true, value.name(), clinicalDescription));
            }
            services.addAll(pending);
            serviceIds.addAll(pendingIds);
            if (!resolution.groupMatch() && !PlanInvestigationAmounts.hasAmount(directions)) {
                details = appendDetails(details, "未指定数量，已按单次检验/检查默认 1 "
                        + resolution.items().getFirst().unitCode() + "，保存前可调整");
            }
            return new ItemOutcome("MATCHED", details);
        }
        if (resolution != null && resolution.exactCount() > 1) {
            return new ItemOutcome("NEEDS_REVIEW", appendDetails(details, "当前机构存在多个同名项目，请明确具体项目"));
        }
        return new ItemOutcome("UNMATCHED", appendDetails(details, "当前机构目录未找到可确认的检验检查项目"));
    }

    /**
     * A plan item is a draft the doctor reviews before it becomes a plan, so a medication is matched as soon as the
     * catalog drug can be identified. Whatever the text did not state (dose, route, frequency) stays empty, a quantity
     * that cannot be derived is provisionally 1, and every such gap is written to the item's details instead of
     * blocking the match.
     */
    private ItemOutcome matchMedications(ValidatedItem value, ClinicalAiModelGateway.PlanIntentItem item,
                                         ExecutionContext context, List<MedicationInput> medications,
                                         Set<Long> medicationProductIds, Set<Long> medicationIds) {
        String details = value.details();
        String extra = Stream.of(value.details(), value.sourceQuote(), item.details())
                .filter(s -> s != null && !s.isBlank()).distinct()
                .collect(Collectors.joining(" "));
        var intent = medicationParser.parse(value.name(), extra);
        if (intent.requiresReview()) {
            details = appendDetails(details, "用法含否定、范围、冲突或未解析内容，无法确认的剂量、疗程、数量已留空，请对照原文核对");
            intent = withoutReviewFlag(intent);
        }
        var directions = resolveMedicationDirections(intent, context);
        var parsed = directions.parsed();
        if (directions.note() != null) details = appendDetails(details, directions.note());
        var match = medicationMatcher.match(context.tenantId(), context.organizationId(),
                context.departmentId(), parsed);
        boolean inferredQuantity = false;
        if (parsed.quantity() == null && match.medication() != null) {
            var completed = inferMedicationQuantity(parsed, match.medication().strengthValue(),
                    match.medication().strengthUnit(), match.medication().preparationUnit(), match.itemPackage(), context);
            inferredQuantity = completed != parsed;
            parsed = completed;
            if (inferredQuantity && match.status() == MedicationCandidateMatchingService.Status.NEEDS_REVIEW) {
                match = medicationMatcher.match(context.tenantId(), context.organizationId(), context.departmentId(), parsed);
            }
        }
        boolean pharmacyProduct = match.medication() != null && match.product() != null && match.itemPackage() != null
                && (match.status() == MedicationCandidateMatchingService.Status.UNIQUE_MATCH
                || match.status() == MedicationCandidateMatchingService.Status.NEEDS_REVIEW);
        if (pharmacyProduct) {
            var medication = match.medication();
            var product = match.product();
            var itemPackage = match.itemPackage();
            // Missing dose/route/frequency/quantity is reported below from what is actually saved.
            if (match.status() == MedicationCandidateMatchingService.Status.NEEDS_REVIEW
                    && !match.evidence().startsWith("已唯一匹配目录，但缺少")) {
                details = appendDetails(details, match.evidence());
            }
            String specificationReview = MedicationSpecificationEvidence.reviewReason(parsed,
                    MedicationSpecificationEvidence.catalogSpecification(medication.preparationSpec(), medication.preparationUnit()));
            if (specificationReview != null) details = appendDetails(details, specificationReview + "；已按药品名称对齐，请核对规格");
            String unit = itemPackage.unitCode() == null || itemPackage.unitCode().isBlank()
                    ? medication.preparationUnit() : itemPackage.unitCode();
            if (unit == null || unit.isBlank()) {
                return new ItemOutcome("NEEDS_REVIEW", appendDetails(details, "目录包装缺少数量单位，请核实目录"));
            }
            if (medicationProductIds.contains(product.id()) || medicationIds.contains(medication.id())) {
                return new ItemOutcome("NEEDS_REVIEW", appendDetails(details, "同一药品已有方案明细，未自动合并，请核对重复用药要求"));
            }
            boolean quantityDerived = parsed.quantity() != null && parsed.quantity().signum() > 0;
            BigDecimal quantity = quantityDerived ? parsed.quantity() : BigDecimal.ONE;
            medicationProductIds.add(product.id());
            medicationIds.add(medication.id());
            medications.add(medicationInput(medication.id(), product.id(), itemPackage.id(), medication.name(),
                    medication.preparationSpec(), parsed, quantity, unit, value, "SALE", true));
            if (inferredQuantity && quantityDerived) details = appendDetails(details, inferredQuantityDetail(parsed));
            return new ItemOutcome("MATCHED", appendDetails(details, medicationGaps(parsed, quantityDerived, quantity, unit)));
        }
        var generic = matchGenericMedication(parsed, value.name());
        if (generic == null) {
            String unresolvedStatus = match.status() == MedicationCandidateMatchingService.Status.UNAVAILABLE
                    ? "UNMATCHED" : "NEEDS_REVIEW";
            return new ItemOutcome(unresolvedStatus, appendDetails(details,
                    match.evidence() + "；通用药品目录未找到可确认的同名启用药品，请人工选择"));
        }
        var medication = generic.knowledge().medication();
        if (generic.note() != null) details = appendDetails(details, generic.note());
        String specificationReview = MedicationSpecificationEvidence.reviewReason(parsed,
                MedicationSpecificationEvidence.catalogSpecification(medication.preparationSpec(), medication.preparationUnit()));
        if (specificationReview != null) details = appendDetails(details, specificationReview + "；已按药品名称对齐，请核对规格");
        if (medication.preparationUnit() == null || medication.preparationUnit().isBlank()) {
            return new ItemOutcome("NEEDS_REVIEW", appendDetails(details, "通用药品目录缺少制剂单位，请选择明确的产品包装"));
        }
        if (parsed.quantity() == null) {
            var completed = inferMedicationQuantity(parsed, medication.strengthValue(), medication.strengthUnit(),
                    medication.preparationUnit(), null, context);
            inferredQuantity = completed != parsed;
            parsed = completed;
        }
        boolean quantityDerived = parsed.quantity() != null && parsed.quantity().signum() > 0
                && medication.preparationUnit().equalsIgnoreCase(parsed.quantityUnit());
        BigDecimal quantity = quantityDerived ? parsed.quantity() : BigDecimal.ONE;
        if (!medicationIds.add(medication.id())) {
            return new ItemOutcome("NEEDS_REVIEW", appendDetails(details, "同一药品已有方案明细，未自动合并，请核对重复用药要求"));
        }
        medications.add(medicationInput(medication.id(), null, null, medication.name(), medication.preparationSpec(),
                parsed, quantity, medication.preparationUnit(), value, "SALE", null));
        details = appendDetails(details, "已对齐通用药品主档（开立时再选择药房产品并确认计价）");
        if (inferredQuantity && quantityDerived) details = appendDetails(details, inferredQuantityDetail(parsed));
        return new ItemOutcome("MATCHED", appendDetails(details, medicationGaps(parsed, quantityDerived, quantity, medication.preparationUnit())));
    }

    private MedicationInput medicationInput(Long medicationId, Long productId, Long packageId, String name, String specification,
                                            MedicationIntentParser.ParsedMedication parsed, BigDecimal quantity, String quantityUnit,
                                            ValidatedItem value, String priceType, Boolean pricingRequired) {
        boolean dose = parsed.doseValue() != null && parsed.doseValue().signum() > 0 && parsed.doseUnit() != null;
        boolean duration = parsed.durationValue() != null && parsed.durationValue().signum() > 0
                && parsed.durationUnit() != null && !parsed.durationUnit().isBlank();
        return new MedicationInput(medicationId, productId, packageId, name, specification,
                dose ? parsed.doseValue() : null, dose ? parsed.doseUnit() : null, parsed.routeCode(), parsed.frequencyCode(),
                duration ? parsed.durationValue() : null, duration ? parsed.durationUnit() : null,
                quantity, quantityUnit, true, false, AiPlanOrderInstructions.medication(value.details()), priceType,
                pricingRequired, value.name());
    }

    /** Tells the doctor what the plan item still lacks; nothing is guessed to fill it. */
    private String medicationGaps(MedicationIntentParser.ParsedMedication parsed, boolean quantityDerived,
                                  BigDecimal quantity, String unit) {
        List<String> missing = new ArrayList<>();
        if (parsed.doseValue() == null || parsed.doseValue().signum() <= 0 || parsed.doseUnit() == null) missing.add("剂量");
        if (parsed.routeCode() == null) missing.add("途径");
        if (parsed.frequencyCode() == null) missing.add("频次");
        if (parsed.durationValue() == null || parsed.durationValue().signum() <= 0) missing.add("疗程");
        List<String> notes = new ArrayList<>();
        if (!missing.isEmpty()) notes.add("原文未明确或目录无法对应：" + String.join("、", missing) + "，已留空，请补充");
        if (!quantityDerived) notes.add("总量无法推算，暂按 " + quantity.stripTrailingZeros().toPlainString() + " " + unit + " 填写，请调整");
        return notes.isEmpty() ? null : String.join("；", notes);
    }

    private MedicationIntentParser.ParsedMedication withoutReviewFlag(MedicationIntentParser.ParsedMedication parsed) {
        boolean dose = parsed.doseValue() != null && parsed.doseValue().signum() > 0;
        boolean duration = parsed.durationValue() != null && parsed.durationValue().signum() > 0;
        boolean quantity = parsed.quantity() != null && parsed.quantity().signum() > 0;
        return new MedicationIntentParser.ParsedMedication(parsed.medicationName(), parsed.productHint(),
                parsed.ingredientMentions(), dose ? parsed.doseValue() : null, dose ? parsed.doseUnit() : null,
                parsed.routeCode(), parsed.frequencyCode(), duration ? parsed.durationValue() : null,
                duration ? parsed.durationUnit() : null, quantity ? parsed.quantity() : null,
                quantity ? parsed.quantityUnit() : null, parsed.sourceText(), false);
    }

    private SaveRequest assembleResult(String mode, String scope, String guidelineName, String versionYear,
                                       String text, ClinicalAiModelGateway.PlanIntent intent,
                                       List<DiagnosisInput> diagnoses, List<MedicationInput> medications,
                                       List<ServiceInput> services, List<PlanTaskInput> tasks) {
        String name = "GUIDELINE".equals(mode) && guidelineName != null && !guidelineName.isBlank()
                ? guidelineName.trim() : clipped(intent.name(), 100);
        if (name == null || name.isBlank()) name = clipped(text, 100);
        String description = clipped(intent.description(), 500);
        String guidelineReference = null;
        if ("GUIDELINE".equals(mode)) {
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("nameSuppliedByUser", guidelineName == null ? "" : guidelineName.trim());
            metadata.put("versionSuppliedByUser", versionYear == null ? "" : versionYear.trim());
            metadata.put("verificationStatus", "UNVERIFIED_USER_PASTED_TEXT");
            metadata.put("extractedAt", Instant.now().toString());
            guidelineReference = jsonCodec.write(metadata);
        }
        return new SaveRequest(scope, name, description, 0,
                "GUIDELINE".equals(mode) ? "AI_GUIDELINE" : "AI_INPUT", guidelineReference,
                diagnoses, medications, services, tasks);
    }

    private record ItemOutcome(String status, String details) {}

    private String appendDetails(String details, String addition) {
        if (details == null || details.isBlank()) return addition;
        return details + "；" + addition;
    }

    private ValidatedItem validateItem(ClinicalAiModelGateway.PlanIntentItem item, String text,
                                       boolean doctorConfirmedItem) {
        if (item == null || item.name() == null || item.name().isBlank() || item.name().length() > 300
                || item.kind() == null || !KINDS.contains(item.kind())
                || item.origin() == null || !Set.of("EXPLICIT", "SUGGESTED").contains(item.origin())) {
            throw new BusinessException("AI_PLAN_RESPONSE_INVALID", "模型返回的方案任务结构无效，请重试。",
                    HttpStatus.BAD_GATEWAY);
        }
        String quote = clipped(item.sourceQuote(), 500);
        boolean explicit = "EXPLICIT".equals(item.origin());
        String origin = item.origin();
        boolean invalidEvidence = explicit && (quote == null || quote.isBlank() || !text.contains(quote)
                || (!"DIAGNOSIS".equals(item.kind()) && !quote.contains(item.name().trim())));
        String details = clipped(item.details(), 500);
        if (invalidEvidence) {
            if (!doctorConfirmedItem) {
                throw new BusinessException("AI_PLAN_RESPONSE_INVALID", "模型未能提供可核对的原文依据，请重试。",
                        HttpStatus.BAD_GATEWAY);
            }
            explicit = false;
            origin = "SUGGESTED";
            quote = null;
            details = appendDetails(details, "原文依据未能逐字核对，按医生确认候选处理");
        }
        if (explicit && details != null && !text.contains(details)) details = null;
        return new ValidatedItem(item.kind(), item.name().trim(), explicit ? quote : null,
                origin, clipped(details, 500), explicit);
    }

    private record ValidatedItem(String kind, String name, String sourceQuote, String origin,
                                 String details, boolean explicit) {}

    private ClinicalAiModelGateway.PlanCandidate candidate(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan,
                                                            List<String> retrievalEvidence) {
        return new ClinicalAiModelGateway.PlanCandidate(plan.id(), plan.name(), clipped(plan.description(), 180),
                plan.diagnoses().stream().limit(8).map(OutpatientPlanTemplateDirectory.DiagnosisSnapshot::display).toList(),
                plan.medications().stream().limit(8).map(OutpatientPlanTemplateDirectory.MedicationSnapshot::medicationName).toList(),
                plan.services().stream().limit(8).map(OutpatientPlanTemplateDirectory.ServiceSnapshot::itemName).toList(),
                plan.tasks().stream().limit(8).map(com.rhn.outpatient.api.OutpatientPlanTemplateContracts.PlanTaskInput::text).toList(),
                retrievalEvidence);
    }

    private boolean occursInPlan(ValidatedItem item, OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan) {
        return switch (item.kind()) {
            case "DIAGNOSIS" -> plan.diagnoses().stream().anyMatch(value -> item.name().equals(value.display()));
            case "MEDICATION" -> plan.medications().stream().anyMatch(value -> item.name().equals(value.medicationName()));
            case "LABORATORY", "EXAMINATION" -> plan.services().stream().anyMatch(value -> item.name().equals(value.itemName()));
            default -> plan.tasks().stream().anyMatch(value -> item.kind().equals(value.kind())
                    && item.name().equals(value.text()));
        };
    }

    /** Historical mining is unavailable until a real usage aggregation exists; never fabricate counts. */
    public List<MinedPlanSuggestionView> minePersonalSuggestions() {
        requireContext();
        return List.of();
    }

    private String normalizeScope(String scope) {
        if (scope == null) return "PERSONAL";
        String upper = scope.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("PERSONAL", "DEPARTMENT", "HOSPITAL").contains(upper)) {
            throw badRequest("AI_PLAN_SCOPE_INVALID", "方案范围无效");
        }
        return upper;
    }

    private static String clipped(String value, int max) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.length() <= max ? clean : clean.substring(0, max);
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.organizationId() == null || context.departmentId() == null) {
            throw forbidden("AI_PLAN_WORK_CONTEXT_REQUIRED", "请先选择包含机构与科室的工作上下文");
        }
        return context;
    }

    private record GenericMedication(MedicationKnowledgeDirectory.Knowledge knowledge, String note) {}

    /**
     * Finds the catalog drug by name. Dosage-form spelling ("口服溶液" / "口服溶液剂") is treated as the same name; when
     * several strengths remain the first is proposed and the others are listed for the doctor.
     */
    private GenericMedication matchGenericMedication(
            MedicationIntentParser.ParsedMedication parsed, String rawName) {
        String query = parsed != null && parsed.medicationName() != null && !parsed.medicationName().isBlank()
                ? parsed.medicationName().trim()
                : (rawName != null ? rawName.trim() : "");
        if (query.isBlank()) return null;
        List<MedicationKnowledgeDirectory.Knowledge> found = medicationKnowledgeDirectory.search(query);
        if (found.isEmpty() && rawName != null && !rawName.trim().equalsIgnoreCase(query)) {
            found = medicationKnowledgeDirectory.search(rawName.trim());
        }
        if (found.isEmpty()) return null;
        String normQuery = normalizeMedName(query);
        var active = found.stream().filter(k -> "ACTIVE".equals(k.medication().status())).toList();
        var exact = active.stream().filter(k -> {
            var m = k.medication();
            return normQuery.equals(normalizeMedName(m.name()))
                    || normQuery.equals(normalizeMedName(m.code()))
                    || (m.aliasName() != null && java.util.Arrays.stream(m.aliasName().split("[,，;；]"))
                            .anyMatch(alias -> normQuery.equals(normalizeMedName(alias))))
                    || matchesCompoundMedicationName(query, m.name());
        }).toList();
        if (exact.isEmpty()) {
            String queryKey = formKey(normQuery);
            exact = active.stream().filter(k -> {
                String catalogKey = formKey(normalizeMedName(k.medication().name()));
                return catalogKey.equals(queryKey)
                        || (catalogKey.startsWith(queryKey) && catalogKey.substring(queryKey.length()).matches("[0-9a-z]*"));
            }).toList();
        }
        if (exact.isEmpty()) return null;
        var compatible = exact.stream().filter(k -> MedicationSpecificationEvidence.reviewReason(parsed,
                MedicationSpecificationEvidence.catalogSpecification(k.medication().preparationSpec(),
                        k.medication().preparationUnit())) == null).toList();
        if (!compatible.isEmpty()) exact = compatible;
        if (exact.size() == 1) return new GenericMedication(exact.getFirst(), null);
        var ordered = exact.stream().sorted(java.util.Comparator
                .comparing((MedicationKnowledgeDirectory.Knowledge k) -> String.valueOf(k.medication().name()))
                .thenComparing(k -> String.valueOf(k.medication().preparationSpec()))).toList();
        String others = ordered.stream().skip(1).limit(6).map(k -> k.medication().name()
                + (k.medication().preparationSpec() == null ? "" : " " + k.medication().preparationSpec()))
                .collect(Collectors.joining("、"));
        var first = ordered.getFirst().medication();
        return new GenericMedication(ordered.getFirst(), "通用药品目录有 " + ordered.size() + " 个同名候选，暂选“" + first.name()
                + (first.preparationSpec() == null ? "" : " " + first.preparationSpec()) + "”，其他：" + others + "，请核对规格");
    }

    private String formKey(String normalizedName) {
        return normalizedName.replaceFirst("剂(?=[0-9a-z]*$)", "");
    }

    private MedicationIntentParser.ParsedMedication inferMedicationQuantity(
            MedicationIntentParser.ParsedMedication parsed, BigDecimal strengthValue, String strengthUnit,
            String preparationUnit, com.rhn.platform.masterdata.api.MasterDataViews.PackageView itemPackage,
            ExecutionContext context) {
        if (parsed.quantity() != null || parsed.doseValue() == null || parsed.doseValue().signum() <= 0
                || strengthValue == null || strengthValue.signum() <= 0 || strengthUnit == null
                || preparationUnit == null || preparationUnit.isBlank()) return parsed;
        var doseInStrengthUnit = ClinicalDoseUnits.convert(parsed.doseValue(), parsed.doseUnit(), strengthUnit);
        if (doseInStrengthUnit.isEmpty()) return parsed;
        BigDecimal durationDays = durationDays(parsed.durationValue(), parsed.durationUnit());
        if (durationDays == null) return parsed;
        BigDecimal occurrences = treatmentOccurrences(parsed, durationDays, context);
        if (occurrences == null || occurrences.signum() <= 0) return parsed;
        BigDecimal presentations = doseInStrengthUnit.get().divide(strengthValue, MathContext.DECIMAL128)
                .multiply(occurrences).stripTrailingZeros();
        if (presentations.signum() <= 0) return parsed;

        BigDecimal quantity = presentations;
        String quantityUnit = preparationUnit;
        if (itemPackage != null) {
            if (itemPackage.unitCode() == null || itemPackage.unitCode().isBlank()
                    || itemPackage.quantityFactor() == null || itemPackage.quantityFactor().signum() <= 0) return parsed;
            quantity = presentations.divide(itemPackage.quantityFactor(), 0, RoundingMode.CEILING);
            quantityUnit = itemPackage.unitCode();
        }
        return new MedicationIntentParser.ParsedMedication(parsed.medicationName(), parsed.productHint(),
                parsed.ingredientMentions(), parsed.doseValue(), parsed.doseUnit(), parsed.routeCode(),
                parsed.frequencyCode(), parsed.durationValue(), parsed.durationUnit(), quantity, quantityUnit,
                parsed.sourceText(), parsed.requiresReview());
    }

    private BigDecimal treatmentOccurrences(MedicationIntentParser.ParsedMedication parsed, BigDecimal durationDays,
                                             ExecutionContext context) {
        // Without a stated frequency the number of doses cannot be derived; leave the quantity for review.
        if (parsed.frequencyCode() == null || parsed.frequencyCode().isBlank()) return null;
        var active = frequencies.active(context.tenantId(), context.organizationId(), context.departmentId(),
                "OUTPATIENT", "MEDICATION", LocalDate.now(ZONE)).stream()
                .filter(value -> sameToken(parsed.frequencyCode(), value.code())).toList();
        if (active.size() != 1) return null;
        var semantics = ClinicalFrequencySemantics.interpret(active.getFirst());
        if (semantics.dailyRateComputable()) {
            return durationDays.multiply(semantics.doses())
                    .divide(semantics.perDays(), MathContext.DECIMAL128).stripTrailingZeros();
        }
        var maximum = DAILY_MAXIMUM.matcher(parsed.sourceText() == null ? "" : parsed.sourceText());
        if (!maximum.find()) return null;
        return durationDays.multiply(new BigDecimal(maximum.group(1))).stripTrailingZeros();
    }

    private BigDecimal durationDays(BigDecimal value, String unit) {
        if (value == null || value.signum() <= 0 || unit == null) return null;
        return switch (unit.trim().toLowerCase(Locale.ROOT)) {
            case "d", "day", "天", "日" -> value;
            case "w", "wk", "week", "周" -> value.multiply(BigDecimal.valueOf(7));
            default -> null;
        };
    }

    private String inferredQuantityDetail(MedicationIntentParser.ParsedMedication parsed) {
        return "已根据单次剂量、频次/每日上限、疗程及目录规格自动推导总量 "
                + parsed.quantity().stripTrailingZeros().toPlainString() + " " + parsed.quantityUnit() + "，保存前可调整";
    }

    private boolean matchesCompoundMedicationName(String requested, String catalogName) {
        if (requested == null || catalogName == null) return false;
        var matcher = Pattern.compile("^(.*?)[（(](.*?)[）)]$").matcher(catalogName.trim());
        if (!matcher.matches()) return false;
        String request = normalizeMedName(requested), base = normalizeMedName(matcher.group(1));
        if (!request.startsWith(base)) return false;
        String suffix = request.substring(base.length()).replaceFirst("剂$", "");
        return java.util.Arrays.stream(matcher.group(2).split("[,，、/\\s]+"))
                .map(this::normalizeMedName).map(value -> value.replaceFirst("剂$", ""))
                .anyMatch(suffix::equals);
    }

    private record ResolvedDirections(MedicationIntentParser.ParsedMedication parsed, String note) {}

    /** The dictionary has no "每晚一次"; it is aligned to the daily-once entry and the doctor is told to check the timing. */
    private static final String EVENING_ONCE = "每晚一次";
    private static final String DAILY_ONCE = "每日一次";

    private ResolvedDirections resolveMedicationDirections(MedicationIntentParser.ParsedMedication parsed,
                                                           ExecutionContext context) {
        if (parsed.requiresReview()) return new ResolvedDirections(parsed, null);
        LocalDate today = LocalDate.now(ZONE);
        String route = parsed.routeCode() == null ? null : routes.resolveActive(context.tenantId(), parsed.routeCode(), "OUTPATIENT", today)
                .map(MedicationRouteDirectory.RouteSnapshot::code).orElse(null);
        String frequency = null;
        String note = null;
        if (parsed.frequencyCode() != null) {
            var active = frequencies.active(context.tenantId(), context.organizationId(), context.departmentId(), "OUTPATIENT", "MEDICATION", today);
            var matches = active.stream().filter(value -> sameToken(parsed.frequencyCode(), value.code())
                    || sameToken(parsed.frequencyCode(), value.name()) || sameToken(parsed.frequencyCode(), value.shortName())).toList();
            if (matches.isEmpty() && EVENING_ONCE.equals(parsed.frequencyCode())) {
                matches = active.stream().filter(value -> sameToken(DAILY_ONCE, value.name())).toList();
                if (matches.size() == 1) note = "频次字典没有“每晚一次”，已按“每日一次”对齐，请核对服药时间";
            }
            if (matches.size() == 1) frequency = matches.getFirst().code();
        }
        return new ResolvedDirections(new MedicationIntentParser.ParsedMedication(parsed.medicationName(), parsed.productHint(), parsed.ingredientMentions(),
                parsed.doseValue(), parsed.doseUnit(), route, frequency, parsed.durationValue(), parsed.durationUnit(),
                parsed.quantity(), parsed.quantityUnit(), parsed.sourceText(), false), frequency == null ? null : note);
    }

    private boolean sameToken(String candidate, String actual) {
        return candidate != null && actual != null && candidate.trim().equalsIgnoreCase(actual.trim());
    }

    private String normalizeMedName(String value) {
        if (value == null) return "";
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[\\p{P}\\p{Z}\\s]+", "");
    }
}
