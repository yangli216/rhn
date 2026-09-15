package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.SupplierSupplyItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SupplierSupplyItemRepository extends JpaRepository<SupplierSupplyItem, Long> {
    Optional<SupplierSupplyItem> findByTenantIdAndSupplierIdAndCatalogItemIdAndPackageId(
            Long tenantId, Long supplierId, Long catalogItemId, Long packageId);
    List<SupplierSupplyItem> findByTenantIdAndSupplierIdOrderById(Long tenantId, Long supplierId);
}
