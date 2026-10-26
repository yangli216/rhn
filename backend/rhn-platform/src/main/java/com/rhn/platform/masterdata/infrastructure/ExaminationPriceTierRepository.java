package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ExaminationPriceTier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExaminationPriceTierRepository extends JpaRepository<ExaminationPriceTier, Long> {
    List<ExaminationPriceTier> findByTenantIdAndCatalogItemIdOrderBySiteFromAsc(Long tenantId, Long catalogItemId);
}
