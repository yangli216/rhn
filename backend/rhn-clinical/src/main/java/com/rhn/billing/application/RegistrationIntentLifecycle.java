package com.rhn.billing.application;

import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.RegistrationBillingIntent;
import com.rhn.billing.domain.RegistrationBillingIntentStatus;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.outpatient.api.OutpatientScheduleDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * 挂号收费意向的过期收口：已过期、且没有支付指令或支付指令已失败/取消/过期的待支付意向，
 * 在被阻塞查询碰到时惰性关闭并释放自己持有的号源暂占，避免永久阻塞重新挂号、直接接诊与预约改约。
 * 支付指令仍在途（CREATED/PENDING/PROCESSING/PARTIAL）或已成功的意向永不在此关闭。
 */
@Service
class RegistrationIntentLifecycle {
    private static final Set<String> FAILED_ORDER_STATUSES = Set.of("FAILED", "CANCELLED", "EXPIRED");
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RegistrationIntentLifecycle.class);
    private final RegistrationBillingIntentRepository intents;
    private final PaymentOrderRepository orders;
    private final OutpatientScheduleDirectory schedules;

    RegistrationIntentLifecycle(RegistrationBillingIntentRepository intents, PaymentOrderRepository orders,
                                OutpatientScheduleDirectory schedules) {
        this.intents = intents; this.orders = orders; this.schedules = schedules;
    }

    /** 意向已绑定的支付指令是否处于失败终态；在已锁定意向的事务内调用。 */
    boolean linkedOrderFailed(Long tenantId, RegistrationBillingIntent intent) {
        if (intent.paymentOrderId() == null) return false;
        return orders.findByIdAndTenantId(intent.paymentOrderId(), tenantId)
                .map(PaymentOrder::status).filter(FAILED_ORDER_STATUSES::contains).isPresent();
    }

    /**
     * 挂号支付指令失败/取消/过期：把它钉住的暂占恢复为常规窗口，交给常规清理释放。
     * 在支付状态事务提交后、独立事务内执行；锁顺序 挂号意向 → 号源暂占。
     */
    @org.springframework.transaction.event.TransactionalEventListener(
            phase = org.springframework.transaction.event.TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    void onPaymentOrderFailed(PaymentOrderFailedEvent event) {
        if (!"REGISTRATION".equals(event.businessScene())) return;
        try {
            unpinFor(event);
        } catch (RuntimeException exception) {
            // 尽力而为：支付状态已提交，号源清理失败时由惰性过期兜底。
            log.warn("Unpin slot hold failed after payment order {} ended unsuccessfully", event.paymentOrderId(), exception);
            org.springframework.transaction.interceptor.TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        }
    }

    private void unpinFor(PaymentOrderFailedEvent event) {
        RegistrationBillingIntent probe = intents.findByTenantIdAndPaymentOrderId(event.tenantId(), event.paymentOrderId()).orElse(null);
        if (probe == null) return;
        RegistrationBillingIntent value = intents.lockByIdAndTenantId(probe.id(), event.tenantId()).orElse(null);
        if (value == null || value.status() != RegistrationBillingIntentStatus.PAYMENT_PENDING
                || !event.paymentOrderId().equals(value.paymentOrderId()) || value.slotHoldId() == null) return;
        schedules.unpinHold(value.slotHoldId());
    }

    @Transactional
    int expireStaleForResident(Long tenantId, Long residentId, Long organizationId, Long departmentId) {
        return expire(tenantId, intents.findStalePaymentPendingIdsForResident(
                tenantId, residentId, organizationId, departmentId, RegistrationBillingIntentStatus.PAYMENT_PENDING, Instant.now()));
    }

    @Transactional
    int expireStaleForAppointment(Long tenantId, Long appointmentId) {
        return expire(tenantId, intents.findStalePaymentPendingIdsForAppointment(
                tenantId, appointmentId, RegistrationBillingIntentStatus.PAYMENT_PENDING, Instant.now()));
    }

    private int expire(Long tenantId, List<Long> candidateIds) {
        int closed = 0;
        for (Long candidateId : candidateIds) {
            RegistrationBillingIntent value = intents.lockByIdAndTenantId(candidateId, tenantId).orElse(null);
            if (value == null || value.status() != RegistrationBillingIntentStatus.PAYMENT_PENDING
                    || value.expiresAt() == null || value.expiresAt().isAfter(Instant.now())) continue;
            if (value.paymentOrderId() != null && !linkedOrderFailed(tenantId, value)) continue;
            value.cancel(true);
            if (value.slotHoldId() != null) schedules.release(value.slotHoldId(), "EXPIRE-REG-INTENT-" + value.id(), true);
            closed++;
        }
        return closed;
    }
}
