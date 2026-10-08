package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanComparisonView;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanDifferenceView;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.DiagnosisInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.MedicationInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.platform.masterdata.api.ClinicalDoseUnits;
import com.rhn.platform.masterdata.api.MedicationSemanticDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.notFound;

/** Computes reproducible factual differences; it does not judge guideline compliance. */
@Service
public class HistoricalPlanComparisonService {
    private final HistoricalPlanResolutionService historicalPlans;
    private final OutpatientPlanTemplateDirectory planDirectory;
    private final MedicationSemanticDirectory medicationSemantics;
    private final ExecutionContextProvider contexts;

    public HistoricalPlanComparisonService(HistoricalPlanResolutionService historicalPlans,
                                           OutpatientPlanTemplateDirectory planDirectory,
                                           MedicationSemanticDirectory medicationSemantics,
                                           ExecutionContextProvider contexts) {
        this.historicalPlans = historicalPlans;
        this.planDirectory = planDirectory;
        this.medicationSemantics = medicationSemantics;
        this.contexts = contexts;
    }

    public HistoricalPlanComparisonView compare(Long encounterId, Long templateId) {
        var historical = historicalPlans.resolveHistoricalStablePlan(encounterId)
                .orElseThrow(() -> notFound("HISTORICAL_STABLE_PLAN_NOT_FOUND", "未识别到可比较的历史稳定方案"));
        var standard = planDirectory.visibleForCurrentContext().stream()
                .filter(value -> value.id().equals(templateId)).findFirst()
                .orElseThrow(() -> notFound("PLAN_TEMPLATE_NOT_FOUND", "未找到当前工作上下文可用的标准方案"));
        List<PlanDifferenceView> differences = new ArrayList<>();
        compareDiagnoses(historical.diagnoses(), standard.diagnoses(), differences);
        compareMedications(historical.medications(), standard.medications(), differences);
        compareServices(historical.services(), standard.services(), differences);
        for (int index = 0; index < differences.size(); index++) {
            var row = differences.get(index);
            boolean assessed = historical.assessedCategories().contains(row.category());
            boolean unresolvedAbsence = "MISSING_IN_HISTORY".equals(row.status()) && historical.reviewItems().stream()
                    .anyMatch(item -> item.category().equals(row.category()));
            if (!assessed || unresolvedAbsence) differences.set(index, diff(row.key(), row.category(), "NEEDS_REVIEW",
                    row.historicalIndex(), row.standardIndex(), row.historicalDisplay(), row.standardDisplay(),
                    !assessed ? "本次历史方案尚未核对该类项目，不能据此判定缺项或一致"
                            : "该类历史记录仍有待核对条目，不能据此判定历史缺项"));
        }
        for (int index = 0; index < historical.reviewItems().size(); index++) {
            var item = historical.reviewItems().get(index);
            differences.add(diff("REVIEW:" + item.category() + ":" + index, item.category(), "NEEDS_REVIEW", null, null,
                    item.display() == null || item.display().isBlank() ? item.code() : item.display(), null, item.reason()));
        }
        differences.sort(Comparator.comparingInt((PlanDifferenceView value) -> categoryOrder(value.category()))
                .thenComparing(PlanDifferenceView::key));
        return new HistoricalPlanComparisonView(historical, standard, List.copyOf(differences));
    }

    private void compareDiagnoses(List<DiagnosisInput> historical,
                                  List<OutpatientPlanTemplateDirectory.DiagnosisSnapshot> standard,
                                  List<PlanDifferenceView> result) {
        compareIndexed("DIAGNOSIS", historical.size(), standard.size(),
                index -> diagnosisKey(historical.get(index)), index -> diagnosisKey(standard.get(index)),
                index -> historical.get(index).display(), index -> standard.get(index).display(),
                index -> !normalize(historical.get(index).type()).isEmpty(),
                index -> !normalize(standard.get(index).type()).isEmpty(),
                (hi, si) -> equal(historical.get(hi).type(), standard.get(si).type()),
                "同一标准诊断的主次类型不同", result);
    }

