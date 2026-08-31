package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientBedOccupancy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InpatientBedOccupancyRepository extends JpaRepository<InpatientBedOccupancy, Long> {
    List<InpatientBedOccupancy> findByTenantId(Long tenantId);
    Optional<InpatientBedOccupancy> findByTenantIdAndBedLocationId(Long tenantId, Long bedLocationId);
    Optional<InpatientBedOccupancy> findByTenantIdAndEpisodeId(Long tenantId, Long episodeId);
}
