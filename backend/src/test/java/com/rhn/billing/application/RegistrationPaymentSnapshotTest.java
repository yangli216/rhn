package com.rhn.billing.application;

import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.RegistrationBillingIntent;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RegistrationPaymentSnapshotTest {
    private final RegistrationBillingIntentRepository intents = mock(RegistrationBillingIntentRepository.class);
    private final SettlementRepository settlements = mock(SettlementRepository.class);
    private final PaymentOrderRepository orders = mock(PaymentOrderRepository.class);
    private final RegistrationBillingIntent intent = mock(RegistrationBillingIntent.class);
    private final JpaRegistrationBillingDirectory directory = new JpaRegistrationBillingDirectory(intents, settlements, orders);

    @BeforeEach
    void setUp() {
        when(intents.findByTenantIdAndEncounterId(1L, 2L)).thenReturn(Optional.of(intent));
        when(intent.feeAmount()).thenReturn(BigDecimal.TEN);
        when(intent.settlementId()).thenReturn(null);
        when(intent.paymentOrderId()).thenReturn(null);
    }

    @Test
    void no_payment_order_does_not_imply_cash_or_a_settlement_responsibility_type() {
        assertUnknownPaymentMethod();
    }

    @Test
    void missing_linked_payment_order_does_not_imply_cash() {
        when(intent.paymentOrderId()).thenReturn(3L);
        when(orders.findByIdAndTenantId(3L, 1L)).thenReturn(Optional.empty());
        assertUnknownPaymentMethod();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n"})
    void absent_payment_code_is_not_replaced_by_cash(String missing) {
        paymentOrder(missing, "实际支付方式");
        var snapshot = directory.findPaymentSnapshotByEncounterId(1L, 2L).orElseThrow();
        assertThat(snapshot.paymentMethodCode()).isNull();
        assertThat(snapshot.paymentMethodName()).isEqualTo("实际支付方式");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n"})
    void absent_payment_name_is_not_replaced_by_a_settlement_responsibility_type(String missing) {
        paymentOrder("CUSTOM", missing);
        var snapshot = directory.findPaymentSnapshotByEncounterId(1L, 2L).orElseThrow();
        assertThat(snapshot.paymentMethodCode()).isEqualTo("CUSTOM");
        assertThat(snapshot.paymentMethodName()).isEqualTo("未记录");
    }

    @ParameterizedTest
    @CsvSource({"CASH,现金", "CUSTOM,机构自定义支付方式"})
    void recorded_payment_method_is_preserved(String code, String name) {
        paymentOrder(code, name);
        var snapshot = directory.findPaymentSnapshotByEncounterId(1L, 2L).orElseThrow();
        assertThat(snapshot.paymentMethodCode()).isEqualTo(code);
        assertThat(snapshot.paymentMethodName()).isEqualTo(name);
    }

    @Test
    void free_registration_keeps_the_existing_free_label_without_inventing_cash() {
        when(intent.feeAmount()).thenReturn(BigDecimal.ZERO);
        var snapshot = directory.findPaymentSnapshotByEncounterId(1L, 2L).orElseThrow();
        assertThat(snapshot.paymentMethodCode()).isNull();
        assertThat(snapshot.paymentMethodName()).isEqualTo("免收");
        assertThat(snapshot.payableAmount()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void payment_method_resolution_preserves_settlement_and_captured_amounts() {
        when(intent.settlementId()).thenReturn(4L);
        var settlement = mock(Settlement.class);
        when(settlements.findByIdAndTenantId(4L, 1L)).thenReturn(Optional.of(settlement));
        when(settlement.grossAmount()).thenReturn(new BigDecimal("12"));
        when(settlement.insuranceAmount()).thenReturn(new BigDecimal("2"));
        when(settlement.discountAmount()).thenReturn(BigDecimal.ONE);
        when(settlement.patientAmount()).thenReturn(new BigDecimal("9"));
        var order = paymentOrder("CUSTOM", "机构自定义支付方式");
        when(order.capturedAmount()).thenReturn(new BigDecimal("8"));

        var snapshot = directory.findPaymentSnapshotByEncounterId(1L, 2L).orElseThrow();
        assertThat(snapshot.totalFee()).isEqualByComparingTo("12");
        assertThat(snapshot.payableAmount()).isEqualByComparingTo("8");
        assertThat(snapshot.insuranceDeduction()).isEqualByComparingTo("2");
        assertThat(snapshot.discountAmount()).isEqualByComparingTo("1");
        assertThat(snapshot.paymentMethodCode()).isEqualTo("CUSTOM");
        assertThat(snapshot.paymentMethodName()).isEqualTo("机构自定义支付方式");
    }

    private void assertUnknownPaymentMethod() {
        var snapshot = directory.findPaymentSnapshotByEncounterId(1L, 2L).orElseThrow();
        assertThat(snapshot.paymentMethodCode()).isNull();
        assertThat(snapshot.paymentMethodName()).isEqualTo("未记录");
        assertThat(snapshot.totalFee()).isEqualByComparingTo(BigDecimal.TEN);
        assertThat(snapshot.payableAmount()).isEqualByComparingTo(BigDecimal.TEN);
    }

    private PaymentOrder paymentOrder(String code, String name) {
        when(intent.paymentOrderId()).thenReturn(3L);
        var order = mock(PaymentOrder.class);
        when(orders.findByIdAndTenantId(3L, 1L)).thenReturn(Optional.of(order));
        when(order.paymentMethodCode()).thenReturn(code);
        when(order.paymentMethodNameSnapshot()).thenReturn(name);
        return order;
    }
}
