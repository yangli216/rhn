package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.WardMedicationReturnLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;

public interface WardMedicationReturnLineRepository extends JpaRepository<WardMedicationReturnLine, Long> {
    List<WardMedicationReturnLine> findByTenantIdAndReturnRequestIdOrderById(Long tenantId, Long requestId);
    List<WardMedicationReturnLine> findByTenantIdAndReturnRequestIdInOrderByReturnRequestIdAscIdAsc(
            Long tenantId, Collection<Long> requestIds);

    @Query("select coalesce(sum(line.requestedBaseQuantity), 0) from WardMedicationReturnLine line "
            + "join WardMedicationReturnRequest request on request.id = line.returnRequestId "
            + "and request.tenantId = line.tenantId "
            + "where line.tenantId = :tenantId and line.originalDispenseLineId = :dispenseLineId "
            + "and request.status in ('REQUESTED', 'IN_TRANSIT')")
    BigDecimal pendingBaseQuantity(@Param("tenantId") Long tenantId,
                                   @Param("dispenseLineId") Long dispenseLineId);
}