    private void compareMedications(List<MedicationInput> historical,
                                    List<OutpatientPlanTemplateDirectory.MedicationSnapshot> standard,
                                    List<PlanDifferenceView> result) {
        Set<Integer> matchedHistorical = new LinkedHashSet<>(), matchedStandard = new LinkedHashSet<>();
        var leftIds = indexes(historical.size(), index -> idKey(historical.get(index).medicationId()));
        var rightIds = indexes(standard.size(), index -> idKey(standard.get(index).medicationId()));
        Set<String> ids = new LinkedHashSet<>(leftIds.keySet()); ids.addAll(rightIds.keySet());
        for (String id : ids) {
            var left = leftIds.getOrDefault(id, List.of()); var right = rightIds.getOrDefault(id, List.of());
            if (id == null || left.size() > 1 || right.size() > 1) {
                for (int hi : left) { medicationReview(result, hi, null, historical, standard, "药品身份缺失或同一身份存在多条用法，无法唯一配对"); matchedHistorical.add(hi); }
                for (int si : right) { medicationReview(result, null, si, historical, standard, "药品身份缺失或同一身份存在多条用法，无法唯一配对"); matchedStandard.add(si); }
            } else if (!left.isEmpty() && !right.isEmpty()) {
                int hi = left.getFirst(), si = right.getFirst();
                addMedicationDiff(historical, standard, result, hi, si, "MEDICATION_ID");
                matchedHistorical.add(hi); matchedStandard.add(si);
            }
        }
        if (matchedHistorical.size() < historical.size() && matchedStandard.size() < standard.size()) {
            Long tenantId = contexts.requireCurrent().tenantId();
            Map<Long, List<String>> cache = new LinkedHashMap<>();
            var leftIngredients = indexes(historical.size(), index -> matchedHistorical.contains(index) ? null
                    : cache.computeIfAbsent(historical.get(index).medicationId(), id -> ingredients(tenantId, id)));
            var rightIngredients = indexes(standard.size(), index -> matchedStandard.contains(index) ? null
                    : cache.computeIfAbsent(standard.get(index).medicationId(), id -> ingredients(tenantId, id)));
            for (var entry : leftIngredients.entrySet()) {
                if (entry.getKey() == null || entry.getKey().isEmpty()) continue;
                var right = rightIngredients.getOrDefault(entry.getKey(), List.of());
                if (right.isEmpty()) continue;
                var left = entry.getValue();
                if (left.size() == 1 && right.size() == 1) {
                    addMedicationDiff(historical, standard, result, left.getFirst(), right.getFirst(), "INGREDIENT_SET");
                } else {
                    for (int hi : left) medicationReview(result, hi, null, historical, standard, "成分匹配存在多个候选，未自动选择对应项");
                    for (int si : right) medicationReview(result, null, si, historical, standard, "成分匹配存在多个候选，未自动选择对应项");
                }
                matchedHistorical.addAll(left); matchedStandard.addAll(right);
            }
        }
        for (int hi = 0; hi < historical.size(); hi++) if (!matchedHistorical.contains(hi)) {
            var value = historical.get(hi);
            String status = complete(value) && !rightIds.containsKey(null) ? "MISSING_IN_STANDARD" : "NEEDS_REVIEW";
            result.add(diff("MED:H:" + hi, "MEDICATION", status, hi, null,
                    medicationDisplay(value), null, factualReason(status)));
        }
        for (int si = 0; si < standard.size(); si++) if (!matchedStandard.contains(si)) {
            var value = standard.get(si);
            String status = complete(value) && !leftIds.containsKey(null) ? "MISSING_IN_HISTORY" : "NEEDS_REVIEW";
            result.add(diff("MED:S:" + si, "MEDICATION", status, null, si,
                    null, medicationDisplay(value), factualReason(status)));
        }
    }

    private void medicationReview(List<PlanDifferenceView> result, Integer hi, Integer si,
                                  List<MedicationInput> historical, List<OutpatientPlanTemplateDirectory.MedicationSnapshot> standard,
                                  String reason) {
        result.add(diff(hi == null ? "MED:S:" + si : "MED:H:" + hi, "MEDICATION", "NEEDS_REVIEW", hi, si,
                hi == null ? null : medicationDisplay(historical.get(hi)), si == null ? null : medicationDisplay(standard.get(si)), reason));
    }

