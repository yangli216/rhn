package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientEpisodeDetail;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface InpatientEpisodeDetailRepository extends JpaRepository<InpatientEpisodeDetail, Long> {
    Optional<InpatientEpisodeDetail> findByEpisodeIdAndTenantId(Long episodeId, Long tenantId);
}
