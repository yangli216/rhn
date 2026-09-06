package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.api.OutpatientScheduleDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class RegistrationSlotHoldService implements OutpatientScheduleDirectory {
    private final ServiceScheduleRepository schedules;
    private final ScheduleSlotPoolRepository pools;
    private final ScheduleSlotHoldRepository holds;
    private final SlotEventRepository events;
    private final ExecutionContextProvider contextProvider;

    public RegistrationSlotHoldService(ServiceScheduleRepository schedules, ScheduleSlotPoolRepository pools,
                                       ScheduleSlotHoldRepository holds, SlotEventRepository events,
                                       ExecutionContextProvider contextProvider) {
        this.schedules = schedules; this.pools = pools; this.holds = holds; this.events = events;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional
    public SlotHoldSnapshot reserve(SlotHoldCommand command) {
        ExecutionContext context = contextProvider.requireCurrent();
        String code = requiredCode(command.idempotencyCode());
        ScheduleSlotHold replay = holds.findByTenantIdAndIdempotencyCode(context.tenantId(), code).orElse(null);
        if (replay != null) return verifyReplay(command, replay, context.tenantId());
        if (!context.canAccessOrganization(command.organizationId())) {
            throw badRequest("SLOT_HOLD_CONTEXT_MISMATCH", "号源暂占必须在当前机构办理");
        }
        ServiceSchedule schedule = schedule(command.scheduleId(), context.tenantId());
        validateSchedule(schedule, command.organizationId(), command.departmentId());
        ScheduleSlotPool pool = pools.findByTenantIdAndScheduleId(context.tenantId(), schedule.id())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "所选排班缺少号源池"));
        replay = holds.findByTenantIdAndIdempotencyCode(context.tenantId(), code).orElse(null);
        if (replay != null) return verifyReplay(command, replay, context.tenantId());
        expireActiveHolds(context, pool);
        pool.holdOne();
        Instant now = Instant.now();
        Instant requested = command.expiresAt() == null ? now.plus(15, ChronoUnit.MINUTES) : command.expiresAt();
        Instant expiresAt = requested.isBefore(schedule.endAt()) ? requested : schedule.endAt();
        if (!expiresAt.isAfter(now)) throw conflict("SLOT_HOLD_EXPIRY_INVALID", "所选排班已结束或暂占有效期无效");
        ScheduleSlotHold hold = holds.save(new ScheduleSlotHold(context.tenantId(), pool.id(), schedule.id(),
                command.residentId(), code, expiresAt));
        append(context, pool, schedule.id(), "HELD", 1, 0, "HOLD-" + code, "挂号缴费前暂占号源");
        return snapshot(hold, schedule);
    }

    @Override
    @Transactional(readOnly = true)
    public SlotHoldSnapshot require(Long holdId) {
        ExecutionContext context = contextProvider.requireCurrent();
        ScheduleSlotHold hold = holds.findByIdAndTenantId(holdId, context.tenantId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_HOLD_NOT_FOUND", "未找到号源暂占记录"));
        return snapshot(hold, schedule(hold.scheduleId(), context.tenantId()));
    }

    @Override
    @Transactional
    public SlotHoldSnapshot consume(Long holdId, Long residentId, Long scheduleId, String commandCode) {
        ExecutionContext context = contextProvider.requireCurrent();
        ScheduleSlotHold probe = holds.findByIdAndTenantId(holdId, context.tenantId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_HOLD_NOT_FOUND", "未找到号源暂占记录"));
        ScheduleSlotPool pool = pools.findByTenantIdAndScheduleId(context.tenantId(), probe.scheduleId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "所选排班缺少号源池"));
        ScheduleSlotHold hold = holds.findWithLockByIdAndTenantId(holdId, context.tenantId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_HOLD_NOT_FOUND", "未找到号源暂占记录"));
        ServiceSchedule schedule = schedule(hold.scheduleId(), context.tenantId());
        if (!hold.residentId().equals(residentId) || !hold.scheduleId().equals(scheduleId)) {
            throw badRequest("SLOT_HOLD_OWNER_MISMATCH", "号源暂占与当前患者或排班不一致");
        }
        if ("CONSUMED".equals(hold.status())) return snapshot(hold, schedule);
        if (!"ACTIVE".equals(hold.status())) throw conflict("SLOT_HOLD_NOT_ACTIVE", "号源暂占已关闭，请重新选择排班");
        if (!hold.expiresAt().isAfter(Instant.now())) {
            pool.releaseHeldOne(); hold.release(true);
            append(context, pool, schedule.id(), "RELEASED", -1, 0,
                    "EXPIRE-" + hold.id(), "支付等待超时，释放号源");
            throw conflict("SLOT_HOLD_EXPIRED", "号源暂占已过期，请重新办理挂号");
        }
        pool.consumeHeldOne(); hold.consume();
        append(context, pool, schedule.id(), "OCCUPIED", -1, 1,
                commandCode, "支付成功，暂占号源转为正式占用");
        return snapshot(hold, schedule);
    }

    @Override
    @Transactional
    public void bindRegistration(Long holdId, Long registrationId) {
        ExecutionContext context = contextProvider.requireCurrent();
        ScheduleSlotHold hold = holds.findWithLockByIdAndTenantId(holdId, context.tenantId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_HOLD_NOT_FOUND", "未找到号源暂占记录"));
        if (!"CONSUMED".equals(hold.status())) throw conflict("SLOT_HOLD_NOT_CONSUMED", "号源尚未转为正式占用");
        if (hold.consumedRegistrationId() != null && !hold.consumedRegistrationId().equals(registrationId)) {
            throw conflict("SLOT_HOLD_ALREADY_BOUND", "号源已绑定其他挂号记录");
        }
        hold.bindRegistration(registrationId);
    }

    @Override
    @Transactional
    public void release(Long holdId, String commandCode, boolean expired) {
        ExecutionContext context = contextProvider.requireCurrent();
        ScheduleSlotHold probe = holds.findByIdAndTenantId(holdId, context.tenantId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_HOLD_NOT_FOUND", "未找到号源暂占记录"));
        ScheduleSlotPool pool = pools.findByTenantIdAndScheduleId(context.tenantId(), probe.scheduleId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "所选排班缺少号源池"));
        ScheduleSlotHold hold = holds.findWithLockByIdAndTenantId(holdId, context.tenantId()).orElseThrow();
        if (!"ACTIVE".equals(hold.status())) return;
        pool.releaseHeldOne(); hold.release(expired);
        append(context, pool, hold.scheduleId(), "RELEASED", -1, 0, commandCode,
                expired ? "挂号意向过期，释放号源" : "挂号意向取消，释放号源");
    }

    private void expireActiveHolds(ExecutionContext context, ScheduleSlotPool pool) {
        List<ScheduleSlotHold> expired = holds.findByTenantIdAndSlotPoolIdAndStatusAndExpiresAtBefore(
                context.tenantId(), pool.id(), "ACTIVE", Instant.now());
        for (ScheduleSlotHold hold : expired) {
            pool.releaseHeldOne(); hold.release(true);
            append(context, pool, hold.scheduleId(), "RELEASED", -1, 0,
                    "EXPIRE-" + hold.id(), "清理过期号源暂占");
        }
    }

    private void append(ExecutionContext context, ScheduleSlotPool pool, Long scheduleId, String eventType,
                        int heldDelta, int occupiedDelta, String commandCode, String description) {
        int sequence = events.findTopByTenantIdAndPoolIdOrderBySequenceNoDesc(context.tenantId(), pool.id())
                .map(SlotEvent::sequenceNo).orElse(0) + 1;
        events.save(new SlotEvent(context.tenantId(), pool.id(), scheduleId, eventType, sequence,
                heldDelta, occupiedDelta, commandCode, context.subjectId(), description));
    }

    private ServiceSchedule schedule(Long id, Long tenantId) {
        return schedules.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("SERVICE_SCHEDULE_NOT_FOUND", "未找到所选排班"));
    }

    private void validateSchedule(ServiceSchedule value, Long organizationId, Long departmentId) {
        if (!value.organizationId().equals(organizationId)) {
            throw badRequest("SERVICE_SCHEDULE_CONTEXT_MISMATCH", "所选排班不属于当前机构");
        }
        if (!value.departmentId().equals(departmentId)) {
            throw badRequest("SERVICE_SCHEDULE_DEPARTMENT_MISMATCH", "挂号科室必须与所选排班的接诊科室一致");
        }
        if (!"PUBLISHED".equals(value.status())) throw conflict("SERVICE_SCHEDULE_NOT_AVAILABLE", "所选排班当前不可挂号");
    }

    private String requiredCode(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 128) {
            throw badRequest("SLOT_HOLD_IDEMPOTENCY_REQUIRED", "号源暂占必须提供不超过128位的幂等编码");
        }
        return value.trim();
    }

    private SlotHoldSnapshot snapshot(ScheduleSlotHold hold, ServiceSchedule schedule) {
        return new SlotHoldSnapshot(hold.id(), hold.slotPoolId(), hold.scheduleId(), hold.residentId(),
                schedule.catalogItemId(), schedule.serviceCode(), schedule.serviceName(), hold.status(), hold.expiresAt());
    }

    private SlotHoldSnapshot verifyReplay(SlotHoldCommand command, ScheduleSlotHold hold, Long tenantId) {
        if (!hold.residentId().equals(command.residentId()) || !hold.scheduleId().equals(command.scheduleId())) {
            throw conflict("SLOT_HOLD_IDEMPOTENCY_MISMATCH", "幂等编码已用于其他患者或排班的号源暂占");
        }
        ServiceSchedule schedule = schedule(hold.scheduleId(), tenantId);
        validateSchedule(schedule, command.organizationId(), command.departmentId());
        return snapshot(hold, schedule);
    }
}