    private void addMedicationDiff(List<MedicationInput> historical,
                                   List<OutpatientPlanTemplateDirectory.MedicationSnapshot> standard,
                                   List<PlanDifferenceView> result, int hi, int si, String identityEvidence) {
        var left = historical.get(hi); var right = standard.get(si);
        if (!complete(left) || !complete(right)) {
            result.add(diff("MED:" + left.medicationId() + ":" + right.medicationId(), "MEDICATION", "NEEDS_REVIEW", hi, si,
                    medicationDisplay(left), medicationDisplay(right), "药品剂量、途径、频次、疗程或数量事实不完整，不能确认一致"));
            return;
        }
        boolean sameDirections = sameDose(left.doseValue(), left.doseUnit(), right.doseValue(), right.doseUnit())
                && equal(left.routeCode(), right.routeCode()) && equal(left.frequencyCode(), right.frequencyCode())
                && sameQuantity(left.durationValue(), left.durationUnit(), right.durationValue(), right.durationUnit())
                && sameQuantity(left.quantity(), left.quantityUnit(), right.quantity(), right.quantityUnit());
        String status = sameDirections && "MEDICATION_ID".equals(identityEvidence) ? "CONSISTENT" : "CONFLICT";
        String reason = sameDirections ? "成分集合相同，但通用药品身份不同" : "药品剂量、途径、频次、疗程或数量不同";
        result.add(diff("MED:" + left.medicationId() + ":" + right.medicationId(), "MEDICATION", status,
                hi, si, medicationDisplay(left), medicationDisplay(right),
                "CONSISTENT".equals(status) ? "通用药品身份与用法一致" : reason));
    }

    private void compareServices(List<ServiceInput> historical,
                                 List<OutpatientPlanTemplateDirectory.ServiceSnapshot> standard,
                                 List<PlanDifferenceView> result) {
        compareIndexed("SERVICE", historical.size(), standard.size(),
                index -> idKey(historical.get(index).catalogItemId()), index -> idKey(standard.get(index).catalogItemId()),
                index -> serviceDisplay(historical.get(index)), index -> serviceDisplay(standard.get(index)),
                index -> amount(historical.get(index).quantity(), historical.get(index).unitCode()),
                index -> amount(standard.get(index).quantity(), standard.get(index).unitCode()),
                (hi, si) -> sameQuantity(historical.get(hi).quantity(), historical.get(hi).unitCode(), standard.get(si).quantity(), standard.get(si).unitCode()),
                "同一诊疗项目的数量或单位不同", result);
    }

    private void compareIndexed(String category, int leftSize, int rightSize,
                                java.util.function.IntFunction<String> leftKey, java.util.function.IntFunction<String> rightKey,
                                java.util.function.IntFunction<String> leftDisplay, java.util.function.IntFunction<String> rightDisplay,
                                java.util.function.IntPredicate leftComplete, java.util.function.IntPredicate rightComplete,
                                java.util.function.BiPredicate<Integer, Integer> same, String conflictReason, List<PlanDifferenceView> result) {
        var left = indexes(leftSize, leftKey); var right = indexes(rightSize, rightKey);
        Set<String> keys = new LinkedHashSet<>(left.keySet()); keys.addAll(right.keySet());
        for (String key : keys) {
            var ls = left.getOrDefault(key, List.of()); var rs = right.getOrDefault(key, List.of());
            if (key == null || ls.size() > 1 || rs.size() > 1) {
                for (int hi : ls) result.add(diff(category + ":H:" + hi, category, "NEEDS_REVIEW", hi, null,
                        leftDisplay.apply(hi), null, "项目身份缺失或重复，未自动配对或覆盖明细"));
                for (int si : rs) result.add(diff(category + ":S:" + si, category, "NEEDS_REVIEW", null, si,
                        null, rightDisplay.apply(si), "项目身份缺失或重复，未自动配对或覆盖明细"));
                continue;
            }
            Integer hi = ls.isEmpty() ? null : ls.getFirst(), si = rs.isEmpty() ? null : rs.getFirst();
            String status = hi != null && !leftComplete.test(hi) || si != null && !rightComplete.test(si)
                    || hi == null && left.containsKey(null) || si == null && right.containsKey(null) ? "NEEDS_REVIEW"
                    : hi == null ? "MISSING_IN_HISTORY" : si == null ? "MISSING_IN_STANDARD"
                    : same.test(hi, si) ? "CONSISTENT" : "CONFLICT";
            result.add(diff(category + ":" + key, category, status, hi, si, hi == null ? null : leftDisplay.apply(hi),
                    si == null ? null : rightDisplay.apply(si), "CONFLICT".equals(status) ? conflictReason : factualReason(status)));
        }
    }

    private <K> Map<K, List<Integer>> indexes(int size, java.util.function.IntFunction<K> key) {
        Map<K, List<Integer>> result = new LinkedHashMap<>();
        for (int index = 0; index < size; index++) result.computeIfAbsent(key.apply(index), ignored -> new ArrayList<>()).add(index);
        return result;
    }

    private List<String> ingredients(Long tenantId, Long medicationId) {
        var values = medicationSemantics.ingredientIds(tenantId, medicationId);
        if (values == null || values.stream().anyMatch(value -> value == null || value.isBlank()))
            throw new IllegalStateException("药品成分目录返回不完整，未完成方案比较");
        return values.stream().distinct().sorted().toList();
    }

