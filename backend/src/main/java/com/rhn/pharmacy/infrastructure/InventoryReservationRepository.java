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
    List<InventoryReservation> findByTenantIdAndDispenseTaskLineIdOrderByCreatedAt(
            Long tenantId, Long dispenseTaskLineId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from InventoryReservation r
            where r.tenantId = :tenantId and r.reservationGroupCode = :reservationGroupCode
              and r.status in ('ACTIVE', 'PARTIAL')
            order by r.createdAt, r.id
            """)
    List<InventoryReservation> lockActiveByReservationGroup(
            @Param("tenantId") Long tenantId,
            @Param("reservationGroupCode") String reservationGroupCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from InventoryReservation r
            where r.tenantId = :tenantId and r.dispenseTaskLineId = :dispenseTaskLineId
              and r.status in ('ACTIVE', 'PARTIAL')
            order by r.createdAt, r.id
            """)
    List<InventoryReservation> lockActiveByDispenseTaskLine(
            @Param("tenantId") Long tenantId,
            @Param("dispenseTaskLineId") Long dispenseTaskLineId);

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
            where r.tenantId = :tenantId and r.dispenseTaskLineId = :dispenseTaskLineId
              and r.status in ('ACTIVE', 'PARTIAL') and r.expiresAt <= :now
            order by r.createdAt, r.id
            """)
    List<InventoryReservation> lockDueByDispenseTaskLine(
            @Param("tenantId") Long tenantId,
            @Param("dispenseTaskLineId") Long dispenseTaskLineId,
            @Param("now") Instant now);

    @Query("""
            select distinct r.tenantId as tenantId, r.dispenseTaskLineId as dispenseTaskLineId from InventoryReservation r
            where r.reservationType = 'DISPENSE' and r.status in ('ACTIVE', 'PARTIAL')
              and r.expiresAt <= :now
            order by r.tenantId, r.dispenseTaskLineId
            """)
    List<DueReservationKey> findDueKeys(@Param("now") Instant now);

    interface DueReservationKey {
        Long getTenantId();
        Long getDispenseTaskLineId();
    }
}
