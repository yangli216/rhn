package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.PractitionerQualification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PractitionerQualificationRepository extends JpaRepository<PractitionerQualification, Long> {
    Optional<PractitionerQualification> findByTenantIdAndPractitionerId(Long tenantId, Long practitionerId);
    List<PractitionerQualification> findByTenantId(Long tenantId);
    List<PractitionerQualification> findByTenantIdAndPractitionerIdIn(Long tenantId,
                                                                     java.util.Collection<Long> practitionerIds);
}
