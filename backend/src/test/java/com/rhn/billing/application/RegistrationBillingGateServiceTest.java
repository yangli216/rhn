package com.rhn.billing.application;

import com.rhn.billing.domain.RegistrationBillingIntent;
import com.rhn.billing.domain.RegistrationBillingIntentStatus;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 挂号网关：已过期的待支付遗留意向不再拦截新挂号，其余未完成收费的意向仍拦截。 */
class RegistrationBillingGateServiceTest {
    private static final long TENANT = 1L;
    private static final long SLOT_HOLD = 70L;
    private final RegistrationBillingIntentRepository intents = mock(RegistrationBillingIntentRepository.class);
    private final RegistrationBillingGateService gate = new RegistrationBillingGateService(intents);

    @BeforeEach void tenant() { TenantContext.set(TENANT); }

    @AfterEach void clearTenant() { TenantContext.clear(); }

    private RegistrationBillingIntent intent(long slotHold, Instant expiresAt, RegistrationBillingIntentStatus status) {
        var value = new RegistrationBillingIntent(TENANT, 10L, 20L, 30L, 40L, 50L, 60L, slotHold, "CODE-" + slotHold,
                "WINDOW", "GENERAL", "SELF_PAY", null, null, null, new BigDecimal("10"), "CNY", "I", "N", expiresAt, 1L);
        ReflectionTestUtils.setField(value, "status", status);
        return value;
    }

    private void unsettled(RegistrationBillingIntent... values) {
        when(intents.findByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
                eq(TENANT), eq(10L), eq(20L), eq(30L), any())).thenReturn(List.of(values));
    }

    private void check() { gate.requireRegistrationAllowed(10L, 20L, 30L, null, null, SLOT_HOLD); }

    private void assertBlocked() {
        var error = assertThrows(BusinessException.class, this::check);
        assertEquals("REGISTRATION_BILLING_UNSETTLED", error.code());
    }

    @Test void expiredAbandonedPendingIntentDoesNotBlockOwnCompletion() {
        unsettled(intent(99L, Instant.now().minusSeconds(60), RegistrationBillingIntentStatus.PAYMENT_PENDING),
                intent(SLOT_HOLD, Instant.now().plusSeconds(600), RegistrationBillingIntentStatus.COMPLETING));
        assertDoesNotThrow(this::check);
    }

    @Test void onlyExpiredPendingIntentsAllowRegistration() {
        unsettled(intent(99L, Instant.now().minusSeconds(60), RegistrationBillingIntentStatus.PAYMENT_PENDING));
        assertDoesNotThrow(this::check);
    }

    @Test void unexpiredPendingIntentStillBlocks() {
        unsettled(intent(99L, Instant.now().plusSeconds(600), RegistrationBillingIntentStatus.PAYMENT_PENDING),
                intent(SLOT_HOLD, null, RegistrationBillingIntentStatus.COMPLETING));
        assertBlocked();
    }

    @Test void pendingIntentWithoutExpiryStillBlocks() {
        unsettled(intent(99L, null, RegistrationBillingIntentStatus.PAYMENT_PENDING));
        assertBlocked();
    }

    @Test void expiryDoesNotReleasePaidOrCompletingOrFailedIntents() {
        for (var status : List.of(RegistrationBillingIntentStatus.PAID, RegistrationBillingIntentStatus.COMPLETION_FAILED,
                RegistrationBillingIntentStatus.COMPLETING)) {
            unsettled(intent(99L, Instant.now().minusSeconds(60), status));
            assertBlocked();
        }
    }

    @Test void ownCompletingIntentStillPassesAndOtherHoldBlocks() {
        unsettled(intent(SLOT_HOLD, null, RegistrationBillingIntentStatus.COMPLETING));
        assertDoesNotThrow(this::check);
        unsettled(intent(99L, null, RegistrationBillingIntentStatus.COMPLETING));
        assertBlocked();
    }
}
