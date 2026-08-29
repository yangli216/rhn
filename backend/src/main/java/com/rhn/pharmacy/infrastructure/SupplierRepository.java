package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SupplierRepository extends JpaRepository<Supplier, Long> {
    Optional<Supplier> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Supplier> findByTenantIdAndOrganizationIdAndCode(Long tenantId, Long organizationId, String code);
    List<Supplier> findByTenantIdAndOrganizationIdOrderByName(Long tenantId, Long organizationId);
}
