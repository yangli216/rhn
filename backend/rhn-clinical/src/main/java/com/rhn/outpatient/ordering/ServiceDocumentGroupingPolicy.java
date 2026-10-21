package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.util.Locale;
import java.util.Set;

/**
 * 门诊申请单合单参数：按服务类型选择合单方式和单张申请单项目数上限。
 * 参数缺失或取值不适用于该服务类型时按产品默认值（检验同科室同标本、检查同科室同检查类型、治疗同科室、10 项）。
 */
@Service
public class ServiceDocumentGroupingPolicy {
    public static final String PARAMETER_KEY = "outpatient.service-request.grouping-policy";
    static final int MAX_ITEMS_LIMIT = 30;

    enum Rule { PER_ITEM, BY_DEPT, BY_DEPT_SPECIMEN, BY_DEPT_EXAM_TYPE }

    static final Settings DEFAULT_SETTINGS = new Settings(Rule.BY_DEPT_SPECIMEN, Rule.BY_DEPT_EXAM_TYPE, Rule.BY_DEPT, 10);

    private final ConfigurationDirectory configuration;

    public ServiceDocumentGroupingPolicy(ConfigurationDirectory configuration) {
        this.configuration = configuration;
    }

    Settings resolve(EncounterSnapshot encounter) {
        var configured = configuration.resolveCurrent(encounter.tenantId(), null, encounter.organizationId(),
                encounter.departmentId(), PARAMETER_KEY);
        return configured == null ? DEFAULT_SETTINGS : parse(configured.value());
    }

    static Settings parse(JsonNode value) {
        if (value == null || !value.isObject()) return DEFAULT_SETTINGS;
        Rule laboratory = rule(value, "laboratory", Set.of(Rule.PER_ITEM, Rule.BY_DEPT, Rule.BY_DEPT_SPECIMEN),
                DEFAULT_SETTINGS.laboratory());
        Rule examination = rule(value, "examination", Set.of(Rule.PER_ITEM, Rule.BY_DEPT, Rule.BY_DEPT_EXAM_TYPE),
                DEFAULT_SETTINGS.examination());
        Rule treatment = rule(value, "treatment", Set.of(Rule.PER_ITEM, Rule.BY_DEPT), DEFAULT_SETTINGS.treatment());
        int maxItems = value.path("maxItemsPerDocument").isIntegralNumber()
                && value.get("maxItemsPerDocument").asInt() >= 1
                && value.get("maxItemsPerDocument").asInt() <= MAX_ITEMS_LIMIT
                ? value.get("maxItemsPerDocument").asInt() : DEFAULT_SETTINGS.maxItemsPerDocument();
        return new Settings(laboratory, examination, treatment, maxItems);
    }

    private static Rule rule(JsonNode value, String field, Set<Rule> allowed, Rule fallback) {
        if (!value.path(field).isString()) return fallback;
        try {
            Rule rule = Rule.valueOf(value.get(field).asString().trim().toUpperCase(Locale.ROOT));
            return allowed.contains(rule) ? rule : fallback;
        } catch (IllegalArgumentException ignored) {
            // 非法取值已由参数平台拒绝写入；历史脏数据按默认值处理。
            return fallback;
        }
    }

    record Settings(Rule laboratory, Rule examination, Rule treatment, int maxItemsPerDocument) {
        Rule ruleFor(String serviceType) {
            return switch (serviceType == null ? "" : serviceType) {
                case "LABORATORY" -> laboratory;
                case "EXAMINATION" -> examination;
                default -> treatment;
            };
        }
    }
}
