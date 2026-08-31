package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.WardMedicationReturnEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WardMedicationReturnEventRepository extends JpaRepository<WardMedicationReturnEvent, Long> {
    Optional<WardMedicationReturnEvent> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
    List<WardMedicationReturnEvent> findByTenantIdAndReturnRequestIdOrderByOccurredAtAscIdAsc(
            Long tenantId, Long requestId);
}
