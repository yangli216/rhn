package com.rhn.outpatient.api;

/**
 * 由计费模块实现的退号门禁：退款进行中时阻断接诊，避免退款完成而就诊已开始。
 * 接口放在门诊包内，使门诊不依赖计费模块（计费已依赖门诊）。
 */
public interface RegistrationCancellationGate {
    void requireStartAllowed(Long encounterId);
}
