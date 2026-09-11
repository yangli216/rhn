package com.rhn.billing.application;

import com.rhn.billing.api.PaymentResultDirectory.PaymentOrderView;
import com.rhn.billing.api.RefundBillingDirectory.RefundBillingSnapshot;
import com.rhn.billing.api.RefundPreCheckViews.DirectRefundCommand;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Payment;
import com.rhn.billing.domain.Receipt;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.PaymentRepository;
import com.rhn.billing.infrastructure.ReceiptRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DirectRefundApplicationServiceTest {

    private PaymentRepository payments;
    private PatientAccountRepository accounts;
    private ChargeItemRepository charges;
    private ChargeItemComponentRepository components;
    private LedgerEntryRepository ledger;
    private SettlementRepository settlements;
    private ReceiptRepository receipts;
    private PaymentOrchestrationService paymentOrchestration;
    private ReceiptApplicationService receiptService;
    private RefundPolicy refundPolicy;
    private ExecutionContextProvider contextProvider;

    private DirectRefundApplicationService service;
    private final ExecutionContext context = new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of());

    @BeforeEach
    void setUp() {
        payments = mock(PaymentRepository.class);
        accounts = mock(PatientAccountRepository.class);
        charges = mock(ChargeItemRepository.class);
        components = mock(ChargeItemComponentRepository.class);
        ledger = mock(LedgerEntryRepository.class);
        settlements = mock(SettlementRepository.class);
        receipts = mock(ReceiptRepository.class);
        paymentOrchestration = mock(PaymentOrchestrationService.class);
        receiptService = mock(ReceiptApplicationService.class);
        refundPolicy = mock(RefundPolicy.class);
        contextProvider = mock(ExecutionContextProvider.class);
        when(contextProvider.requireCurrent()).thenReturn(context);

        service = new DirectRefundApplicationService(
                payments, accounts, charges, components, ledger,
                settlements, receipts, paymentOrchestration, receiptService,
                refundPolicy, contextProvider);
    }

    @Test
    void whenPaymentNotFound_shouldThrow() {
        when(payments.findByIdAndTenantId(999L, 1L)).thenReturn(Optional.empty());
        assertThrows(BusinessException.class, () -> service.paymentContext(999L));
    }

    @Test
    void snapshotForEncounter_shouldExposeBillingFactsOnly() {
        Long encounterId = 200L;
        Long accountId = 10L;
        PatientAccount account = mock(PatientAccount.class);
        when(account.id()).thenReturn(accountId);
        when(account.organizationId()).thenReturn(1001L);
        when(account.currencyCode()).thenReturn("CNY");
        when(accounts.findByTenantIdAndEncounterIdIn(1L, List.of(encounterId))).thenReturn(List.of(account));

        ChargeItem charge = mock(ChargeItem.class);
        when(charge.id()).thenReturn(501L);
        when(charge.sourceType()).thenReturn("MEDICATION_REQUEST");
        when(charge.sourceId()).thenReturn(8001L);
        when(charge.requestCode()).thenReturn("REQ-001");
        when(charge.itemNameSnapshot()).thenReturn("阿莫西林");
        when(charge.itemCodeSnapshot()).thenReturn("MED01");
        when(charge.quantity()).thenReturn(new BigDecimal("2"));
        when(charge.unitCode()).thenReturn("盒");
        when(charge.totalAmount()).thenReturn(new BigDecimal("60.00"));
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, accountId))
                .thenReturn(List.of(charge));

        Payment payment = mock(Payment.class);
        when(payment.id()).thenReturn(100L);
        when(payment.paymentNo()).thenReturn("PAY-100");
        when(payment.paymentMethodCode()).thenReturn("WECHAT");
        when(payment.paymentType()).thenReturn("PAYMENT");
        when(payment.amount()).thenReturn(new BigDecimal("60.00"));
        when(payment.currencyCode()).thenReturn("CNY");
        when(payment.paidAt()).thenReturn(Instant.now());
        when(payments.findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(1L, accountId))
                .thenReturn(List.of(payment));
        when(payments.refundedForPayment(1L, 100L)).thenReturn(BigDecimal.ZERO);
        when(refundPolicy.isUnexecutedDirectRefundAllowed(any(), eq(1001L), any())).thenReturn(true);

        RefundBillingSnapshot snapshot = service.snapshotForEncounter(encounterId);

        assertEquals(accountId, snapshot.accountId());
        assertTrue(snapshot.unexecutedDirectRefundAllowed());
        assertEquals(new BigDecimal("60.00"), snapshot.totalPaidAmount());
        assertEquals(1, snapshot.charges().size());
        assertEquals("MEDICATION_REQUEST", snapshot.charges().get(0).sourceType());
        assertEquals(1, snapshot.refundablePayments().size());
    }

    @Test
    void executeDirectRefund_shouldReverseChargesAndRefundWithinBilling() {
        Long paymentId = 100L;
        Long encounterId = 200L;
        Long accountId = 10L;

        Payment payment = mock(Payment.class);
        when(payment.id()).thenReturn(paymentId);
        when(payment.paymentType()).thenReturn("PAYMENT");
        when(payment.patientAccountId()).thenReturn(accountId);
        when(payment.amount()).thenReturn(new BigDecimal("60.00"));
        when(payments.findByIdAndTenantId(paymentId, 1L)).thenReturn(Optional.of(payment));
        when(payments.refundedForPayment(1L, paymentId)).thenReturn(BigDecimal.ZERO);

        PatientAccount account = mock(PatientAccount.class);
        when(account.id()).thenReturn(accountId);
        when(account.encounterId()).thenReturn(encounterId);
        when(accounts.findByIdAndTenantId(accountId, 1L)).thenReturn(Optional.of(account));

        ChargeItem originalCharge = mock(ChargeItem.class);
        when(originalCharge.id()).thenReturn(501L);
        when(originalCharge.patientAccountId()).thenReturn(accountId);
        when(originalCharge.residentId()).thenReturn(300L);
        when(originalCharge.encounterId()).thenReturn(encounterId);
        when(originalCharge.catalogItemId()).thenReturn(9001L);
        when(originalCharge.sourceId()).thenReturn(8001L);
        when(originalCharge.requestCode()).thenReturn("REQ-001");
        when(originalCharge.quantity()).thenReturn(new BigDecimal("2"));
        when(originalCharge.unitCode()).thenReturn("盒");
        when(originalCharge.unitPrice()).thenReturn(new BigDecimal("30.00"));
        when(originalCharge.totalAmount()).thenReturn(new BigDecimal("60.00"));
        when(originalCharge.currencyCode()).thenReturn("CNY");
        when(originalCharge.itemCodeSnapshot()).thenReturn("MED01");
        when(originalCharge.itemNameSnapshot()).thenReturn("阿莫西林");
        when(charges.findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(1L, accountId))
                .thenReturn(List.of(originalCharge));
        when(charges.save(any(ChargeItem.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PaymentOrderView refundOrder = new PaymentOrderView(
                2001L, 1L, accountId, null, paymentId, "RPO-001",
                "IDEMP-1", "OUTPATIENT", "CASHIER",
                "WECHAT", "微信支付", "REFUND", "SUCCEEDED",
                new BigDecimal("60.00"), new BigDecimal("60.00"), BigDecimal.ZERO,
                "CNY", "EXT-REF-1", "CORR-1", "CASHIER",
                null, Instant.now(), Instant.now(), null, null, false, List.of());
        when(paymentOrchestration.refund(any())).thenReturn(refundOrder);

        Settlement settlement = mock(Settlement.class);
        when(settlement.id()).thenReturn(999L);
        when(settlements.findByTenantIdAndPatientAccountIdOrderByCreatedAtAscIdAsc(1L, accountId))
                .thenReturn(List.of(settlement));
        Receipt receipt = mock(Receipt.class);
        when(receipt.id()).thenReturn(888L);
        when(receipt.receiptType()).thenReturn("STANDARD");
        when(receipt.status()).thenReturn("ISSUED");
        when(receipts.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(1L, 999L))
                .thenReturn(List.of(receipt));
        when(receipts.findByTenantIdAndReversesReceiptId(1L, 888L)).thenReturn(Optional.empty());

        DirectRefundCommand command = new DirectRefundCommand(
                "IDEMP-1", new BigDecimal("60.00"), "患者退费", "CASHIER", List.of(501L));

        PaymentOrderView result = service.executeDirectRefund(paymentId, command);

        assertNotNull(result);
        assertEquals("RPO-001", result.orderNo());
        verify(charges, times(1)).save(any(ChargeItem.class));
        verify(ledger, times(1)).save(any());
        verify(paymentOrchestration, times(1)).refund(any());
        verify(receiptService, times(1)).redFlush(eq(888L), any(), eq("患者退费"), any());
    }
}
