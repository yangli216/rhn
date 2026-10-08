package com.rhn.billing.application;

import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CashierCloseActualAmountsTest {
    final CashierCloseRepository closes = mock(CashierCloseRepository.class);
    final CashierCloseLineRepository lines = mock(CashierCloseLineRepository.class);
    final CashierCloseItemRepository items = mock(CashierCloseItemRepository.class);
    final CashierCloseEventRepository events = mock(CashierCloseEventRepository.class);
    final PaymentRepository payments = mock(PaymentRepository.class);
    final IdentityAccessDirectory users = mock(IdentityAccessDirectory.class);
    final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    final List<CashierCloseLine> savedLines = new ArrayList<>();
    final Instant from = Instant.parse("2026-10-03T00:00:00Z");
    final Instant to = from.plusSeconds(3600);
    CashierClose saved;
    CashierCloseApplicationService service;

    @BeforeEach void setup() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(10L, 11L, "test", "test", Set.of(),
                20L, 30L, "DEPARTMENT", Set.of(20L), Set.of(30L)));
        when(users.lockAccount(10L, 11L)).thenReturn(true);
        when(closes.save(any())).thenAnswer(call -> saved = call.getArgument(0));
        when(lines.save(any())).thenAnswer(call -> { CashierCloseLine line = call.getArgument(0); savedLines.add(line); return line; });
        when(lines.findByTenantIdAndCashierCloseIdOrderByLineNo(anyLong(), anyLong())).thenAnswer(call -> savedLines);
        service = new CashierCloseApplicationService(closes, lines, items, events, payments, users, contexts);
    }

    Payment payment(String method, String type, String amount) {
        return new Payment(10L, 20L, 30L, 40L, null, 50L, "PAY-1", type, method, "TEST",
                new BigDecimal(amount), "CNY", from.plusSeconds(5), "EXT-1", null, 11L, "test");
    }
    void eligible(Payment... values) {
        when(payments.findUnclosedForCashier(10L, 20L, 11L, "T1", from, to)).thenReturn(List.of(values));
    }
    CashierCloseApplicationService.ActualAmount actual(String method, String type, String amount) {
        return new CashierCloseApplicationService.ActualAmount(method, type, new BigDecimal(amount));
    }
    CashierCloseApplicationService.CalculateCommand command(CashierCloseApplicationService.ActualAmount... amounts) {
        return new CashierCloseApplicationService.CalculateCommand("CLOSE-1", "T1", from, to, List.of(amounts));
    }

    @Test void non_cash_cannot_silently_copy_the_book_amount() {
        eligible(payment("WECHAT", "PAYMENT", "100"));
        assertThatThrownBy(() -> service.calculate(command())).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.code()).isEqualTo("CASHIER_CLOSE_ACTUAL_REQUIRED"));
        verify(closes, never()).save(any());
        verifyNoInteractions(items, events);
    }

    @Test void declared_non_cash_amount_and_cash_without_book_transactions_are_preserved() {
        eligible(payment("WECHAT", "PAYMENT", "100"));
        var value = service.calculate(command(actual("WECHAT", "PAYMENT", "95"), actual("CASH", "PAYMENT", "3")));
        assertThat(value.expectedAmount()).isEqualByComparingTo("100");
        assertThat(value.actualAmount()).isEqualByComparingTo("98");
        assertThat(value.differenceAmount()).isEqualByComparingTo("-2");
        assertThat(value.lines()).hasSize(2);
        assertThat(value.lines().get(1).transactionCount()).isZero();
        assertThat(value.lines().get(1).differenceAmount()).isEqualByComparingTo("3");
    }

    @Test void offsetting_line_differences_still_require_an_explanation() {
        eligible(payment("WECHAT", "PAYMENT", "100"), payment("CASH", "PAYMENT", "50"));
        var value = service.calculate(command(actual("WECHAT", "PAYMENT", "95"), actual("CASH", "PAYMENT", "55")));
        assertThat(value.differenceAmount()).isZero();
        when(closes.lockByIdAndTenantId(value.id(), 10L)).thenReturn(Optional.of(saved));
        assertThatThrownBy(() -> service.confirm(value.id(), new CashierCloseApplicationService.ConfirmCommand("CONFIRM", null)))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.code()).isEqualTo("CASHIER_CLOSE_DIFFERENCE_REASON_REQUIRED"));
        assertThat(service.confirm(value.id(), new CashierCloseApplicationService.ConfirmCommand("CONFIRM", "渠道归属待核查")).status())
                .isEqualTo("CONFIRMED");
    }

    @Test void invalid_payment_and_refund_signs_are_rejected() {
        eligible();
        for (var amount : List.of(actual("CASH", "PAYMENT", "-1"), actual("WECHAT", "REFUND", "1"))) {
            assertThatThrownBy(() -> service.calculate(command(amount))).isInstanceOfSatisfying(BusinessException.class,
                    error -> assertThat(error.code()).isEqualTo("CASHIER_CLOSE_ACTUAL_INVALID"));
        }
        verify(closes, never()).save(any());
    }

    @Test void preview_is_scoped_read_only_and_reports_signed_book_amounts() {
        eligible(payment("WECHAT", "PAYMENT", "100"), payment("WECHAT", "REFUND", "20"));
        var preview = service.preview("T1", from, to);
        assertThat(preview.transactionCount()).isEqualTo(2);
        assertThat(preview.lines().get(1).expectedAmount()).isEqualByComparingTo("-20");
        verify(payments).findUnclosedForCashier(10L, 20L, 11L, "T1", from, to);
        verifyNoInteractions(closes, lines, items, events, users);
    }

    @Test void replay_cannot_expose_another_organizations_close() {
        eligible(payment("WECHAT", "PAYMENT", "100"));
        service.calculate(command(actual("WECHAT", "PAYMENT", "95")));
        when(closes.findByTenantIdAndCommandCode(10L, "CLOSE-1")).thenReturn(Optional.of(saved));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(10L, 11L, "test", "test", Set.of(),
                99L, 98L, "DEPARTMENT", Set.of(99L), Set.of(98L)));
        assertThatThrownBy(() -> service.calculate(command(actual("WECHAT", "PAYMENT", "95"))))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.code()).isEqualTo("CASHIER_CLOSE_FORBIDDEN"));
    }

    @Test void replay_cannot_replace_or_omit_declared_amounts() {
        eligible(payment("WECHAT", "PAYMENT", "100"));
        service.calculate(command(actual("WECHAT", "PAYMENT", "95")));
        when(closes.findByTenantIdAndCommandCode(10L, "CLOSE-1")).thenReturn(Optional.of(saved));
        assertThat(service.calculate(command(actual("WECHAT", "PAYMENT", "95"))).duplicate()).isTrue();
        assertThatThrownBy(() -> service.calculate(command(actual("WECHAT", "PAYMENT", "100"))))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.code()).isEqualTo("CASHIER_CLOSE_COMMAND_REUSED"));
    }
}
