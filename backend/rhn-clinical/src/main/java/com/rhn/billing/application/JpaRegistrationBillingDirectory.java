package com.rhn.billing.application;

import com.rhn.platform.printing.api.RegistrationBillingDirectory;
import com.rhn.billing.domain.PaymentOrder;
import com.rhn.billing.domain.RegistrationBillingIntent;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.billing.infrastructure.RegistrationBillingIntentRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class JpaRegistrationBillingDirectory implements RegistrationBillingDirectory {

    private final RegistrationBillingIntentRepository intents;
    private final SettlementRepository settlements;
    private final PaymentOrderRepository paymentOrders;

    public JpaRegistrationBillingDirectory(RegistrationBillingIntentRepository intents,
                                          SettlementRepository settlements,
                                          PaymentOrderRepository paymentOrders) {
        this.intents = intents;
        this.settlements = settlements;
        this.paymentOrders = paymentOrders;
    }

    @Override
    public Optional<RegistrationPaymentSnapshot> findPaymentSnapshotByEncounterId(Long tenantId, Long encounterId) {
        if (tenantId == null || encounterId == null) {
            return Optional.empty();
        }
        Optional<RegistrationBillingIntent> intentOpt = intents.findByTenantIdAndEncounterId(tenantId, encounterId);
        if (intentOpt.isEmpty()) {
            return Optional.empty();
        }
        RegistrationBillingIntent intent = intentOpt.get();
        BigDecimal totalFee = intent.feeAmount() != null ? intent.feeAmount() : BigDecimal.ZERO;
        BigDecimal payableAmount = totalFee;
        BigDecimal insuranceDeduction = BigDecimal.ZERO;
        BigDecimal discountAmount = BigDecimal.ZERO;
        String paymentMethodCode = "CASH";
        String paymentMethodName = "自费/医保";

        if (intent.settlementId() != null) {
            Settlement settlement = settlements.findByIdAndTenantId(intent.settlementId(), tenantId).orElse(null);
            if (settlement != null) {
                if (settlement.grossAmount() != null) {
                    totalFee = settlement.grossAmount();
                }
                if (settlement.insuranceAmount() != null) {
                    insuranceDeduction = settlement.insuranceAmount();
                }
                if (settlement.discountAmount() != null) {
                    discountAmount = settlement.discountAmount();
                }
                if (settlement.patientAmount() != null) {
                    payableAmount = settlement.patientAmount();
                }
            }
        }

        if (intent.paymentOrderId() != null) {
            PaymentOrder order = paymentOrders.findByIdAndTenantId(intent.paymentOrderId(), tenantId).orElse(null);
            if (order != null) {
                if (order.paymentMethodCode() != null) {
                    paymentMethodCode = order.paymentMethodCode();
                }
                if (order.paymentMethodNameSnapshot() != null && !order.paymentMethodNameSnapshot().isBlank()) {
                    paymentMethodName = order.paymentMethodNameSnapshot();
                }
                if (order.capturedAmount() != null && order.capturedAmount().signum() > 0) {
                    payableAmount = order.capturedAmount();
                }
            }
        }

        if (payableAmount.signum() == 0 && totalFee.signum() == 0) {
            paymentMethodName = "免收";
        }

        return Optional.of(new RegistrationPaymentSnapshot(
                totalFee,
                payableAmount,
                insuranceDeduction,
                discountAmount,
                paymentMethodCode,
                paymentMethodName
        ));
    }
}
