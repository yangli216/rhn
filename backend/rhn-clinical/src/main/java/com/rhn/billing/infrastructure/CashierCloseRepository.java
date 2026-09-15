package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.CashierClose;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CashierCloseRepository extends JpaRepository<CashierClose, Long> {
    Optional<CashierClose> findByIdAndTenantId(Long id, Long tenantId);
    Optional<CashierClose> findByTenantIdAndCommandCode(Long tenantId, String commandCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from CashierClose value where value.id = :id and value.tenantId = :tenantId")
    Optional<CashierClose> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    @Query("""
            select value from CashierClose value
             where value.tenantId = :tenantId and value.organizationId = :organizationId
               and value.cashierUserId = :cashierUserId and value.terminalCode = :terminalCode
               and value.status in ('CALCULATED', 'CONFIRMED')
               and value.rangeFrom < :rangeTo and value.rangeTo > :rangeFrom
            """)
    List<CashierClose> findOverlapping(@Param("tenantId") Long tenantId,
                                       @Param("organizationId") Long organizationId,
                                       @Param("cashierUserId") Long cashierUserId,
                                       @Param("terminalCode") String terminalCode,
                                       @Param("rangeFrom") Instant rangeFrom,
                                       @Param("rangeTo") Instant rangeTo);

    List<CashierClose> findTop100ByTenantIdAndOrganizationIdAndCashierUserIdOrderByCreatedAtDesc(
            Long tenantId, Long organizationId, Long cashierUserId);
}
