package com.rhn.quality.medication.domain.rule;

import com.rhn.quality.medication.domain.MedicationSafetyCategoryMembership;
import com.rhn.shared.json.JsonCodec;

/**
 * 基层核心合理用药规则的参数化表达式工厂。
 * 将新安全分类直接实例化为可执行的参数化规则，支持沙箱仿真、动态部署与基线复用。
 */
public final class ClinicalParameterizedRules {
    private ClinicalParameterizedRules() {}

    /**
     * 模板 C：质子泵抑制剂（PPI）同方或重复用药核查
     */
    public static ParameterizedCategoryDuplicateRule ppiDuplicate(
            JsonCodec json,
            MedicationSafetyCategoryMembership membership
    ) {
        return new ParameterizedCategoryDuplicateRule(
                "QMED.PPI_DUPLICATE",
                "java:category-duplicate:ppi:1",
                "PPI_DUPLICATE_THERAPY",
                2,
                "处方中包含 %d 种同类质子泵抑制剂（PPI）抑酸药【%s】联合使用，存在同类重复用药风险。",
                "联合使用两种及以上质子泵抑制剂通常不增加抑酸疗效，而成倍增加艰难梭菌感染、低镁血症及骨折风险。建议保留单一适宜品种。",
                json,
                membership
        );
    }

    /**
     * 模板 C：ACEI 与 ARB 类降压药重复用药 / 双重 RAAS 阻断核查
     */
    public static ParameterizedCategoryDuplicateRule rasiDuplicate(
            JsonCodec json,
            MedicationSafetyCategoryMembership membership
    ) {
        return new ParameterizedCategoryDuplicateRule(
                "QMED.RASI_DUPLICATE",
                "java:category-duplicate:rasi:1",
                "RASI_DUPLICATE_THERAPY",
                2,
                "处方中包含 %d 种普利类/沙坦类降压药【%s】联合使用，存在严重双重阻断风险。",
                "临床指南明确反对ACEI（普利类）与ARB（沙坦类）联用双重阻断RAAS系统，可诱发严重高血钾、急性肾衰竭及过低血压。",
                json,
                membership
        );
    }

    /**
     * 模板 C：镇静催眠类及抗焦虑药物重复用药核查
     */
    public static ParameterizedCategoryDuplicateRule sedativeHypnoticDuplicate(
            JsonCodec json,
            MedicationSafetyCategoryMembership membership
    ) {
        return new ParameterizedCategoryDuplicateRule(
                "QMED.SEDATIVE_HYPNOTIC_DUPLICATE",
                "java:category-duplicate:sedative-hypnotic:1",
                "SEDATIVE_HYPNOTIC_DUPLICATE",
                2,
                "处方中包含 %d 种镇静催眠/抗焦虑类药物【%s】联合使用，存在过度中枢抑制风险。",
                "联合开立两种或以上镇静催眠药物易导致中枢过度抑制、呼吸抑制及老年患者跌倒骨折。建议精简为单一适宜方案。",
                json,
                membership
        );
    }

    /**
     * 模板 B：儿童青少年禁用四环素类抗生素核查（< 8 周岁）
     */
    public static ParameterizedCategoryPopulationRule tetracyclinePediatric(
            JsonCodec json,
            MedicationSafetyCategoryMembership membership
    ) {
        return new ParameterizedCategoryPopulationRule(
                "QMED.TETRACYCLINE_PEDIATRIC",
                "java:category-population:tetracycline-pediatric:1",
                "TETRACYCLINE_PEDIATRIC_CONTRA",
                8,
                null,
                "患者年龄（%d岁）未满8周岁，禁用四环素类抗生素【%s】（四环素牙永久黄染与骨发育抑制高危风险）。",
                "8周岁以下儿童骨骼和牙齿发育期禁用四环素类抗生素（多西环素、米诺环素等）。请根据临床指征选用大环内酯类或青霉素类/头孢类适宜抗菌药。",
                json,
                membership
        );
    }

    /**
     * 模板 B：儿童及特殊人群禁用氨基糖苷类抗生素核查（< 6 周岁）
     */
    public static ParameterizedCategoryPopulationRule aminoglycosidePediatric(
            JsonCodec json,
            MedicationSafetyCategoryMembership membership
    ) {
        return new ParameterizedCategoryPopulationRule(
                "QMED.AMINOGLYCOSIDE_PEDIATRIC",
                "java:category-population:aminoglycoside-pediatric:1",
                "AMINOGLYCOSIDE_PEDIATRIC_CONTRA",
                6,
                null,
                "患者年龄（%d岁）未满6周岁，禁用氨基糖苷类抗生素【%s】（不可逆耳蜗前庭神经毒性导致永久性药物性耳聋与急性肾损伤高危风险）。",
                "6周岁以下儿童及婴幼儿禁忌使用氨基糖苷类抗生素（庆大霉素、阿米卡星等）。请更换为儿童适用的无耳毒性抗菌药。",
                json,
                membership
        );
    }

    /**
     * 模板 A：大环内酯类抗菌药与高危他汀类相互作用核查
     */
    public static ParameterizedCategoryConflictRule macrolideStatinConflict(
            JsonCodec json,
            MedicationSafetyCategoryMembership membership
    ) {
        return new ParameterizedCategoryConflictRule(
                "QMED.MACROLIDE_STATIN_INTERACTION",
                "java:category-conflict:macrolide-statin:1",
                "MACROLIDE_STATIN_INTERACTION",
                "STATIN_LIPID_LOWERING",
                "处方中【%s】与【%s】联用存在严重药物相互作用风险（CYP3A4代谢抑制诱发致死性横纹肌溶解）。",
                "红霉素/克拉霉素强效抑制CYP3A4酶，显著升高经该酶代谢的他汀类血药浓度，有诱发急性横纹肌溶解及肾衰竭风险。建议暂停他汀或更换非相互作用抗感染药。",
                json,
                membership
        );
    }

    /**
     * 模板 B：育龄期及妊娠期妇女禁用高危致畸药物核查（FDA X级/致畸风险）
     */
    public static ParameterizedCategoryPopulationRule pregnancyContraindication(
            JsonCodec json,
            MedicationSafetyCategoryMembership membership
    ) {
        return new ParameterizedCategoryPopulationRule(
                "QMED.PREGNANCY_CONTRA",
                "java:category-population:pregnancy-contra:1",
                "PREGNANCY_CONTRA_CATEGORY_X",
                "FEMALE",
                12,
                50,
                null,
                null,
                true,
                "患者为育龄期女性（%s岁），禁忌使用妊娠期高危致畸药物【%s】。",
                "临床证实此类药物具有明确的人类胚胎致畸性或胚胎致死毒性（FDA X级/妊娠期绝对禁忌）。育龄期备孕及妊娠期妇女严禁使用，请立即停用并选用适宜替代药品。",
                json,
                membership
        );
    }
}
