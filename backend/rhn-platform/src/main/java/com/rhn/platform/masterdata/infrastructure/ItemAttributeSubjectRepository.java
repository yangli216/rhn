package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemAttributeSubject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ItemAttributeSubjectRepository extends JpaRepository<ItemAttributeSubject, Long> {
    Optional<ItemAttributeSubject> findByTenantIdAndMedicationId(Long tenantId, Long medicationId);
    Optional<ItemAttributeSubject> findByTenantIdAndCatalogItemId(Long tenantId, Long catalogItemId);
    Optional<ItemAttributeSubject> findByTenantIdAndServiceVariantId(Long tenantId, Long serviceVariantId);
    Optional<ItemAttributeSubject> findByItemMasterId(Long itemMasterId);
}
