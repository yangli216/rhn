package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryReservation;
import org.springframework.data.jpa.repository.JpaRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface InventoryReservationRepository extends JpaRepository<InventoryReservation, Long> {
    List<InventoryReservation> findByTenantIdAndReservationGroupCodeOrderByCreatedAt(
            Long tenantId, String reservationGroupCode);
    List<InventoryReservation> findByTenantIdAndRequestIdOrderByCreatedAt(Long tenantId, Long requestId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from InventoryReservation r
            where r.tenantId = :tenantId and r.requestId = :requestId
              and r.status in ('ACTIVE', 'PARTIAL')
            order by r.createdAt, r.id
            """)
    List<InventoryReservation> lockActiveByRequest(@Param("tenantId") Long tenantId,
                                                    @Param("requestId") Long requestId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from InventoryReservation r
            where r.tenantId = :tenantId and r.requestId = :requestId
              and r.status in ('ACTIVE', 'PARTIAL') and r.expiresAt <= :now
            order by r.createdAt, r.id
            """)
    List<InventoryReservation> lockDueByRequest(@Param("tenantId") Long tenantId,
                                                 @Param("requestId") Long requestId,
                                                 @Param("now") Instant now);

    @Query("""
            select distinct r.tenantId as tenantId, r.requestId as requestId
            from InventoryReservation r
            where r.reservationType = 'DISPENSE' and r.status in ('ACTIVE', 'PARTIAL')
              and r.expiresAt <= :now
            order by r.tenantId, r.requestId
            """)
    List<DueReservationKey> findDueKeys(@Param("now") Instant now);

    interface DueReservationKey {
        Long getTenantId();
        Long getRequestId();
    }
}
