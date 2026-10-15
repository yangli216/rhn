package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.platform.dictionary.api.SystemEnumContribution;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.rhn.platform.dictionary.api.SystemEnumDefinition.items;
import static com.rhn.platform.dictionary.api.SystemEnumDefinition.of;

/** Medication safety evaluation value sets, checked against {@link MedicationSafetyDecision} enums. */
@Component
class MedicationSafetySystemEnums implements SystemEnumContribution {
    @Override
    public List<SystemEnumDefinition> systemEnums() {
        return List.of(
                of("MED_SAFETY_DECISION", "用药安全评价结论", "用药安全规则对医嘱或处方的评价结论",
                        MedicationSafetyDecision.Status.class, items(
                                "PASS", "未触发控制", "未发现需控制的风险", "WARN", "提醒核对", "提示风险，核对后可继续",
                                "REQUIRE_OVERRIDE", "需说明理由", "继续须说明理由", "BLOCK", "阻断", "必须修改后才能继续",
                                "UNAVAILABLE", "无法评价", "数据不足无法评价")),
                of("MED_SAFETY_OVERRIDE_POLICY", "用药安全提醒处置要求", "医生遇到用药安全提醒时继续开立的条件",
                        MedicationSafetyDecision.OverridePolicy.class, items(
                                "NOT_ALLOWED", "不可越过", "必须修改医嘱后才能继续",
                                "ACKNOWLEDGE", "确认知晓后继续", "医生确认已知晓风险即可继续",
                                "REASON_REQUIRED", "填写理由后继续", "必须录入继续开立的理由")));
    }
}
