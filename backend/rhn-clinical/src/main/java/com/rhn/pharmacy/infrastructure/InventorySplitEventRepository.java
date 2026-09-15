package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventorySplitEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;

import java.util.List;

public interface InventorySplitEventRepository extends JpaRepository<InventorySplitEvent, Long> {
    List<InventorySplitEvent> findByTenantIdAndOpenPackageIdOrderByOccurredAtAscIdAsc(Long tenantId, Long openPackageId);

    @Query("select distinct e.openPackageId from InventorySplitEvent e where e.tenantId=:tenantId " +
            "and e.eventType='CONSUME' and e.sourceType='MEDICATION_DISPENSE' and e.sourceId=:dispenseId")
    List<Long> findConsumedPackageIds(@Param("tenantId") Long tenantId, @Param("dispenseId") Long dispenseId);

    @Query("select coalesce(sum(-e.quantityDelta), 0) from InventorySplitEvent e where e.tenantId=:tenantId " +
            "and e.openPackageId=:packageId and e.eventType='CONSUME' " +
            "and e.sourceType='MEDICATION_DISPENSE' and e.sourceId=:dispenseId")
    BigDecimal sumConsumed(@Param("tenantId") Long tenantId, @Param("packageId") Long packageId,
                           @Param("dispenseId") Long dispenseId);

    @Query("select coalesce(sum(e.quantityDelta), 0) from InventorySplitEvent e where e.tenantId=:tenantId " +
            "and e.openPackageId=:packageId and e.sourceType='MEDICATION_DISPENSE_RETURN' and e.sourceId=:dispenseId")
    BigDecimal sumReturned(@Param("tenantId") Long tenantId, @Param("packageId") Long packageId,
                           @Param("dispenseId") Long dispenseId);
}
