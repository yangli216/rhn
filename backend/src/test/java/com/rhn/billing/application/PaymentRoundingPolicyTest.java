package com.rhn.billing.application;

import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.platform.dictionary.api.DictionaryAttributeDirectory;
import com.rhn.platform.dictionary.api.DictionaryAttributeViews.ApplicableItemView;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentRoundingPolicyTest {
    final DictionaryAttributeDirectory attributes = mock(DictionaryAttributeDirectory.class);
    final PaymentOrderRepository orders = mock(PaymentOrderRepository.class);
    final PaymentRoundingPolicy policy = new PaymentRoundingPolicy(attributes, orders);
    final ExecutionContext context = new ExecutionContext(10L, 11L, "test", "test", Set.of(),
            20L, 30L, "DEPARTMENT", Set.of(20L), Set.of(30L));

    @BeforeEach void setup() { when(orders.activeRequestedForInvoice(10L, 40L)).thenReturn(BigDecimal.ZERO); }

    void configure(Map<String, String> values) {
        when(attributes.applicableItems(10L, 20L, 30L, "PAY_METHOD", "AVAILABLE_SCENE", "CASHIER"))
                .thenReturn(List.of(new ApplicableItemView(50L, "CASH", "现金", 1,
                        "AVAILABLE_SCENE", "CASHIER", "ORGANIZATION:20", values)));
    }
    void rule(String precision, String mode) { configure(Map.of("PAYMENT_PRECISION", precision, "ROUNDING_MODE", mode)); }
    BigDecimal apply(String outstanding, String payment, String delta, String current) {
        return policy.totalAdjustment(context, 40L, "CASH", "CASHIER", new BigDecimal(outstanding),
                new BigDecimal(payment), new BigDecimal(delta), new BigDecimal(current));
    }
    void fails(String code, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.code()).isEqualTo(code));
    }

    @Test void uses_scoped_configuration_and_unpaid_amount_without_double_rounding() {
        rule("0.1", "HALF_UP");
        assertThat(apply("1.049", "1", "-0.049", "0")).isEqualByComparingTo("-0.049");
        assertThat(apply("33.67", "33.7", "0.03", "0")).isEqualByComparingTo("0.03");
        rule("0.1", "HALF_EVEN_SIX");
        assertThat(apply("1.05", "1", "-0.05", "0")).isEqualByComparingTo("-0.05");
        assertThat(apply("1.050001", "1.1", "0.049999", "0")).isEqualByComparingTo("0.049999");
        rule("0.01", "FLOOR");
        assertThat(apply("1.009", "1", "-0.009", "0")).isEqualByComparingTo("-0.009");
    }

    @Test void rejects_missing_and_invalid_configuration_instead_of_defaulting() {
        for (var values : List.of(Map.<String, String>of(), Map.of("PAYMENT_PRECISION", "0.1"),
                Map.of("PAYMENT_PRECISION", "0.1junk", "ROUNDING_MODE", "FLOOR"),
                Map.of("PAYMENT_PRECISION", "0.1", "ROUNDING_MODE", "UNKNOWN"))) {
            configure(values);
            fails("PAYMENT_ROUNDING_CONFIG_INVALID", () -> apply("33.67", "33.6", "-0.07", "0"));
        }
    }

    @Test void rejects_arbitrary_adjustments_and_rounding_during_partial_payment() {
        rule("0.1", "FLOOR");
        for (String delta : List.of("0.03", "-10", "-0.08")) {
            fails("PAYMENT_ROUNDING_MISMATCH", () -> apply("33.67", "33.6", delta, "0"));
        }
        fails("PAYMENT_ROUNDING_FULL_PAYMENT_REQUIRED", () -> apply("33.67", "10", "-0.07", "0"));
    }

    @Test void adds_valid_delta_to_prior_adjustment_instead_of_overwriting_it() {
        rule("0.1", "FLOOR");
        assertThat(apply("13.66", "13.6", "-0.06", "0.03")).isEqualByComparingTo("-0.03");
    }

    @Test void rejects_changes_while_another_payment_is_pending() {
        rule("0.1", "FLOOR");
        when(orders.activeRequestedForInvoice(10L, 40L)).thenReturn(new BigDecimal("10"));
        fails("PAYMENT_ROUNDING_PENDING_ORDER", () -> apply("33.67", "33.6", "-0.07", "0"));
    }

    @Test void rejects_unrepresentable_adjustment_before_any_truncation() {
        rule("0.1", "FLOOR");
        fails("PAYMENT_ROUNDING_AMOUNT_INVALID", () -> apply("33.67", "33.6", "-0.0700001", "0"));
    }
}
