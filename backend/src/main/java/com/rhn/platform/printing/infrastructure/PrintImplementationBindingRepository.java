package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintImplementationBinding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PrintImplementationBindingRepository extends JpaRepository<PrintImplementationBinding, Long> {
    List<PrintImplementationBinding> findByTaskDefinitionIdAndStatus(Long taskDefinitionId, String status);
    List<PrintImplementationBinding> findByStatusOrderByTaskDefinitionIdAscScopeTypeAsc(String status);
    Optional<PrintImplementationBinding> findByTaskDefinitionIdAndScopeTypeAndTenantIdAndOrganizationIdAndDepartmentIdAndPurpose(
            Long taskDefinitionId, String scopeType, Long tenantId, Long organizationId, Long departmentId, String purpose);
}
