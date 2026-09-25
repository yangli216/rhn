package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.CompileGuidelinePlanRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.CompilePlanDraftRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.MinedPlanSuggestionView;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanTextDraft;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanReviewItem;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.DiagnosisInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.MedicationInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.PlanTaskInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.SaveRequest;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.platform.terminology.api.TerminologyConceptSnapshot;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;

/** Converts model-extracted intent into reviewable plan tasks and verified catalog entries. */
@Service
public class ClinicalPlanTemplateAiApplicationService {
    private static final Logger log = LoggerFactory.getLogger(ClinicalPlanTemplateAiApplicationService.class);
    private static final String PROMPT_VERSION = "RHN-PLAN-COMPILER-V2";
    private static final String ICD10_SYSTEM = "WHO.BD.CS.ICD10";
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> KINDS = Set.of("DIAGNOSIS", "MEDICATION", "LABORATORY",
            "EXAMINATION", "EDUCATION", "FOLLOW_UP", "CONDITION");

    private final OutpatientPrescriptionInventoryDirectory inventory;
    private final ServiceCatalogDirectory serviceCatalog;
    private final TerminologyDirectory terminologyDirectory;
    private final OutpatientPlanTemplateDirectory planDirectory;
    private final ExecutionContextProvider contextProvider;
    private final ClinicalAiRuntimePolicy runtimePolicy;
    private final ClinicalAiModelGateway modelGateway;
    private final JsonCodec jsonCodec;

