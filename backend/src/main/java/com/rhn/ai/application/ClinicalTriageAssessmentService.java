package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalTriageContracts.AssessmentRequest;
import com.rhn.ai.api.ClinicalTriageContracts.AssessmentResponse;
import com.rhn.ai.api.ClinicalTriageContracts.DepartmentRecommendation;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.BaselineAssessment;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.BaselineInput;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class ClinicalTriageAssessmentService {
    private static final Logger log = LoggerFactory.getLogger(ClinicalTriageAssessmentService.class);
    private static final Set<String> LEVELS = Set.of(
            "LEVEL_1_CRITICAL", "LEVEL_2_URGENT", "LEVEL_3_ROUTINE_URGENT", "LEVEL_4_NON_URGENT");

    private final OutpatientTriageAssessmentDirectory baselineDirectory;
    private final ClinicalAiRuntimePolicy runtimePolicy;
    private final ClinicalTriageAiGateway aiGateway;
    private final ExecutionContextProvider contextProvider;

    public ClinicalTriageAssessmentService(OutpatientTriageAssessmentDirectory baselineDirectory,
                                           ClinicalAiRuntimePolicy runtimePolicy,
                                           ClinicalTriageAiGateway aiGateway,
                                           ExecutionContextProvider contextProvider) {
        this.baselineDirectory = baselineDirectory;
        this.runtimePolicy = runtimePolicy;
        this.aiGateway = aiGateway;
        this.contextProvider = contextProvider;
    }

    public AssessmentResponse assess(AssessmentRequest input) {
        ExecutionContext context = contextProvider.requireCurrent();
        BaselineInput baselineInput = new BaselineInput(input.chiefComplaint(), input.symptoms(), input.temperature(),
                input.pulseRate(), input.respiratoryRate(), input.systolic(), input.diastolic(),
                input.oxygenSaturation(), input.bloodGlucose(), input.painScore(), input.consciousness(), input.age(),
                input.gender());
        BaselineAssessment baseline = baselineDirectory.assess(baselineInput);
        ClinicalAssistantSettings runtime = runtimePolicy.current(context);
        List<DepartmentRecommendation> local = baseline.departmentRecommendations().stream()
                .map(value -> new DepartmentRecommendation(value.departmentId(), value.departmentName(), value.score(),
                        value.rationale(), value.availableSlotCount(), value.alertNotice(), "LOCAL_ASSIST",
                        value.scheduledToday())).toList();

        if (Boolean.FALSE.equals(input.aiEnhancement()) || runtime.mode() != ClinicalAssistantSettings.Mode.MODEL
                || !runtime.availableFor(context)) {
            String source = runtime.mode() == ClinicalAssistantSettings.Mode.LOCAL_ASSIST
                    && runtime.availableFor(context) ? "LOCAL_ASSIST" : "RULE";
            return response(baseline, baseline.rule().level(), source, runtime.mode().name(), false,
                    baseline.rule().summary(), baseline.rule().dangerSigns(), local, null);
        }

        try {
            ClinicalTriageAiGateway.Result model = aiGateway.assess(new ClinicalTriageAiGateway.Request(
                    clean(input.chiefComplaint()), clean(input.symptoms()), input.age(), clean(input.gender()),
                    input.temperature(), input.pulseRate(), input.respiratoryRate(), input.systolic(), input.diastolic(),
                    input.oxygenSaturation(), input.bloodGlucose(), input.painScore(), clean(input.consciousness()),
                    baseline.rule().level(), baseline.rule().reasons(), baseline.candidateDepartments().stream()
                    .map(value -> new ClinicalTriageAiGateway.CandidateDepartment(value.departmentId(),
                            value.departmentName(), value.availableSlotCount(), value.scheduledToday())).toList()), runtime);
            String modelLevel = model == null || !LEVELS.contains(model.suggestedLevel())
                    ? baseline.rule().level() : model.suggestedLevel();
            String safeLevel = moreUrgent(baseline.rule().level(), modelLevel);
            return response(baseline, safeLevel, "AI_ENHANCED", runtime.mode().name(), true,
                    limited(model == null ? null : model.summary(), baseline.rule().summary(), 500),
                    mergeStrings(baseline.rule().dangerSigns(), model == null ? null : model.dangerSigns(), 8),
                    mergeRecommendations(model == null ? null : model.departmentRanks(), baseline, local), null);
        } catch (RuntimeException exception) {
            String reason = exception instanceof ClinicalAiModelException modelException
                    ? modelException.userMessage() : "模型辅助暂时不可用，已使用规则评估。";
            log.warn("Clinical triage model unavailable; falling back to deterministic assessment: {}",
                    exception.getMessage());
            return response(baseline, baseline.rule().level(), "AI_FALLBACK", runtime.mode().name(), false,
                    baseline.rule().summary(), baseline.rule().dangerSigns(), local, reason);
        }
    }

    private static AssessmentResponse response(BaselineAssessment baseline, String level, String source,
                                               String mode, boolean aiApplied, String summary,
                                               List<String> dangerSigns, List<DepartmentRecommendation> departments,
                                               String fallbackReason) {
        return new AssessmentResponse(baseline.rule().level(), level, source, mode, aiApplied, summary,
                baseline.rule().reasons(), dangerSigns, departments, fallbackReason);
    }

    private static List<DepartmentRecommendation> mergeRecommendations(
            List<ClinicalTriageAiGateway.DepartmentRank> ranks, BaselineAssessment baseline,
            List<DepartmentRecommendation> local) {
        Map<Long, OutpatientTriageAssessmentDirectory.CandidateDepartment> allowed = baseline.candidateDepartments()
                .stream().collect(java.util.stream.Collectors.toMap(
                        OutpatientTriageAssessmentDirectory.CandidateDepartment::departmentId, value -> value));
        LinkedHashMap<Long, DepartmentRecommendation> merged = new LinkedHashMap<>();
        if (ranks != null) ranks.stream().filter(java.util.Objects::nonNull).limit(3).forEach(rank -> {
            var department = allowed.get(rank.departmentId());
            if (department == null) return;
            int score = rank.score() == null ? 80 : Math.max(0, Math.min(100, rank.score()));
            merged.put(department.departmentId(), new DepartmentRecommendation(department.departmentId(),
                    department.departmentName(), score, limited(rank.rationale(), "模型依据当前分诊资料推荐", 500),
                    department.availableSlotCount(), limited(rank.alertNotice(), null, 300), "AI",
                    department.scheduledToday()));
        });
        local.forEach(value -> merged.putIfAbsent(value.departmentId(), value));
        return merged.values().stream().limit(5).toList();
    }

    static String moreUrgent(String left, String right) {
        return urgency(left) <= urgency(right) ? left : right;
    }

    private static int urgency(String level) {
        return switch (level) {
            case "LEVEL_1_CRITICAL" -> 1;
            case "LEVEL_2_URGENT" -> 2;
            case "LEVEL_3_ROUTINE_URGENT" -> 3;
            default -> 4;
        };
    }

    private static String clean(String value) { return value == null ? "" : value.trim(); }
    private static String limited(String value, String fallback, int maximum) {
        String clean = value == null || value.isBlank() ? fallback : value.trim();
        return clean == null || clean.length() <= maximum ? clean : clean.substring(0, maximum);
    }
    private static List<String> mergeStrings(List<String> baseline, List<String> additions, int maximum) {
        LinkedHashSet<String> merged = new LinkedHashSet<>(baseline == null ? List.of() : baseline);
        if (additions != null) additions.stream().filter(value -> value != null && !value.isBlank())
                .map(String::trim).forEach(merged::add);
        return merged.stream().limit(maximum).toList();
    }
}
