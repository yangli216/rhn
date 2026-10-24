package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.api.OutpatientScheduleDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class RegistrationSlotHoldService implements OutpatientScheduleDirectory {
    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(RegistrationSlotHoldService.class);
    private static final java.time.Duration HOLD_WINDOW = java.time.Duration.ofMinutes(15);
    /** 支付在途时的暂占上限：渠道卡单时不能让号源一直被占到排班结束；应配置为不小于支付渠道的超时/补单窗口。 */
    @org.springframework.beans.factory.annotation.Value("${rhn.registration.slot-hold.pin-window:30m}")
    private java.time.Duration pinWindow = java.time.Duration.ofMinutes(30);
    private final ServiceScheduleRepository schedules;
    private final ScheduleSlotPoolRepository pools;
    private final ScheduleSlotHoldRepository holds;
    private final SlotEventRepository events;
    private final ExecutionContextProvider contextProvider;
    /** 过期暂占的释放必须在挂号失败回滚之后单独提交，否则释放会随异常一起回滚。 */
    private final TransactionTemplate expirationReleaseTransactions;

    public RegistrationSlotHoldService(ServiceScheduleRepository schedules, ScheduleSlotPoolRepository pools,
                                       ScheduleSlotHoldRepository holds, SlotEventRepository events,
                                       ExecutionContextProvider contextProvider,
                                       PlatformTransactionManager transactionManager) {
        this.schedules = schedules; this.pools = pools; this.holds = holds; this.events = events;
        this.contextProvider = contextProvider;
        this.expirationReleaseTransactions = new TransactionTemplate(transactionManager);
        this.expirationReleaseTransactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Override
    @Transactional
    public SlotHoldSnapshot reserve(SlotHoldCommand command) {
        ExecutionContext context = contextProvider.requireCurrent();
        String code = requiredCode(command.idempotencyCode());
        // 机构校验必须先于幂等回放，否则跨机构请求可用历史幂等编码取回其他机构的暂占结果。
        if (!context.canAccessOrganization(command.organizationId())) {
            throw badRequest("SLOT_HOLD_CONTEXT_MISMATCH", "号源暂占必须在当前机构办理");
        }
        ScheduleSlotHold replay = holds.findByTenantIdAndIdempotencyCode(context.tenantId(), code).orElse(null);
        if (replay != null) return verifyReplay(command, replay, context.tenantId());
        ServiceSchedule schedule = schedule(command.scheduleId(), context.tenantId());
        validateSchedule(schedule, command.organizationId(), command.departmentId());
        ScheduleSlotPool pool = pools.findByTenantIdAndScheduleId(context.tenantId(), schedule.id())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_POOL_NOT_FOUND", "所选排班缺少号源池"));
        replay = holds.findByTenantIdAndIdempotencyCode(context.tenantId(), code).orElse(null);
        if (replay != null) return verifyReplay(command, replay, context.tenantId());
        expireActiveHolds(context, pool);
        pool.holdOne();
        Instant now = Instant.now();
        Instant requested = command.expiresAt() == null ? now.plus(HOLD_WINDOW) : command.expiresAt();
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
        return snapshot(hold, requireScheduleAccess(hold, context));
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
        ServiceSchedule schedule = requireScheduleAccess(hold, context);
        if (!hold.residentId().equals(residentId) || !hold.scheduleId().equals(scheduleId)) {
            throw badRequest("SLOT_HOLD_OWNER_MISMATCH", "号源暂占与当前患者或排班不一致");
        }
        if (hold.status() == ScheduleSlotHoldStatus.CONSUMED) return snapshot(hold, schedule);
        if (hold.status() != ScheduleSlotHoldStatus.ACTIVE) throw conflict("SLOT_HOLD_NOT_ACTIVE", "号源暂占已关闭，请重新选择排班");
        if (!hold.expiresAt().isAfter(Instant.now())) {
            // 挂号失败会回滚当前事务，释放必须在事务结束后单独提交，否则号源一直被过期暂占占着。
            releaseExpiredAfterCompletion(hold.id(), context);
            throw conflict("SLOT_HOLD_EXPIRED", "号源暂占已过期，请重新办理挂号");
        }
        pool.consumeHeldOne(); hold.consume();
        append(context, pool, schedule.id(), "OCCUPIED", -1, 1,
                commandCode, "支付成功，暂占号源转为正式占用");
        return snapshot(hold, schedule);
    }

    @Override
    @Transactional
    public SlotHoldSnapshot pinHold(Long holdId) {
        ExecutionContext context = contextProvider.requireCurrent();
        ScheduleSlotHold hold = holds.findWithLockByIdAndTenantId(holdId, context.tenantId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_HOLD_NOT_FOUND", "未找到号源暂占记录"));
        ServiceSchedule schedule = requireScheduleAccess(hold, context);
        Instant now = Instant.now();
        Instant until = now.plus(pinWindow);
        hold.extendTo(until.isBefore(schedule.endAt()) ? until : schedule.endAt());
        return snapshot(hold, schedule);
    }

    @Override
    @Transactional
    public void unpinHold(Long holdId) {
        ExecutionContext context = contextProvider.requireCurrent();
        holds.findWithLockByIdAndTenantId(holdId, context.tenantId())
                .ifPresent(hold -> {
                    requireScheduleAccess(hold, context);
                    hold.shrinkTo(Instant.now().plus(HOLD_WINDOW));
                });
    }

    @Override
    @Transactional
    public void bindRegistration(Long holdId, Long registrationId) {
        ExecutionContext context = contextProvider.requireCurrent();
        ScheduleSlotHold hold = holds.findWithLockByIdAndTenantId(holdId, context.tenantId())
                .orElseThrow(() -> notFound("SCHEDULE_SLOT_HOLD_NOT_FOUND", "未找到号源暂占记录"));
        requireScheduleAccess(hold, context);
        if (hold.status() != ScheduleSlotHoldStatus.CONSUMED) throw conflict("SLOT_HOLD_NOT_CONSUMED", "号源尚未转为正式占用");
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
        requireScheduleAccess(hold, context);
        if (hold.status() != ScheduleSlotHoldStatus.ACTIVE) return;
        pool.releaseHeldOne(); hold.release(expired);
        append(context, pool, hold.scheduleId(), "RELEASED", -1, 0, commandCode,
                expired ? "挂号意向过期，释放号源" : "挂号意向取消，释放号源");
    }

    private void expireActiveHolds(ExecutionContext context, ScheduleSlotPool pool) {
        List<ScheduleSlotHold> expired = holds.findByTenantIdAndSlotPoolIdAndStatusAndExpiresAtBefore(
                context.tenantId(), pool.id(), ScheduleSlotHoldStatus.ACTIVE, Instant.now());
        if (expired.isEmpty()) return;
        // 批量清理时序号码只回查一次，避免每次释放都读一遍最大序号。
        int sequence = nextSequence(context, pool.id());
        List<SlotEvent> released = new ArrayList<>(expired.size());
        for (ScheduleSlotHold hold : expired) {
            pool.releaseHeldOne(); hold.release(true);
            released.add(new SlotEvent(context.tenantId(), pool.id(), hold.scheduleId(), "RELEASED", sequence++,
                    -1, 0, "EXPIRE-" + hold.id(), context.subjectId(), "清理过期号源暂占"));
        }
        events.saveAll(released);
    }

    /**
     * 过期暂占在挂号事务回滚后单独提交释放：等外层事务结束、行锁释放后再开新事务，
     * 避免与外层 PESSIMISTIC_WRITE 自锁，也避免释放随异常一起回滚。
     */
    private void releaseExpiredAfterCompletion(Long holdId, ExecutionContext context) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            releaseExpiredHold(holdId, context);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                try {
                    expirationReleaseTransactions.executeWithoutResult(ignored -> releaseExpiredHold(holdId, context));
                } catch (RuntimeException exception) {
                    log.warn("释放过期号源暂占 {} 失败，将在下次暂占时清理", holdId, exception);
                }
            }
        });
    }

    private void releaseExpiredHold(Long holdId, ExecutionContext context) {
        ScheduleSlotHold probe = holds.findByIdAndTenantId(holdId, context.tenantId()).orElse(null);
        if (probe == null) return;
        // 锁顺序与销号路径保持一致：先号源池、后暂占记录。
        ScheduleSlotPool pool = pools.findWithLockByIdAndTenantId(probe.slotPoolId(), context.tenantId()).orElse(null);
        if (pool == null) return;
        ScheduleSlotHold hold = holds.findWithLockByIdAndTenantId(holdId, context.tenantId()).orElse(null);
        if (hold == null || hold.status() != ScheduleSlotHoldStatus.ACTIVE
                || hold.expiresAt().isAfter(Instant.now())) return;
        pool.releaseHeldOne();
        hold.release(true);
        append(context, pool, hold.scheduleId(), "RELEASED", -1, 0,
                "EXPIRE-" + hold.id(), "支付等待超时，释放号源");
    }

    private ServiceSchedule requireScheduleAccess(ScheduleSlotHold hold, ExecutionContext context) {
        ServiceSchedule schedule = schedule(hold.scheduleId(), context.tenantId());
        // 支付回调等系统路径没有工作上下文，按租户内业务编号处理；
        // 有工作上下文时只限制机构，允许中心挂号台在同一机构内代办其他科室的暂占（科室由权限码约束）。
        if (context.hasWorkContext() && !context.canAccessOrganization(schedule.organizationId())) {
            throw forbidden("SLOT_HOLD_FORBIDDEN", "无权操作当前机构之外的号源暂占");
        }
        return schedule;
    }

    private void append(ExecutionContext context, ScheduleSlotPool pool, Long scheduleId, String eventType,
                        int heldDelta, int occupiedDelta, String commandCode, String description) {
        events.save(new SlotEvent(context.tenantId(), pool.id(), scheduleId, eventType,
                nextSequence(context, pool.id()), heldDelta, occupiedDelta, commandCode,
                context.subjectId(), description));
    }

    private int nextSequence(ExecutionContext context, Long poolId) {
        return events.findMaxSequenceNo(context.tenantId(), poolId).orElse(0) + 1;
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
                schedule.catalogItemId(), schedule.serviceCode(), schedule.serviceName(), hold.status().name(), hold.expiresAt());
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
