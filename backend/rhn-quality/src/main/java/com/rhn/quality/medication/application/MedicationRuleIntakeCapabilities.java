package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.Capability;
import java.util.List;

/** Describes knowledge-authoring coverage, not every legacy or built-in clinical rule. */
public final class MedicationRuleIntakeCapabilities {
    public static final String VERSION="qmed-intake-capabilities-v1";
    private MedicationRuleIntakeCapabilities() {}
    public static final List<Capability> ALL=List.of(
        new Capability("DUPLICATE_THERAPY","重复用药",true,List.of("重复关系：同一标准条目或人工定义的标准药品组","不同医嘱条数、检查范围、人群与途径","来源原文、版本、有效期及例外条件"),"知识工作流支持同一处方；不自动推断同成分、同类或药理等效，不跨处方合并疗程"),
        new Capability("DRUG_INTERACTION","相互作用",true,List.of("A/B 两组标准药品及条目或规格层级","检查范围、人群、途径及例外条件","配对依据、来源版本与处置要求"),"知识工作流支持同一处方内不同医嘱配对；不把类别或成分自动展开为药品，不代表配伍稳定性判断"),
        gap("SINGLE_DOSE","单次剂量","单次剂量的含义、单位与比较基准；制剂规格不是常规用量","药品、给药途径、适用人群、剂量上限来源"),
        gap("DAILY_DOSE","日剂量","日量累计窗口、频次语义、按需用药和单位换算","每日最大量与单次量的分别定义及来源"),
        gap("WEIGHT_DOSE","体重或体表面积剂量","体重/体表面积及测量时间、单位和适用人群","公式、剂量封顶、舍入策略及证据"),
        gap("ROUTE","给药途径","标准途径身份、剂型与规格适用范围","允许或禁止途径的依据与例外"),
        gap("FREQUENCY","给药频次","频次标准、间隔或时点、按需/单次/持续给药语义","适用人群与频次约束依据"),
        gap("DURATION","疗程","疗程起止、连续/间断及跨处方累计范围","疗程上限来源和例外授权"),
        gap("ALLERGY","过敏与交叉过敏","过敏原标准身份、过敏记录状态与核验时间","药品成分映射、交叉关系证据和缺失事实策略"),
        gap("POPULATION","特殊人群","年龄、孕哺或其他人群条件的确切定义","药品范围、适用限制、来源和例外"),
        gap("ORGAN_FUNCTION","肝肾功能相关","指标、单位、采集时间、计算方法和分层边界","调整剂量或禁忌的条件与依据"),
        gap("INDICATION","适应证与诊断","诊断标准身份、肯定/疑似状态及药品范围","适应证证据、例外及机构策略"),
        gap("OTHER","其他或尚未明确","需要控制的具体业务场景与条件","规则目的、标准对象及来源依据")
    );
    private static Capability gap(String kind,String name,String first,String second) {return new Capability(kind,name,false,List.of(first,second),"当前知识编译工作流尚未覆盖此类型；保留需求并补齐标准、知识与事实适配。已有内置或模板能力需单独核查，不能由本次分析直接发布");}
}
