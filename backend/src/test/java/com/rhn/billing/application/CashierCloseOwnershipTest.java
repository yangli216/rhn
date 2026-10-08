package com.rhn.billing.application;

import com.rhn.billing.infrastructure.*;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CashierCloseOwnershipTest {
    @Test void missing_work_department_is_rejected_before_calculation_or_writes() {
        var contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(10L, 11L, "test", "test", Set.of(),
                20L, null, "ORGANIZATION", Set.of(20L), Set.of()));
        var closes = mock(CashierCloseRepository.class);
        var lines = mock(CashierCloseLineRepository.class);
        var items = mock(CashierCloseItemRepository.class);
        var events = mock(CashierCloseEventRepository.class);
        var payments = mock(PaymentRepository.class);
        var users = mock(IdentityAccessDirectory.class);
        var service = new CashierCloseApplicationService(closes, lines, items, events, payments, users, contexts);
        assertThatThrownBy(() -> service.calculate(new CashierCloseApplicationService.CalculateCommand(
                "CLOSE-1", "CASHIER", Instant.now().minusSeconds(60), Instant.now(), List.of())))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.code()).isEqualTo("CASHIER_CLOSE_DEPARTMENT_REQUIRED"));
        verify(closes, never()).save(any());
        verifyNoInteractions(lines, items, events, payments, users);
    }
}
