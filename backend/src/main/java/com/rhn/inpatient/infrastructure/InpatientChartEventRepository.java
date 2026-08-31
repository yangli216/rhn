package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientChartEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface InpatientChartEventRepository extends JpaRepository<InpatientChartEvent, Long> {
    Optional<InpatientChartEvent> findByTenantIdAndCommandCode(Long tenantId, String commandCode);

    List<InpatientChartEvent>
    findByTenantIdAndEpisodeIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThanOrderByOccurredAtAscIdAsc(
            Long tenantId, Long episodeId, Instant from, Instant to);
}
