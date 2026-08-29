package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.Practitioner;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PractitionerRepository extends JpaRepository<Practitioner, Long> {
    Optional<Practitioner> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Practitioner> findByTenantIdAndCode(Long tenantId, String code);
    List<Practitioner> findByTenantIdOrderByCode(Long tenantId);
}
