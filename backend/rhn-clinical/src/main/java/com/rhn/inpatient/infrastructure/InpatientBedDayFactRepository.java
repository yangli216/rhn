package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientBedDayFact;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface InpatientBedDayFactRepository extends JpaRepository<InpatientBedDayFact, Long> {
    Optional<InpatientBedDayFact> findByTenantIdAndEpisodeIdAndBusinessDate(
            Long tenantId, Long episodeId, LocalDate businessDate);

    Optional<InpatientBedDayFact> findByTenantIdAndCommandCode(Long tenantId, String commandCode);

    List<InpatientBedDayFact> findByTenantIdAndEpisodeIdOrderByBusinessDateAscIdAsc(
            Long tenantId, Long episodeId);
}
