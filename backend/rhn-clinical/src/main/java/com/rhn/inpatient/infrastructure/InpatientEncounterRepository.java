package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientEncounter;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface InpatientEncounterRepository extends JpaRepository<InpatientEncounter, Long> {
    Optional<InpatientEncounter> findByIdAndTenantId(Long id, Long tenantId);
    Optional<InpatientEncounter> findByTenantIdAndEpisodeId(Long tenantId, Long episodeId);
    List<InpatientEncounter> findByTenantIdAndEpisodeIdIn(Long tenantId, Collection<Long> episodeIds);
    List<InpatientEncounter> findByTenantIdAndIdIn(Long tenantId, Collection<Long> ids);
}
