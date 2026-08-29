package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.Employment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EmploymentRepository extends JpaRepository<Employment, Long> {
    Optional<Employment> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
    List<Employment> findByTenantIdAndPractitionerIdOrderByHireDateDesc(Long tenantId, Long practitionerId);
}
