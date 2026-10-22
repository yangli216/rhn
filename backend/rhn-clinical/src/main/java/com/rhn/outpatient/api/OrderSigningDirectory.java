package com.rhn.outpatient.api;

/** 诊毕核对使用的医嘱签署事实，不暴露医嘱模块内部实体。 */
public interface OrderSigningDirectory {
    /**
     * 已保存但尚未签署（DRAFT）的药品和检验检查医嘱项数。
     * 简易核查模式保存即开立，不要求单独签署，返回 0。
     */
    int unsignedOrderCount(EncounterDirectory.EncounterSnapshot encounter);
}
