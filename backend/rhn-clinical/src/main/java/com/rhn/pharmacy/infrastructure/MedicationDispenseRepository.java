package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.MedicationDispense;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.time.Instant;

public interface MedicationDispenseRepository extends JpaRepository<MedicationDispense, Long> {
    Optional<MedicationDispense> findByTenantIdAndDispenseNo(Long tenantId, String dispenseNo);
    Optional<MedicationDispense> findByIdAndTenantId(Long id, Long tenantId);
    List<MedicationDispense> findByTenantIdAndIdIn(Long tenantId, java.util.Collection<Long> ids);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from MedicationDispense d where d.tenantId = :tenantId and d.id in :ids")
    List<MedicationDispense> lockByIdIn(@Param("tenantId") Long tenantId, @Param("ids") java.util.Collection<Long> ids);
    List<MedicationDispense> findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(Long tenantId, Long taskId);
    List<MedicationDispense> findByTenantIdAndTaskIdInOrderByOccurredAtAscIdAsc(Long tenantId,
                                                                               java.util.Collection<Long> taskIds);
    List<MedicationDispense> findByTenantIdAndEncounterIdOrderByOccurredAtAscIdAsc(Long tenantId, Long encounterId);

    @Query("""
            select d from MedicationDispense d join StockSite s
              on s.id = d.stockSiteId and s.tenantId = d.tenantId
             where d.tenantId = :tenantId and s.organizationId = :organizationId
               and d.occurredAt >= :from and d.occurredAt < :to
             order by d.occurredAt, d.id
            """)
    List<MedicationDispense> findDaily(@Param("tenantId") Long tenantId,
                                       @Param("organizationId") Long organizationId,
                                       @Param("from") Instant from, @Param("to") Instant to);

    @Query("""
            select d from MedicationDispense d join StockSite s
              on s.id = d.stockSiteId and s.tenantId = d.tenantId
             where d.tenantId = :tenantId and s.organizationId = :organizationId
               and d.encounterId in :encounterIds
             order by d.occurredAt, d.id
            """)
    List<MedicationDispense> findByEncounterIds(@Param("tenantId") Long tenantId,
                                                @Param("organizationId") Long organizationId,
                                                @Param("encounterIds") java.util.Collection<Long> encounterIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from MedicationDispense d where d.id = :id and d.tenantId = :tenantId")
    Optional<MedicationDispense> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
