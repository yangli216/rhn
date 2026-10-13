package com.rhn.diagnostics.application;

import com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** Uses only definite interval relationships; a censored measurement is never assumed normal. */
public final class LaboratoryRuleEvaluator {
    private LaboratoryRuleEvaluator() {}
    public record PatientConditions(String gender, Long ageDays, String instrumentCode, String populationCode) {}
    public record Evaluation(String status, String interpretationCode, BigDecimal referenceLow,
                             BigDecimal referenceHigh, ReferenceRule matchedRule) {}
    public static Evaluation evaluate(Indicator indicator, String value, String comparator, String unitCode,
                                      PatientConditions patient) {
        if (!Objects.equals(indicator.unitCode(), unitCode))
            throw badRequest("LABORATORY_RULE_UNIT_MISMATCH", "单位与指标模板不一致，不能直接套用参考规则");
        String op = comparator == null || comparator.isBlank() ? "EQ" : comparator;
        if (!Set.of("EQ", "LT", "LE", "GT", "GE").contains(op))
            throw badRequest("LABORATORY_COMPARATOR_INVALID", "数值比较符不受支持");
        if (!"NUMBER".equals(indicator.valueType()) && !"EQ".equals(op))
            throw badRequest("LABORATORY_COMPARATOR_INVALID", "只有数值指标可以使用比较符");
        BigDecimal number = null;
        if ("NUMBER".equals(indicator.valueType())) {
            try { number = new BigDecimal(value); }
            catch (NumberFormatException error) { throw badRequest("LABORATORY_RESULT_NUMBER_INVALID", "数值型结果格式不正确"); }
            if (number.precision() > 28 || Math.max(0, number.scale()) > 8 || number.precision() - number.scale() > 20)
                throw badRequest("LABORATORY_RESULT_NUMBER_INVALID", "数值超出可保存精度");
            if (indicator.precision() != null && Math.max(0, number.stripTrailingZeros().scale()) > indicator.precision())
                throw badRequest("LABORATORY_RESULT_PRECISION_INVALID", "结果小数位超出机构模板规定");
        } else if ("CODE".equals(indicator.valueType()) && !indicator.allowedCodes().contains(value)) {
            throw badRequest("LABORATORY_RESULT_CODE_INVALID", "定性结果不属于模板允许编码");
        }
        List<ReferenceRule> matches = indicator.rules().stream().filter(rule -> matches(rule, patient)).toList();
        if (matches.size() > 1) return result("AMBIGUOUS_RULE", null, null);
        if (matches.isEmpty()) return result("NO_RULE", null, null);
        ReferenceRule rule = matches.getFirst();
        if (number == null) return result("MATCHED", rule.criticalCodes().contains(value) ? "CRITICAL" : null, rule);
        if (below(number, op, rule.criticalLow())) return result("MATCHED", "LL", rule);
        if (above(number, op, rule.criticalHigh())) return result("MATCHED", "HH", rule);
        if (!"EQ".equals(op)) {
            // If only part of the represented interval is critical, require explicit clinical review.
            if (possiblyBelow(number, op, rule.criticalLow()) || possiblyAbove(number, op, rule.criticalHigh()))
                return result("POSSIBLE_CRITICAL", null, rule);
            if (below(number, op, rule.referenceLow())) return result("MATCHED", "L", rule);
            if (above(number, op, rule.referenceHigh())) return result("MATCHED", "H", rule);
            return result("BOUNDARY_UNCERTAIN", null, rule);
        }
        String flag = below(number, op, rule.referenceLow()) ? "L" : above(number, op, rule.referenceHigh()) ? "H"
                : rule.referenceLow() != null && rule.referenceHigh() != null ? "N" : null;
        return result(flag == null ? "NO_RANGE" : "MATCHED", flag, rule);
    }
    private static boolean matches(ReferenceRule rule, PatientConditions patient) {
        return (rule.gender() == null || rule.gender().equals(patient.gender()))
                && (rule.minimumAgeDays() == null || patient.ageDays() != null && patient.ageDays() >= rule.minimumAgeDays())
                && (rule.maximumAgeDays() == null || patient.ageDays() != null && patient.ageDays() < rule.maximumAgeDays())
                && (rule.instrumentCode() == null || rule.instrumentCode().equals(patient.instrumentCode()))
                && (rule.populationCode() == null || rule.populationCode().equals(patient.populationCode()));
    }
    private static Evaluation result(String status, String flag, ReferenceRule rule) {
        return new Evaluation(status, flag, rule == null ? null : rule.referenceLow(), rule == null ? null : rule.referenceHigh(), rule);
    }
    private static boolean below(BigDecimal value, String op, BigDecimal threshold) {
        if (threshold == null || "GT".equals(op) || "GE".equals(op)) return false;
        int c = value.compareTo(threshold);
        return c < 0 || c == 0 && "LT".equals(op);
    }
    private static boolean above(BigDecimal value, String op, BigDecimal threshold) {
        if (threshold == null || "LT".equals(op) || "LE".equals(op)) return false;
        int c = value.compareTo(threshold);
        return c > 0 || c == 0 && "GT".equals(op);
    }
    private static boolean possiblyBelow(BigDecimal value, String op, BigDecimal threshold) {
        return threshold != null && ("LT".equals(op) || "LE".equals(op) || value.compareTo(threshold) < 0);
    }
    private static boolean possiblyAbove(BigDecimal value, String op, BigDecimal threshold) {
        return threshold != null && ("GT".equals(op) || "GE".equals(op) || value.compareTo(threshold) > 0);
    }
}
