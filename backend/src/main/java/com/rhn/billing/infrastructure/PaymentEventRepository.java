package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.PaymentEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentEventRepository extends JpaRepository<PaymentEvent, Long> {
    Optional<PaymentEvent> findByTenantIdAndPaymentOrderIdAndCommandCode(
            Long tenantId, Long paymentOrderId, String commandCode);
    List<PaymentEvent> findByTenantIdAndPaymentOrderIdOrderByOccurredAtAscIdAsc(
            Long tenantId, Long paymentOrderId);
}
