package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.PersonnelAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PersonnelAssignmentRepository extends JpaRepository<PersonnelAssignment, Long> {
    boolean existsByTenantIdAndCode(Long tenantId, String code);
    Optional<PersonnelAssignment> findByIdAndTenantId(Long id, Long tenantId);
    List<PersonnelAssignment> findByTenantIdAndEmploymentIdInOrderByValidFromDesc(
            Long tenantId, List<Long> employmentIds);
}
