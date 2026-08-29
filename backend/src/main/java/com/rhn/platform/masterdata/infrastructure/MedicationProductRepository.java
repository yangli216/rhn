package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.MedicationProduct;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MedicationProductRepository extends JpaRepository<MedicationProduct, Long> {
    List<MedicationProduct> findByTenantIdAndItemTypeOrderByName(Long tenantId, String itemType);
    List<MedicationProduct> findByTenantIdAndMedicationIdIn(Long tenantId, Collection<Long> medicationIds);
    Optional<MedicationProduct> findByIdAndTenantIdAndItemType(Long id, Long tenantId, String itemType);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
}
