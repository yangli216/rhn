package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.MedicationRouteProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MedicationRouteProfileRepository extends JpaRepository<MedicationRouteProfile, Long> {
    Optional<MedicationRouteProfile> findByConceptId(Long conceptId);

    List<MedicationRouteProfile> findByConceptIdIn(Collection<Long> conceptIds);
}
