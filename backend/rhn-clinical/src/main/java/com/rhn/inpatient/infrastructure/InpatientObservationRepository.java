package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientObservation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface InpatientObservationRepository extends JpaRepository<InpatientObservation, Long> {
    List<InpatientObservation> findByTenantIdAndObservationGroupIdInOrderByObservationGroupIdAscIdAsc(
            Long tenantId, Collection<Long> observationGroupIds);

    List<InpatientObservation> findByTenantIdAndObservationGroupIdOrderByIdAsc(
            Long tenantId, Long observationGroupId);
}
