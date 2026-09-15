package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemTermMapping;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ItemTermMappingRepository extends JpaRepository<ItemTermMapping, Long> {
    List<ItemTermMapping> findByTenantIdAndAttributeSubjectIdOrderByValidFromDescCreatedAtDesc(
            Long tenantId, Long attributeSubjectId);
    Optional<ItemTermMapping> findByIdAndTenantId(Long id, Long tenantId);
}
