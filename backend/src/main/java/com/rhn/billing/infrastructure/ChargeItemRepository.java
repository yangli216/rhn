package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ChargeItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ChargeItemRepository extends JpaRepository<ChargeItem, Long> {
    Optional<ChargeItem> findByTenantIdAndSourceTypeAndSourceId(Long tenantId, String sourceType, Long sourceId);
    Optional<ChargeItem> findByIdAndTenantId(Long id, Long tenantId);
    List<ChargeItem> findByTenantIdAndReversesChargeItemIdOrderByOccurredAtAscIdAsc(Long tenantId,
                                                                                     Long reversesChargeItemId);
    List<ChargeItem> findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(Long tenantId, Long accountId);

    @Query("""
            select c from ChargeItem c where c.tenantId = :tenantId and c.patientAccountId = :accountId
              and not exists (select l.id from InvoiceLine l where l.tenantId = c.tenantId and l.chargeItemId = c.id)
            order by c.occurredAt, c.id
            """)
    List<ChargeItem> findUninvoiced(@Param("tenantId") Long tenantId, @Param("accountId") Long accountId);

    @Query("""
            select c from ChargeItem c where c.tenantId = :tenantId and c.patientAccountId in :accountIds
              and c.occurredAt >= :from and c.occurredAt < :to order by c.occurredAt, c.id
            """)
    List<ChargeItem> findDaily(@Param("tenantId") Long tenantId, @Param("accountIds") List<Long> accountIds,
                               @Param("from") Instant from, @Param("to") Instant to);
}
