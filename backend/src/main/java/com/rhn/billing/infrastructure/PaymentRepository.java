package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Payment> findByTenantIdAndPaymentNo(Long tenantId, String paymentNo);
    List<Payment> findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(Long tenantId, Long accountId);

    @Query("""
            select coalesce(sum(case when p.paymentType = 'PAYMENT' then p.amount else -p.amount end), 0)
              from Payment p where p.tenantId = :tenantId and p.invoiceId = :invoiceId
            """)
    BigDecimal netPaidForInvoice(@Param("tenantId") Long tenantId, @Param("invoiceId") Long invoiceId);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p where p.tenantId = :tenantId
              and p.reversesPaymentId = :paymentId and p.paymentType = 'REFUND'
            """)
    BigDecimal refundedForPayment(@Param("tenantId") Long tenantId, @Param("paymentId") Long paymentId);

    @Query("""
            select p from Payment p where p.tenantId = :tenantId and p.patientAccountId in :accountIds
              and p.paidAt >= :from and p.paidAt < :to order by p.paidAt, p.id
            """)
    List<Payment> findDaily(@Param("tenantId") Long tenantId, @Param("accountIds") List<Long> accountIds,
                            @Param("from") Instant from, @Param("to") Instant to);
}
