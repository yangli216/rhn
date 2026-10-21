package com.rhn.outpatient.ordering;

import com.rhn.outpatient.ordering.ServiceDocumentGroupingPolicy.Rule;
import com.rhn.shared.text.Strings;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 门诊申请单合单：服务类型与执行机构/科室始终隔离，再按机构参数决定是否按标本类型或检查类型细分，
 * 最后按开立顺序以项目数上限装箱。合单依据未维护（标本或检查类型为空）的项目不猜测，单独成单。
 */
final class ServiceDocumentGroupingEngine {
    private ServiceDocumentGroupingEngine() {}

    record Fact(int index, String serviceType, Long performerOrganizationId, Long performerDepartmentId,
                String specimenType, String examinationType) {}

    static List<ServiceDocumentPlan> plan(List<Fact> facts, ServiceDocumentGroupingPolicy.Settings settings) {
        Map<String, List<Fact>> buckets = new LinkedHashMap<>();
        Map<String, Rule> bucketRules = new LinkedHashMap<>();
        Map<String, String> bucketValues = new LinkedHashMap<>();
        for (Fact fact : facts) {
            Rule rule = settings.ruleFor(fact.serviceType());
            String value = switch (rule) {
                case BY_DEPT_SPECIMEN -> Strings.trimToNull(fact.specimenType());
                case BY_DEPT_EXAM_TYPE -> Strings.trimToNull(fact.examinationType());
                default -> null;
            };
            boolean missingBasis = (rule == Rule.BY_DEPT_SPECIMEN || rule == Rule.BY_DEPT_EXAM_TYPE) && value == null;
            String key = rule == Rule.PER_ITEM || missingBasis ? "ITEM|" + fact.index()
                    : fact.serviceType() + "|" + fact.performerOrganizationId() + "|" + fact.performerDepartmentId() + "|" + value;
            buckets.computeIfAbsent(key, ignored -> new ArrayList<>()).add(fact);
            bucketRules.put(key, missingBasis ? Rule.PER_ITEM : rule);
            bucketValues.put(key, value);
        }
        List<ServiceDocumentPlan> plans = new ArrayList<>();
        for (var entry : buckets.entrySet()) {
            List<Fact> members = entry.getValue();
            Rule rule = bucketRules.get(entry.getKey());
            int capacity = settings.maxItemsPerDocument();
            int bins = (members.size() + capacity - 1) / capacity;
            for (int bin = 0; bin < bins; bin++) {
                List<Fact> slice = members.subList(bin * capacity, Math.min(members.size(), (bin + 1) * capacity));
                Fact first = slice.getFirst();
                List<String> reasons = new ArrayList<>();
                reasons.add(reason(rule, settings.ruleFor(first.serviceType())));
                if (bins > 1) reasons.add("单张申请单" + capacity + "项上限（第 " + (bin + 1) + " 张）");
                plans.add(new ServiceDocumentPlan(first.serviceType(), title(first.serviceType()),
                        first.performerOrganizationId(), first.performerDepartmentId(), rule.name(),
                        bucketValues.get(entry.getKey()), List.copyOf(reasons),
                        slice.stream().map(Fact::index).toList()));
            }
        }
        return plans;
    }

    private static String reason(Rule applied, Rule configured) {
        if (applied == Rule.PER_ITEM && configured != Rule.PER_ITEM) {
            return configured == Rule.BY_DEPT_SPECIMEN ? "标本类型未维护，单独成单" : "检查类型未维护，单独成单";
        }
        return switch (applied) {
            case PER_ITEM -> "每个项目一张申请单（机构参数）";
            case BY_DEPT -> "同执行科室合单";
            case BY_DEPT_SPECIMEN -> "同执行科室、同标本类型合单";
            case BY_DEPT_EXAM_TYPE -> "同执行科室、同检查类型合单";
        };
    }

    static String title(String serviceType) {
        return switch (serviceType == null ? "" : serviceType) {
            case "LABORATORY" -> "检验申请单";
            case "EXAMINATION" -> "检查申请单";
            default -> "治疗申请单";
        };
    }
}
