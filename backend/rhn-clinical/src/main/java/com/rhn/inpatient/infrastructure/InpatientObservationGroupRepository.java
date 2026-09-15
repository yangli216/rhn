package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientObservationGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface InpatientObservationGroupRepository extends JpaRepository<InpatientObservationGroup, Long> {
    Optional<InpatientObservationGroup> findByTenantIdAndCommandCode(Long tenantId, String commandCode);

    List<InpatientObservationGroup>
    findByTenantIdAndEpisodeIdAndMeasuredAtGreaterThanEqualAndMeasuredAtLessThanOrderByMeasuredAtAscIdAsc(
            Long tenantId, Long episodeId, Instant from, Instant to);
}