    public ClinicalPlanTemplateAiApplicationService(OutpatientPrescriptionInventoryDirectory inventory,
                                                     ServiceCatalogDirectory serviceCatalog,
                                                     TerminologyDirectory terminologyDirectory,
                                                     OutpatientPlanTemplateDirectory planDirectory,
                                                     ExecutionContextProvider contextProvider,
                                                     ClinicalAiRuntimePolicy runtimePolicy,
                                                     ClinicalAiModelGateway modelGateway,
                                                     JsonCodec jsonCodec) {
        this.inventory = inventory;
        this.serviceCatalog = serviceCatalog;
        this.terminologyDirectory = terminologyDirectory;
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
        List<ClinicalAiModelGateway.PlanCandidate> availablePlans = visiblePlans.stream()
                .sorted((left, right) -> Long.compare(right.useCount(), left.useCount()))
                .limit(30).map(this::candidate).toList();
        ClinicalAiModelGateway.PlanIntent intent;
        try {
            var request = new ClinicalAiModelGateway.PlanInput(PROMPT_VERSION, mode, text, availablePlans,
                    currentNarrative, revisionInstruction);
            intent = onDelta == null ? modelGateway.compilePlan(request, runtime)
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
            throw new BusinessException("AI_PLAN_NARRATIVE_MISSING",
                    "模型未生成完整的门诊文字方案，请重新生成或补充更具体的诊疗意图。",
                    HttpStatus.BAD_GATEWAY);
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
                .map(item -> reviewItem(item, context.tenantId(), today))
                .toList();
        return new PlanTextDraft(scope, name, clipped(narrative, 4000),
                "GUIDELINE".equals(mode) ? "AI_GUIDELINE" : "AI_INPUT", guidelineReference, reviewItems);
    }

    private PlanReviewItem reviewItem(ClinicalAiModelGateway.PlanIntentItem item, long tenantId, LocalDate today) {
        if (!"DIAGNOSIS".equals(item.kind())) {
            return new PlanReviewItem(item.kind(), item.name(), item.sourceQuote(), item.origin(), item.details());
        }
        var concept = findIcd10Concept(tenantId, item.name(), today);
        if (concept.isPresent()) {
            var matched = concept.get();
            return new PlanReviewItem("DIAGNOSIS", matched.display() + " [" + matched.code() + "]",
                    item.sourceQuote(), item.origin(), item.details());
        }
        String details = item.details();
        details = (details == null || details.isBlank() ? "" : details + "；")
                + "尚未匹配院内 ICD-10 术语，请通过对话补充或调整诊断";
        return new PlanReviewItem("CONDITION", item.name(), item.sourceQuote(), item.origin(), clipped(details, 500));
    }

    private SaveRequest compile(String text, String mode, String scope, String guidelineName, String versionYear,
                                String confirmedName, List<PlanReviewItem> reviewedItems) {
        ExecutionContext context = requireContext();
        ClinicalAiModelGateway.PlanIntent intent;
        List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> visiblePlans = planDirectory.visibleForCurrentContext();
        List<ClinicalAiModelGateway.PlanCandidate> availablePlans = visiblePlans.stream()
                .sorted((left, right) -> Long.compare(right.useCount(), left.useCount()))
                .limit(30).map(this::candidate).toList();
        if (reviewedItems != null) {
            if (reviewedItems.isEmpty()) {
                throw badRequest("AI_PLAN_REVIEW_ITEMS_EMPTY", "请至少保留一个诊疗项目后再匹配院内目录");
            }
            intent = new ClinicalAiModelGateway.PlanIntent(clipped(confirmedName, 100),
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
                intent = modelGateway.compilePlan(new ClinicalAiModelGateway.PlanInput(
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
        if (intent == null || intent.items() == null || intent.items().isEmpty() || intent.items().size() > 30) {
            throw new BusinessException("AI_PLAN_NO_INTENT", "模型未提取到可核对的方案任务，请补充具体诊疗意图。",
                    HttpStatus.UNPROCESSABLE_ENTITY);
        }
        OutpatientPlanTemplateDirectory.PlanTemplateSnapshot reference = null;
        if (intent.referenceTemplateId() != null) {
            reference = visiblePlans.stream().filter(plan -> intent.referenceTemplateId().equals(plan.id()))
                    .findFirst().orElse(null);
            if (reference == null || availablePlans.stream().noneMatch(plan -> plan.id().equals(intent.referenceTemplateId()))) {
                throw new BusinessException("AI_PLAN_RESPONSE_INVALID", "模型引用了不可用的院内方案，请重试。",
                        HttpStatus.BAD_GATEWAY);
            }
        }

        List<DiagnosisInput> diagnoses = new ArrayList<>();
        List<MedicationInput> medications = new ArrayList<>();
        List<ServiceInput> services = new ArrayList<>();
        List<PlanTaskInput> tasks = new ArrayList<>();
        Set<String> diagnosisCodes = new LinkedHashSet<>();
        Set<Long> medicationProductIds = new LinkedHashSet<>();
        Set<Long> serviceIds = new LinkedHashSet<>();
        LocalDate today = LocalDate.now(ZONE);
        boolean doctorConfirmedItems = reviewedItems != null;
        for (var item : intent.items()) {
            ValidatedItem value = validateItem(item, text, doctorConfirmedItems);
            String status = "NEEDS_REVIEW";
            String details = value.details();
            if (doctorConfirmedItems || value.explicit()) {
                switch (value.kind()) {
                    case "DIAGNOSIS" -> {
                        var concept = findIcd10Concept(context.tenantId(), value.name(), today);
                        if (concept.isPresent()) {
                            var matched = concept.get();
                            if (diagnosisCodes.add(matched.code())) {
                                diagnoses.add(new DiagnosisInput(matched.code(), matched.display(),
                                        diagnoses.isEmpty() ? "PRIMARY" : "SECONDARY"));
                            }
                            status = "MATCHED";
                        } else {
                            status = "UNMATCHED";
                            details = appendDetails(details, "未匹配到唯一的 ICD-10 标准诊断");
                        }
                    }
                    case "LABORATORY", "EXAMINATION" -> {
                        String type = value.kind();
                        var matches = serviceCatalog.searchOrderableServices(value.name(), type,
                                context.organizationId(), today).stream()
                                .filter(candidate -> exactServiceMatch(value.name(), candidate))
                                .toList();
                        if (matches.size() == 1) {
                            var matched = matches.getFirst();
                            if (serviceIds.add(matched.id())) {
                                services.add(new ServiceInput(matched.id(), matched.code(), matched.name(),
                                        matched.sdServiceType(), BigDecimal.ONE,
                                        matched.unitCode(), "SALE", true, value.name(), value.details()));
                            }
                            status = "MATCHED";
                        } else if (matches.isEmpty()) {
                            status = "UNMATCHED";
                            details = appendDetails(details, "当前机构目录未找到同名检验检查项目");
                        } else {
                            status = "NEEDS_REVIEW";
                            details = appendDetails(details, "当前机构存在多个同名项目，请通过对话明确具体项目");
                        }
                    }
                    case "MEDICATION" -> {
                        var matches = inventory.findOrderableMedications(context.tenantId(),
                                context.organizationId(), context.departmentId(), value.name()).stream()
                                .filter(candidate -> "ACTIVE".equals(candidate.sdStatus())
                                        && (value.name().equalsIgnoreCase(candidate.name())
                                        || value.name().equalsIgnoreCase(candidate.code())))
                                .toList();
                        if (matches.size() == 1 && matches.getFirst().products() != null
                                && matches.getFirst().products().size() == 1) {
                            var matched = matches.getFirst();
                            var product = matched.products().getFirst();
                            var availability = inventory.inspectMedicationAvailability(context.tenantId(),
                                    context.organizationId(), context.departmentId(), product.id(), null);
                            if (availability != null && availability.routeConfigured()
                                    && availability.stockItemConfigured()) {
                                if (medicationProductIds.add(product.id())) {
                                    medications.add(new MedicationInput(
                                            matched.id(), product.id(), availability.effectivePackageId(),
                                            matched.name(), matched.preparationSpec(),
                                            matched.defaultDose(), matched.defaultDoseUnit(), matched.defaultRoute(),
                                            matched.defaultFrequency(), null, null, BigDecimal.ONE,
                                            availability.packageUnitCode() == null
                                                    ? matched.preparationUnit() : availability.packageUnitCode(),
                                            false, false, null, "SALE", true, value.details()));
                                }
                                status = "MATCHED";
                            } else {
                                status = "UNMATCHED";
                                details = appendDetails(details, "当前科室未配置可发药的库存品规");
                            }
                        } else if (matches.isEmpty()) {
                            status = "UNMATCHED";
                            details = appendDetails(details, "当前科室库存未找到同名通用药品");
                        } else {
                            status = "NEEDS_REVIEW";
                            details = appendDetails(details, "当前科室存在多个同名在库品规，请通过对话明确具体药品");
                        }
                    }
                    default -> { }
                }
            }
            if (!value.explicit() && reference != null && occursInPlan(value, reference)) {
                details = appendDetails(details, "参考院内方案：“" + reference.name() + "”");
            }
            tasks.add(new PlanTaskInput(value.kind(), value.name(), value.sourceQuote(),
                    value.origin(), status, clipped(details, 500)));
        }

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

    private boolean exactServiceMatch(String query, com.rhn.platform.masterdata.api.MasterDataViews.ServiceView candidate) {
        if (query.equalsIgnoreCase(candidate.name()) || query.equalsIgnoreCase(candidate.code())) return true;
        var adoption = candidate.organizationAdoption();
        return adoption != null && (query.equalsIgnoreCase(adoption.localName())
                || query.equalsIgnoreCase(adoption.localCode()));
    }

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

    private ClinicalAiModelGateway.PlanCandidate candidate(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan) {
        return new ClinicalAiModelGateway.PlanCandidate(plan.id(), plan.name(), clipped(plan.description(), 180),
                plan.diagnoses().stream().limit(8).map(OutpatientPlanTemplateDirectory.DiagnosisSnapshot::display).toList(),
                plan.medications().stream().limit(8).map(OutpatientPlanTemplateDirectory.MedicationSnapshot::medicationName).toList(),
                plan.services().stream().limit(8).map(OutpatientPlanTemplateDirectory.ServiceSnapshot::itemName).toList(),
                plan.tasks().stream().limit(8).map(com.rhn.outpatient.api.OutpatientPlanTemplateContracts.PlanTaskInput::text).toList());
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

    private Optional<TerminologyConceptSnapshot> findIcd10Concept(long tenantId, String name, LocalDate today) {
        if (name == null || name.isBlank()) return Optional.empty();
        String cleanName = name.replaceAll("\\[.*?\\]|\\(.*?\\)", "").trim();
        var concept = terminologyDirectory.findDiseaseByExactName(tenantId, ICD10_SYSTEM, name, today);
        if (concept.isEmpty() && !cleanName.equals(name) && !cleanName.isBlank()) {
            concept = terminologyDirectory.findDiseaseByExactName(tenantId, ICD10_SYSTEM, cleanName, today);
        }
        if (concept.isEmpty()) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("[A-Z]\\d{2}(\\.\\d+)?").matcher(name);
            if (m.find()) {
                concept = terminologyDirectory.findConcept(tenantId, ICD10_SYSTEM, m.group().toUpperCase(Locale.ROOT), today);
            }
        }
        if (concept.isEmpty() && !cleanName.isBlank()) {
            concept = terminologyDirectory.findConcept(tenantId, ICD10_SYSTEM, cleanName.toUpperCase(Locale.ROOT), today);
        }
        return concept;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.organizationId() == null || context.departmentId() == null) {
            throw forbidden("AI_PLAN_WORK_CONTEXT_REQUIRED", "请先选择包含机构与科室的工作上下文");
        }
        return context;
    }
}
