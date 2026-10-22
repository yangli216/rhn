package com.rhn.outpatient.api;

import java.time.Instant;

/** Public scheduling boundary used by registration charging without exposing scheduling entities. */
public interface OutpatientScheduleDirectory {
    SlotHoldSnapshot reserve(SlotHoldCommand command);

    SlotHoldSnapshot require(Long holdId);

    SlotHoldSnapshot consume(Long holdId, Long residentId, Long scheduleId, String commandCode);

    /** 支付指令在途时钉住暂占：有效期延长到排班结束，避免被其他患者的预占清理；非 ACTIVE 暂占原样返回。 */
    SlotHoldSnapshot pinHold(Long holdId);

    /** 支付指令已失败：暂占有效期恢复为常规窗口（当前时间起算，不延长），之后由常规清理释放；非 ACTIVE 或不存在时忽略。 */
    void unpinHold(Long holdId);

    void bindRegistration(Long holdId, Long registrationId);

    void release(Long holdId, String commandCode, boolean expired);

    record SlotHoldCommand(Long residentId, Long organizationId, Long departmentId, Long scheduleId,
                           String idempotencyCode, Instant expiresAt) {}

    record SlotHoldSnapshot(Long id, Long poolId, Long scheduleId, Long residentId, Long catalogItemId,
                            String serviceCode, String serviceName, String status, Instant expiresAt) {}
}
