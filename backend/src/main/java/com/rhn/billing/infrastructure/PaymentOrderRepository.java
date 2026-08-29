package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.PaymentOrder;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface PaymentOrderRepository extends JpaRepository<PaymentOrder, Long> {
    Optional<PaymentOrder> findByIdAndTenantId(Long id, Long tenantId);
    Optional<PaymentOrder> findByTenantIdAndIdempotencyKey(Long tenantId, String idempotencyKey);
    Optional<PaymentOrder> findByTenantIdAndOrderNo(Long tenantId, String orderNo);
    List<PaymentOrder> findTop100ByTenantIdAndPatientAccountIdOrderByCreatedAtDesc(
            Long tenantId, Long patientAccountId);

    @Query("""
            select value from PaymentOrder value
              join PatientAccount account
                on account.tenantId = value.tenantId and account.id = value.patientAccountId
             where value.tenantId = :tenantId
               and account.organizationId = :organizationId
               and account.departmentId = :departmentId
               and value.status in ('PENDING', 'PROCESSING', 'REFUNDING', 'PARTIAL')
             order by value.updatedAt asc, value.id asc
            """)
    List<PaymentOrder> findRecoveryWorklist(@Param("tenantId") Long tenantId,
                                            @Param("organizationId") Long organizationId,
                                            @Param("departmentId") Long departmentId,
                                            Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from PaymentOrder value where value.id = :id and value.tenantId = :tenantId")
    Optional<PaymentOrder> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    @Query("""
            select coalesce(sum(value.requestedAmount - value.capturedAmount), 0)
              from PaymentOrder value
             where value.tenantId = :tenantId and value.invoiceId = :invoiceId
               and value.status in ('CREATED', 'PENDING', 'PROCESSING', 'PARTIAL')
            """)
    BigDecimal activeRequestedForInvoice(@Param("tenantId") Long tenantId,
                                         @Param("invoiceId") Long invoiceId);

    @Query("""
            select coalesce(sum(value.requestedAmount - value.refundedAmount), 0)
              from PaymentOrder value
             where value.tenantId = :tenantId and value.originalPaymentId = :paymentId
               and value.orderType = 'REFUND'
               and value.status in ('CREATED', 'PENDING', 'PROCESSING', 'REFUNDING', 'PARTIAL')
            """)
    BigDecimal activeRefundRequestedForPayment(@Param("tenantId") Long tenantId,
                                                @Param("paymentId") Long paymentId);
}
