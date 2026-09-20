package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import java.util.*;

/** Bounded template interpreter shared by synthetic trials and HIS shadow evaluation. */
public final class MedicationCandidateEvaluator {
    public record Result(String decision, List<Integer> matchedRows, List<String> reasons) {}
    public Result evaluate(RuleSpec rule, List<Long> scope, List<TrialItem> items, Map<Long, MedicationSnapshot> facts) {
        return evaluate(rule, scope, items, facts, null);
    }

    public Result evaluate(RuleSpec rule, List<Long> scope, List<TrialItem> items, Map<Long, MedicationSnapshot> facts, PatientSimulationContext patientContext) {
        return evaluate(rule, scope, items, facts, patientContext, null);
    }

    public Result evaluate(RuleSpec rule, List<Long> scope, List<TrialItem> items, Map<Long, MedicationSnapshot> facts,
            PatientSimulationContext patientContext, Map<Long, String> standardIdentities) {
        var matched=new ArrayList<Integer>(); var reasons=new ArrayList<String>(); var missing=new ArrayList<String>();
        var groups=new LinkedHashMap<String,List<Integer>>();
        var names=new HashMap<String,String>();
        var categoryRows=new ArrayList<Integer>();
        int active=0; int evaluated=0;
        for (int i=0;i<items.size();i++) {
            var item=items.get(i);
            if ("CANCELLED".equals(item.status())) continue;
            if (!Set.of("DRAFT","ACTIVE").contains(Objects.toString(item.status(), ""))) {
                missing.add("第 "+(i+1)+" 行状态不受支持"); continue;
            }
            active++;
            if (item.medicationId()==null) { missing.add("第 "+(i+1)+" 行缺少通用药 ID"); continue; }
            if (standardIdentities != null && !standardIdentities.containsKey(item.medicationId())) {
                missing.add("第 "+(i+1)+" 行缺少已保存的标准规格关联"); continue;
            }
            if (scope != null && !scope.isEmpty() && !scope.contains(item.medicationId())
                    && (standardIdentities == null || scope.stream().noneMatch(id -> Objects.equals(
                        standardIdentities.get(id), standardIdentities.get(item.medicationId()))))) continue;
            var med=facts.get(item.medicationId());
            if (med==null) { missing.add("第 "+(i+1)+" 行缺少 HIS 药品快照"); continue; }
            evaluated++;
            switch (rule.template() != null ? rule.template() : "") {
                case "EXACT_GENERIC_DUPLICATE" -> {
                    String identity = standardIdentities == null ? item.medicationId().toString() : standardIdentities.get(item.medicationId());
                    groups.computeIfAbsent(identity, k -> new ArrayList<>()).add(i+1);
                    names.putIfAbsent(identity, med.name());
                }
                case "CATEGORY_DUPLICATE" -> categoryRows.add(i+1);
                case "ANTIMICROBIAL_MAX_DAYS" -> {
                    if (!med.antimicrobial()) continue;
                    if (med.antimicrobialMaxDays() == null || med.antimicrobialMaxDays() <= 0) {
                        missing.add("药品【" + med.name() + "】主数据未配置抗菌药门诊疗程天数上限");
                        continue;
                    }
                    int maxDays = med.antimicrobialMaxDays();
                    if (item.durationDays() == null || item.durationDays().signum() <= 0) {
                        missing.add("第 " + (i + 1) + " 行缺少有效处方疗程天数");
                    } else if (item.durationDays().compareTo(java.math.BigDecimal.valueOf(maxDays)) > 0) {
                        matched.add(i + 1);
                        reasons.add(med.name() + "：疗程 " + item.durationDays() + " 天超过主数据上限 " + maxDays + " 天");
                    }
                }
                case "AGE_CONTRAINDICATION" -> {
                    int limitAge = rule.minAge() != null ? rule.minAge() : 18;
                    if (patientContext == null || patientContext.patientAgeYears() == null) {
                        missing.add("就诊上下文缺少患者年龄，无法核对【" + med.name() + "】的未成年禁忌");
                    } else if (patientContext.patientAgeYears() < limitAge) {
                        matched.add(i+1);
                        reasons.add(med.name() + "：患者年龄 " + patientContext.patientAgeYears() + " 岁，低于规则限制年龄 " + limitAge + " 岁");
                    }
                }
                default -> missing.add("不支持的规则模板");
            }
        }
        groups.forEach((id, rows) -> { if (rows.size()>=rule.duplicateCount()) {
            matched.addAll(rows); reasons.add(names.get(id)+"：相同标准规格出现 "+rows.size()+" 次，阈值 "+rule.duplicateCount());
        }});
        if ("CATEGORY_DUPLICATE".equals(rule.template()) && categoryRows.size() >= (rule.duplicateCount() > 0 ? rule.duplicateCount() : 2)) {
            matched.addAll(categoryRows);
            String cat = rule.categoryName() != null ? rule.categoryName() : "同类";
            reasons.add("同一处方开具【" + cat + "】药物 " + categoryRows.size() + " 种，达到重复用药阈值 " + (rule.duplicateCount() > 0 ? rule.duplicateCount() : 2));
        }
        if (active==0) missing.add("处方没有有效药品条目");
        else if (evaluated==0) missing.add("处方没有属于该规则适用药品范围的有效条目");
        reasons.addAll(missing);
        String finalDecision = !missing.isEmpty() ? "UNAVAILABLE" : matched.isEmpty() ? "PASS" : (rule.decision() != null ? rule.decision() : "WARN");
        return new Result(finalDecision, List.copyOf(matched), List.copyOf(reasons));
    }
}
