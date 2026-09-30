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
        differences.sort(Comparator.comparingInt((PlanDifferenceView value) -> categoryOrder(value.category()))
                .thenComparing(PlanDifferenceView::key));
        return new HistoricalPlanComparisonView(historical, standard, List.copyOf(differences));
    }

    private void compareDiagnoses(List<DiagnosisInput> historical,
                                  List<OutpatientPlanTemplateDirectory.DiagnosisSnapshot> standard,
                                  List<PlanDifferenceView> result) {
        Map<String, Integer> historicalByKey = new LinkedHashMap<>();
        for (int index = 0; index < historical.size(); index++) historicalByKey.put(diagnosisKey(historical.get(index)), index);
        Map<String, Integer> standardByKey = new LinkedHashMap<>();
        for (int index = 0; index < standard.size(); index++) standardByKey.put(diagnosisKey(standard.get(index)), index);
        Set<String> keys = new LinkedHashSet<>(historicalByKey.keySet());
        keys.addAll(standardByKey.keySet());
        for (String key : keys) {
            Integer hi = historicalByKey.get(key), si = standardByKey.get(key);
            String status = hi == null ? "MISSING_IN_HISTORY" : si == null ? "MISSING_IN_STANDARD"
                    : Objects.equals(historical.get(hi).type(), standard.get(si).type()) ? "CONSISTENT" : "CONFLICT";
            result.add(diff(key, "DIAGNOSIS", status, hi, si,
                    hi == null ? null : historical.get(hi).display(),
                    si == null ? null : standard.get(si).display(),
                    "CONFLICT".equals(status) ? "同一标准诊断的主次类型不同" : factualReason(status)));
        }
    }

    private void compareMedications(List<MedicationInput> historical,
                                    List<OutpatientPlanTemplateDirectory.MedicationSnapshot> standard,
                                    List<PlanDifferenceView> result) {
        Set<Integer> matchedHistorical = new LinkedHashSet<>(), matchedStandard = new LinkedHashSet<>();
        for (int hi = 0; hi < historical.size(); hi++) {
            for (int si = 0; si < standard.size(); si++) {
                if (matchedStandard.contains(si) || !Objects.equals(historical.get(hi).medicationId(),
                        standard.get(si).medicationId())) continue;
                addMedicationDiff(historical, standard, result, hi, si, "MEDICATION_ID");
                matchedHistorical.add(hi); matchedStandard.add(si); break;
            }
        }
        Long tenantId = contexts.requireCurrent().tenantId();
        for (int hi = 0; hi < historical.size(); hi++) {
            if (matchedHistorical.contains(hi)) continue;
            List<String> historicalIngredients = ingredients(tenantId, historical.get(hi).medicationId());
            if (historicalIngredients.isEmpty()) continue;
            for (int si = 0; si < standard.size(); si++) {
                if (matchedStandard.contains(si)) continue;
                List<String> standardIngredients = ingredients(tenantId, standard.get(si).medicationId());
                if (!historicalIngredients.equals(standardIngredients)) continue;
                addMedicationDiff(historical, standard, result, hi, si, "INGREDIENT_SET");
                matchedHistorical.add(hi); matchedStandard.add(si); break;
            }
        }
        for (int hi = 0; hi < historical.size(); hi++) if (!matchedHistorical.contains(hi)) {
            var value = historical.get(hi);
            result.add(diff("MED:H:" + hi, "MEDICATION", "MISSING_IN_STANDARD", hi, null,
                    medicationDisplay(value), null, factualReason("MISSING_IN_STANDARD")));
        }
        for (int si = 0; si < standard.size(); si++) if (!matchedStandard.contains(si)) {
            var value = standard.get(si);
            result.add(diff("MED:S:" + si, "MEDICATION", "MISSING_IN_HISTORY", null, si,
                    null, medicationDisplay(value), factualReason("MISSING_IN_HISTORY")));
        }
    }

    private void addMedicationDiff(List<MedicationInput> historical,
                                   List<OutpatientPlanTemplateDirectory.MedicationSnapshot> standard,
                                   List<PlanDifferenceView> result, int hi, int si, String identityEvidence) {
        var left = historical.get(hi); var right = standard.get(si);
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
        Map<Long, Integer> historicalById = new LinkedHashMap<>(), standardById = new LinkedHashMap<>();
        for (int index = 0; index < historical.size(); index++) historicalById.put(historical.get(index).catalogItemId(), index);
        for (int index = 0; index < standard.size(); index++) standardById.put(standard.get(index).catalogItemId(), index);
        Set<Long> keys = new LinkedHashSet<>(historicalById.keySet()); keys.addAll(standardById.keySet());
        for (Long key : keys) {
            Integer hi = historicalById.get(key), si = standardById.get(key);
            String status;
            if (hi == null) status = "MISSING_IN_HISTORY";
            else if (si == null) status = "MISSING_IN_STANDARD";
            else status = sameQuantity(historical.get(hi).quantity(), historical.get(hi).unitCode(),
                    standard.get(si).quantity(), standard.get(si).unitCode()) ? "CONSISTENT" : "CONFLICT";
            result.add(diff("SERVICE:" + key, "SERVICE", status, hi, si,
                    hi == null ? null : serviceDisplay(historical.get(hi)),
                    si == null ? null : serviceDisplay(standard.get(si)),
                    "CONFLICT".equals(status) ? "同一诊疗项目的数量或单位不同" : factualReason(status)));
        }
    }

    private List<String> ingredients(Long tenantId, Long medicationId) {
        if (medicationId == null) return List.of();
        try { return medicationSemantics.ingredientIds(tenantId, medicationId); }
        catch (RuntimeException ignored) {
            // 成分查询失败时按“无成分”处理，仅降低比对精度，不阻断历史方案对比。
            return List.of();
        }
    }

    private boolean sameDose(BigDecimal left, String leftUnit, BigDecimal right, String rightUnit) {
        if (left == null || right == null) return left == null && right == null && equal(leftUnit, rightUnit);
        var source = ClinicalDoseUnits.resolve(leftUnit); var target = ClinicalDoseUnits.resolve(rightUnit);
        if (source.isPresent() && target.isPresent()) {
            return ClinicalDoseUnits.convert(left, leftUnit, rightUnit)
                    .map(value -> value.compareTo(right) == 0).orElse(false);
        }
        return left.compareTo(right) == 0 && equal(leftUnit, rightUnit);
    }

    private boolean sameQuantity(BigDecimal left, String leftUnit, BigDecimal right, String rightUnit) {
        return left == null || right == null ? left == null && right == null && equal(leftUnit, rightUnit)
                : left.compareTo(right) == 0 && equal(leftUnit, rightUnit);
    }

    private boolean equal(String left, String right) {
        return normalize(left).equals(normalize(right));
    }
    private String normalize(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }
    private String diagnosisKey(DiagnosisInput value) {
        return normalize(value.codeSystem() == null ? DiagnosisNormalizationService.ICD10_SYSTEM : value.codeSystem())
                + "|" + normalize(value.diagnosisDomain() == null ? "WESTERN_MEDICINE" : value.diagnosisDomain())
                + "|" + normalize(value.code());
    }
    private String diagnosisKey(OutpatientPlanTemplateDirectory.DiagnosisSnapshot value) {
        return normalize(value.codeSystem()) + "|" + normalize(value.diagnosisDomain()) + "|" + normalize(value.code());
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
            case "CONSISTENT" -> "历史方案与标准方案一致";
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
