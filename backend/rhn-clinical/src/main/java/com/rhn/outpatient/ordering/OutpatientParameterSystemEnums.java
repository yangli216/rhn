package com.rhn.outpatient.ordering;

import com.rhn.platform.dictionary.api.SystemEnumContribution;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.rhn.platform.dictionary.api.SystemEnumDefinition.items;
import static com.rhn.platform.dictionary.api.SystemEnumDefinition.of;

/** 门诊下拉选择参数的取值字典：参数平台要求下拉控件绑定字典，并按字典校验写入值。 */
@Component
class OutpatientParameterSystemEnums implements SystemEnumContribution {
    static final String ALLERGY_VERIFICATION_MODE = "OUT_ALLERGY_VERIFICATION_MODE";
    static final String ORDER_REVIEW_MODE = "OUT_ORDER_REVIEW_MODE";
    static final String COMPLETION_MODE = "OUT_COMPLETION_MODE";
    static final String REGISTRATION_CUTOFF_MODE = "OUT_REGISTRATION_CUTOFF_MODE";

    @Override
    public List<SystemEnumDefinition> systemEnums() {
        return List.of(
                of(ALLERGY_VERIFICATION_MODE, "门诊药品过敏核验处置模式", "过敏状态未采集或本次未确认时的开立处置", items(
                        "WARN", "仅警告", "提示过敏状态待核验，允许继续开立",
                        "BLOCK", "阻断开立", "过敏状态核验前不允许开立药品")),
                of(COMPLETION_MODE, "门诊诊毕签署交互模式", "诊毕时病历签署与诊毕确认的交互方式", items(
                        "COMBINED_CONFIRMATION", "合并确认", "诊毕最终确认时一并完成病历签署",
                        "SEPARATE_CONFIRMATIONS", "分步确认", "先单独签署病历，再确认诊毕")),
                of(ORDER_REVIEW_MODE, "门诊医嘱开立核查模式", "医生开立医嘱前是否每次弹出核查窗",
                        OrderReviewModePolicy.Mode.class, items(
                                "STANDARD", "标准：开立前核查分单与诊断", "每次开立先确认分单、关联诊断与合理用药",
                                "SIMPLE", "简易：直接开立，异常时再核查", "仅在合理用药需确认或开立失败时弹出核查窗")),
                of(REGISTRATION_CUTOFF_MODE, "门诊挂号效期截止时间模式", "挂号有效期截止时刻的计算方式", items(
                        "END_OF_DAY", "当天结束", "截止到当天 23:59:59",
                        "EXACT_DURATION", "精确时长", "截止到挂号时刻起算的 24 小时后")));
    }
}
