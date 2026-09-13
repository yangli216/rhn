package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintDeviceBinding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PrintDeviceBindingRepository extends JpaRepository<PrintDeviceBinding, Long> {
    List<PrintDeviceBinding> findByTenantIdAndOrganizationIdAndDepartmentIdAndStatus(
            Long tenantId, Long organizationId, Long departmentId, String status);
    Optional<PrintDeviceBinding> findFirstByTenantIdAndOrganizationIdAndDepartmentIdAndDocumentTypeAndMediaProfileIdAndStatusOrderByDefaultDeviceDesc(
            Long tenantId, Long organizationId, Long departmentId, String documentType, Long mediaProfileId, String status);
    Optional<PrintDeviceBinding> findByTenantIdAndOrganizationIdAndDepartmentIdAndDocumentTypeAndMediaProfileId(
            Long tenantId, Long organizationId, Long departmentId, String documentType, Long mediaProfileId);
}
