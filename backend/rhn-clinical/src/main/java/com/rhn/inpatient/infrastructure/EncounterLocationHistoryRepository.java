package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.EncounterLocationHistory;
import com.rhn.inpatient.domain.EncounterLocationHistoryStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface EncounterLocationHistoryRepository extends JpaRepository<EncounterLocationHistory, Long> {
    Optional<EncounterLocationHistory> findFirstByTenantIdAndEncounterIdAndStatusOrderByStartAtDesc(
            Long tenantId, Long encounterId, EncounterLocationHistoryStatus status);
    List<EncounterLocationHistory> findByTenantIdAndEncounterIdOrderByStartAtAscIdAsc(
            Long tenantId, Long encounterId);
}
