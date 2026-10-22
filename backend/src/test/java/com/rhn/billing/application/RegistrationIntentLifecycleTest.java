package com.rhn.billing.application;

import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.RegistrationBillingIntent;
import com.rhn.billing.domain.RegistrationBillingIntentStatus;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.outpatient.api.OutpatientScheduleDirectory;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** 过期未付挂号意向的惰性关闭：失败/缺失支付指令放行并释放号源，在途或成功的支付指令永不被关闭。 */
class RegistrationIntentLifecycleTest {
    private static final long TENANT = 1L;
    private final RegistrationBillingIntentRepository intents = mock(RegistrationBillingIntentRepository.class);
    private final PaymentOrderRepository orders = mock(PaymentOrderRepository.class);
    private final OutpatientScheduleDirectory schedules = mock(OutpatientScheduleDirectory.class);
    private final RegistrationIntentLifecycle lifecycle = new RegistrationIntentLifecycle(intents, orders, schedules);

    private RegistrationBillingIntent intent(Instant expiresAt) {
        return new RegistrationBillingIntent(TENANT, 10L, 20L, 30L, 40L, 50L, 60L, 70L, "CODE",
                "WINDOW", "GENERAL", "SELF_PAY", null, null, null, new BigDecimal("10"), "CNY", "I", "N", expiresAt, 1L);
    }

    private void order(RegistrationBillingIntent value, String status) {
        value.linkPaymentOrder(99L, false);
        PaymentOrder order = mock(PaymentOrder.class);
        when(order.status()).thenReturn(status);
        when(orders.findByIdAndTenantId(99L, TENANT)).thenReturn(Optional.of(order));
    }

    private int expire(RegistrationBillingIntent value) {
        when(intents.findByTenantIdAndAppointmentIdAndStatusAndExpiresAtBefore(eq(TENANT), eq(40L),
                eq(RegistrationBillingIntentStatus.PAYMENT_PENDING), any())).thenReturn(List.of(value));
        when(intents.lockByIdAndTenantId(value.id(), TENANT)).thenReturn(Optional.of(value));
        return lifecycle.expireStaleForAppointment(TENANT, 40L);
    }

    @Test void expiredIntentWithoutPaymentOrderIsClosedAndReleasesItsHold() {
        var value = intent(Instant.now().minusSeconds(5));
        assertEquals(1, expire(value));
        assertEquals(RegistrationBillingIntentStatus.CANCELLED, value.status());
        verify(schedules).release(eq(70L), anyString(), eq(true));
    }

    @Test void expiredIntentWithFailedPaymentOrderIsClosed() {
        for (String terminal : List.of("FAILED", "CANCELLED", "EXPIRED")) {
            var value = intent(Instant.now().minusSeconds(5));
            order(value, terminal);
            assertEquals(1, expire(value), terminal);
            assertEquals(RegistrationBillingIntentStatus.CANCELLED, value.status());
        }
    }

    @Test void paymentOrderInFlightOrSucceededKeepsTheIntentOpen() {
        for (String live : List.of("CREATED", "PENDING", "PROCESSING", "PARTIAL", "SUCCEEDED")) {
            var value = intent(Instant.now().minusSeconds(5));
            order(value, live);
            assertEquals(0, expire(value), live);
            assertEquals(RegistrationBillingIntentStatus.PAYMENT_PENDING, value.status());
        }
        verify(schedules, never()).release(any(), anyString(), anyBoolean());
    }

    @Test void unexpiredIntentIsNeverClosed() {
        var value = intent(Instant.now().plusSeconds(600));
        assertEquals(0, expire(value));
        assertEquals(RegistrationBillingIntentStatus.PAYMENT_PENDING, value.status());
    }

    @Test void failedOrderAllowsRelinkAndCancelButLiveOrderDoesNot() {
        var value = intent(Instant.now().plusSeconds(600));
        value.linkPaymentOrder(1L, false);
        assertThrows(BusinessException.class, () -> value.linkPaymentOrder(2L, false));
        assertThrows(BusinessException.class, () -> value.cancel(false));
        value.linkPaymentOrder(2L, true);
        assertEquals(2L, value.paymentOrderId());
        value.cancel(true);
        assertEquals(RegistrationBillingIntentStatus.CANCELLED, value.status());
    }

    @Test void directVisitCheckClosesStaleIntentsBeforeLookingForBlockingOnes() {
        var contexts = mock(com.rhn.shared.context.ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new com.rhn.shared.context.ExecutionContext(TENANT, 2L, "u", "c", java.util.Set.of()));
        var life = mock(RegistrationIntentLifecycle.class);
        var service = new DirectVisitBillingService(intents, null, null, null, null, null, null, contexts, life);
        service.requireNoPendingRegistration(10L, 20L, 30L);
        InOrder order = inOrder(life, intents);
        order.verify(life).expireStaleForResident(TENANT, 10L, 20L, 30L);
        order.verify(intents).existsByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
                eq(TENANT), eq(10L), eq(20L), eq(30L), any());
    }
}
