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
    Optional<Payment> findByTenantIdAndPaymentOrderId(Long tenantId, Long paymentOrderId);
    List<Payment> findByTenantIdAndPatientAccountIdOrderByPaidAtAscIdAsc(Long tenantId, Long accountId);

    @Query("""
            select coalesce(sum(case when p.paymentType = 'PAYMENT' then p.amount else -p.amount end), 0) from Payment p where p.tenantId = :tenantId and p.invoiceId = :invoiceId
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

    @Query("""
            select payment from Payment payment
              join PatientAccount account
                on account.tenantId = payment.tenantId and account.id = payment.patientAccountId
              join PaymentOrder paymentOrder
                on paymentOrder.tenantId = payment.tenantId and paymentOrder.id = payment.paymentOrderId
             where payment.tenantId = :tenantId
               and account.organizationId = :organizationId
               and payment.enteredBy = :cashierUserId
               and paymentOrder.terminalCode = :terminalCode
               and payment.status = 'COMPLETED'
               and payment.paidAt >= :rangeFrom and payment.paidAt < :rangeTo
               and not exists (select item.id from CashierCloseItem item
                                where item.tenantId = payment.tenantId and item.paymentId = payment.id)
             order by payment.paidAt, payment.id
            """)
    List<Payment> findUnclosedForCashier(@Param("tenantId") Long tenantId,
                                         @Param("organizationId") Long organizationId,
                                         @Param("cashierUserId") Long cashierUserId,
                                         @Param("terminalCode") String terminalCode,
                                         @Param("rangeFrom") Instant rangeFrom,
                                         @Param("rangeTo") Instant rangeTo);

    @Query("""
            select payment from Payment payment join PatientAccount account
              on account.tenantId = payment.tenantId and account.id = payment.patientAccountId
             where payment.tenantId = :tenantId and account.organizationId = :organizationId
               and payment.paymentMethodCode = :paymentMethodCode and payment.currencyCode = :currencyCode
               and payment.status = 'COMPLETED' and payment.paidAt >= :rangeFrom and payment.paidAt < :rangeTo
             order by payment.paidAt, payment.id
            """)
    List<Payment> findForChannelReconciliation(@Param("tenantId") Long tenantId,
                                               @Param("organizationId") Long organizationId,
                                               @Param("paymentMethodCode") String paymentMethodCode,
                                               @Param("currencyCode") String currencyCode,
                                               @Param("rangeFrom") Instant rangeFrom,
                                               @Param("rangeTo") Instant rangeTo);
}
