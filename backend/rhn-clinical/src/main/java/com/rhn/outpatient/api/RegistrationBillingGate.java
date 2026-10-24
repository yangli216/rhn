package com.rhn.outpatient.api;

/**
 * 门诊挂号落库前的挂号收费门禁：由计费模块实现，避免窗口/自助挂号绕过已发起的挂号收费或重复挂号。
 */
public interface RegistrationBillingGate {
    /**
     * 确认本次挂号可以落库：存在同机构科室待完成收费的挂号意向时，只有该意向自身的完成落库（意向处于完成中）可以继续。
     */
    void requireRegistrationAllowed(Long residentId, Long organizationId, Long departmentId,
                                    Long appointmentId, Long scheduleId, Long slotHoldId);
}
