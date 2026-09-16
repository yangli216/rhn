package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import java.util.*;

/** Bounded template interpreter shared by synthetic trials and HIS shadow evaluation. */
public final class MedicationCandidateEvaluator {
    public record Result(String decision, List<Integer> matchedRows, List<String> reasons) {}
    public Result evaluate(RuleSpec rule, List<Long> scope, List<TrialItem> items, Map<Long, MedicationSnapshot> facts) {
        var matched=new ArrayList<Integer>(); var reasons=new ArrayList<String>(); var missing=new ArrayList<String>();
        var groups=new LinkedHashMap<Long,List<Integer>>(); int active=0;
        for (int i=0;i<items.size();i++) {
            var item=items.get(i);
            if ("CANCELLED".equals(item.status())) continue;
            if (!Set.of("DRAFT","ACTIVE").contains(Objects.toString(item.status(), ""))) {
                missing.add("第 "+(i+1)+" 行状态不受支持"); continue;
            }
            active++;
            if (item.medicationId()==null) { missing.add("第 "+(i+1)+" 行缺少通用药 ID"); continue; }
            if (!scope.contains(item.medicationId())) continue;
            var med=facts.get(item.medicationId());
            if (med==null) { missing.add("第 "+(i+1)+" 行缺少 HIS 药品快照"); continue; }
            switch (rule.template()) {
                case "EXACT_GENERIC_DUPLICATE" -> groups.computeIfAbsent(item.medicationId(), k -> new ArrayList<>()).add(i+1);
                case "ANTIMICROBIAL_MAX_DAYS" -> {
                    if (!med.antimicrobial()) continue;
                    if (med.antimicrobialMaxDays()==null || med.antimicrobialMaxDays()<=0 || item.durationDays()==null || item.durationDays().signum()<=0)
                        missing.add("第 "+(i+1)+" 行缺少有效疗程或 HIS 抗菌药最大天数");
                    else if (item.durationDays().compareTo(java.math.BigDecimal.valueOf(med.antimicrobialMaxDays()))>0) {
                        matched.add(i+1); reasons.add(med.name()+"：疗程 "+item.durationDays()+" 天超过主数据上限 "+med.antimicrobialMaxDays()+" 天");
                    }
                }
                default -> missing.add("不支持的规则模板");
            }
        }
        groups.forEach((id, rows) -> { if (rows.size()>=rule.duplicateCount()) {
            matched.addAll(rows); reasons.add(facts.get(id).name()+"：同一通用药出现 "+rows.size()+" 次，阈值 "+rule.duplicateCount());
        }});
        if (active==0) missing.add("处方没有有效药品条目");
        reasons.addAll(missing);
        return new Result(!missing.isEmpty()?"UNAVAILABLE":matched.isEmpty()?"PASS":"WARN", List.copyOf(matched),List.copyOf(reasons));
    }
}