    private boolean complete(MedicationInput value) {
        return idKey(value.medicationId()) != null && amount(value.doseValue(), value.doseUnit())
                && !normalize(value.routeCode()).isEmpty() && !normalize(value.frequencyCode()).isEmpty()
                && amount(value.durationValue(), value.durationUnit()) && amount(value.quantity(), value.quantityUnit());
    }
    private boolean complete(OutpatientPlanTemplateDirectory.MedicationSnapshot value) {
        return idKey(value.medicationId()) != null && amount(value.doseValue(), value.doseUnit())
                && !normalize(value.routeCode()).isEmpty() && !normalize(value.frequencyCode()).isEmpty()
                && amount(value.durationValue(), value.durationUnit()) && amount(value.quantity(), value.quantityUnit());
    }
    private boolean amount(BigDecimal value, String unit) { return value != null && value.signum() > 0 && !normalize(unit).isEmpty(); }
    private String idKey(Long value) { return value == null || value <= 0 ? null : value.toString(); }

    private boolean sameDose(BigDecimal left, String leftUnit, BigDecimal right, String rightUnit) {
        if (!amount(left, leftUnit) || !amount(right, rightUnit)) return false;
        var source = ClinicalDoseUnits.resolve(leftUnit); var target = ClinicalDoseUnits.resolve(rightUnit);
        if (source.isPresent() && target.isPresent()) {
            return ClinicalDoseUnits.convert(left, leftUnit, rightUnit)
                    .map(value -> value.compareTo(right) == 0).orElse(false);
        }
        return left.compareTo(right) == 0 && equal(leftUnit, rightUnit);
    }

    private boolean sameQuantity(BigDecimal left, String leftUnit, BigDecimal right, String rightUnit) {
        return amount(left, leftUnit) && amount(right, rightUnit) && left.compareTo(right) == 0 && equal(leftUnit, rightUnit);
    }

    private boolean equal(String left, String right) {
        return normalize(left).equals(normalize(right));
    }
    private String normalize(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }
    private String diagnosisKey(DiagnosisInput value) {
        return diagnosisKey(value.codeSystem(), value.diagnosisDomain(), value.code());
    }
    private String diagnosisKey(OutpatientPlanTemplateDirectory.DiagnosisSnapshot value) {
        return diagnosisKey(value.codeSystem(), value.diagnosisDomain(), value.code());
    }
    private String diagnosisKey(String system, String domain, String code) {
        if (normalize(system).isEmpty() || normalize(domain).isEmpty() || normalize(code).isEmpty()) return null;
        return normalize(system) + "|" + normalize(domain) + "|" + normalize(code);
    }
    private String medicationDisplay(MedicationInput value) {
        return (value.medicationName() == null ? "药品#" + value.medicationId() : value.medicationName())
                + " " + displayDirections(value.doseValue(), value.doseUnit(), value.routeCode(), value.frequencyCode());
    }
    private String medicationDisplay(OutpatientPlanTemplateDirectory.MedicationSnapshot value) {
        return value.medicationName() + " " + displayDirections(value.doseValue(), value.doseUnit(),
                value.routeCode(), value.frequencyCode());
    }
    private String displayDirections(BigDecimal dose, String unit, String route, String frequency) {
        return (dose == null ? "" : dose.stripTrailingZeros().toPlainString() + normalize(unit))
                + " " + normalize(route) + " " + normalize(frequency);
    }
    private String serviceDisplay(ServiceInput value) {
        return (value.itemName() == null ? "项目#" + value.catalogItemId() : value.itemName());
    }
    private String serviceDisplay(OutpatientPlanTemplateDirectory.ServiceSnapshot value) { return value.itemName(); }
    private String factualReason(String status) {
        return switch (status) {
            case "CONSISTENT" -> "所比较的身份与用法字段一致";
            case "NEEDS_REVIEW" -> "比较所需事实不完整，需核实后重新比较";
            case "MISSING_IN_HISTORY" -> "标准方案存在，历史稳定方案未包含";
            case "MISSING_IN_STANDARD" -> "历史稳定方案存在，标准方案未包含";
            default -> "事实字段存在差异";
        };
    }
    private PlanDifferenceView diff(String key, String category, String status, Integer hi, Integer si,
                                    String hd, String sd, String reason) {
        return new PlanDifferenceView(key, category, status, hi, si, hd, sd, reason);
    }
    private int categoryOrder(String category) {
        return switch (category) { case "DIAGNOSIS" -> 0; case "MEDICATION" -> 1; default -> 2; };
    }
}
