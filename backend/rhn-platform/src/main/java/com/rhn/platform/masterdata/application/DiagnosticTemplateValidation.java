package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.*;
import com.rhn.shared.text.Strings;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import static com.rhn.shared.api.BusinessErrors.badRequest;

final class DiagnosticTemplateValidation {
    private DiagnosticTemplateValidation() {}
    static void validate(TemplateContent content, String serviceType) {
        if (content == null || content.indicators() == null || content.phrases() == null || content.requiredChecks() == null)
            invalid("模板内容必须包含指标、词条和核对项目列表");
        if (content.indicators().size() > 200 || content.phrases().size() > 100 || content.requiredChecks().size() > 20)
            invalid("模板条目数量超出上限");
        if (content.minimumImages() < 0 || content.minimumImages() > 4) invalid("最低图像数量须为0至4");
        if ("LABORATORY".equals(serviceType) && (content.indicators().isEmpty() || !content.phrases().isEmpty()
                || !content.requiredChecks().isEmpty() || content.minimumImages() != 0)) invalid("检验模板必须包含指标，不包含检查核对或图像要求");
        if ("EXAMINATION".equals(serviceType) && !content.indicators().isEmpty()) invalid("检查模板不能配置检验指标");
        Set<String> codes = new HashSet<>();
        for (Indicator indicator : content.indicators()) {
            if (indicator == null) invalid("指标不能为空");
            code(indicator.code()); text(indicator.name(), 200);
            if (!codes.add(indicator.code())) invalid("指标代码重复");
            if (indicator.valueType() == null || !Set.of("NUMBER", "STRING", "CODE").contains(indicator.valueType())) invalid("指标类型不受支持");
            if (indicator.unitCode() != null) text(indicator.unitCode(), 64);
            if (indicator.methodCode() != null) code(indicator.methodCode());
            if (indicator.specimenType() != null) text(indicator.specimenType(), 64);
            if (indicator.precision() != null && (indicator.precision() < 0 || indicator.precision() > 8)) invalid("小数精度须为0至8");
            uniqueStrings(indicator.allowedCodes(), 100);
            if ("CODE".equals(indicator.valueType()) && indicator.allowedCodes().isEmpty()) invalid("定性指标必须维护允许编码");
            if (!"CODE".equals(indicator.valueType()) && !indicator.allowedCodes().isEmpty()) invalid("非编码指标不能维护允许编码");
            if (indicator.rules() == null || indicator.rules().size() > 100) invalid("参考规则列表缺失或超出上限");
            Set<String> rules = new HashSet<>();
            for (ReferenceRule rule : indicator.rules()) {
                if (rule == null) invalid("参考规则不能为空");
                code(rule.code()); if (!rules.add(rule.code())) invalid("参考规则代码重复");
                if (rule.gender() != null && !Set.of("MALE", "FEMALE").contains(rule.gender())) invalid("性别条件仅支持MALE或FEMALE，未知性别不套用专属规则");
                if (rule.minimumAgeDays() != null && rule.minimumAgeDays() < 0 || rule.maximumAgeDays() != null && rule.maximumAgeDays() <= 0
                        || rule.minimumAgeDays() != null && rule.maximumAgeDays() != null && rule.maximumAgeDays() <= rule.minimumAgeDays()) invalid("年龄日数区间须为非负、下限含上限不含");
                if (rule.instrumentCode() != null) code(rule.instrumentCode());
                if (rule.populationCode() != null) code(rule.populationCode());
                if (rule.referenceLow() != null && rule.referenceHigh() != null && rule.referenceLow().compareTo(rule.referenceHigh()) > 0)
                    invalid("参考区间下限不能大于上限");
                if (rule.criticalLow() != null && rule.criticalHigh() != null && rule.criticalLow().compareTo(rule.criticalHigh()) >= 0)
                    invalid("危急阈值下限必须小于上限");
                for (java.math.BigDecimal bound : new java.math.BigDecimal[]{rule.referenceLow(),rule.referenceHigh(),rule.criticalLow(),rule.criticalHigh()}) {
                    if (bound != null && (bound.precision() > 28 || Math.max(0,bound.scale()) > 8 || bound.precision()-bound.scale() > 20))
                        invalid("阈值超出结果存储精度，不能静默舍入");
                }
                uniqueStrings(rule.criticalCodes(), 100);
                if (!indicator.allowedCodes().containsAll(rule.criticalCodes())) invalid("危急编码必须来自允许编码");
                boolean numeric = rule.referenceLow() != null || rule.referenceHigh() != null || rule.criticalLow() != null || rule.criticalHigh() != null;
                if (numeric && !"NUMBER".equals(indicator.valueType())) invalid("非数值指标不能配置数值区间");
            }
        }
        codes.clear();
        for (Phrase phrase : content.phrases()) {
            if (phrase == null) invalid("词条不能为空");
            code(phrase.code()); if (!codes.add(phrase.code())) invalid("词条代码重复");
            text(phrase.title(), 200); text(phrase.findings(), 20000); text(phrase.conclusion(), 20000);
        }
        uniqueStrings(content.requiredChecks(), 20);
    }
    private static void uniqueStrings(List<String> values, int max) {
        if (values == null || values.size() > max) invalid("编码列表缺失或超出上限");
        Set<String> unique = new HashSet<>();
        for (String value : values) { text(value, 100); if (!unique.add(value)) invalid("列表值重复"); }
    }
    private static void code(String value) { if (value == null || !value.matches("[A-Za-z][A-Za-z0-9_.-]{0,63}")) invalid("代码格式不正确"); }
    private static void text(String value, int max) { if (Strings.trimToNull(value) == null || value.length() > max || !value.equals(value.trim())) invalid("模板文本为空、超长或含首尾空白"); }
    private static void invalid(String message) { throw badRequest("DIAGNOSTIC_TEMPLATE_INVALID", message); }
}
