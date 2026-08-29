package com.rhn.platform.integration.infrastructure;

import com.rhn.platform.integration.domain.ExternalMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExternalMessageRepository extends JpaRepository<ExternalMessage, Long> {
    Optional<ExternalMessage> findByIdAndTenantId(Long id, Long tenantId);
    Optional<ExternalMessage> findByTenantIdAndEndpointCodeAndDirectionAndBusinessMessageId(
            Long tenantId, String endpointCode, String direction, String businessMessageId);
    List<ExternalMessage> findTop100ByTenantIdAndOrganizationIdAndDepartmentIdAndEndpointCodeAndDirectionAndStatusOrderByCreatedAtAsc(
            Long tenantId, Long organizationId, Long departmentId, String endpointCode, String direction, String status);
    List<ExternalMessage> findTop100ByTenantIdAndOrganizationIdAndDepartmentIdAndEndpointCodeAndDirectionOrderByCreatedAtAsc(
            Long tenantId, Long organizationId, Long departmentId, String endpointCode, String direction);
}
