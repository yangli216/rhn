package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemAttributeChange;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ItemAttributeChangeRepository extends JpaRepository<ItemAttributeChange, Long> {
    Optional<ItemAttributeChange> findByRequestCode(String requestCode);

    List<ItemAttributeChange> findTop100ByTenantIdAndAttributeSubjectIdOrderByChangedAtDesc(
            Long tenantId, Long attributeSubjectId);

    List<ItemAttributeChange> findTop100ByTenantIdAndTargetTypeInOrderByChangedAtDesc(
            Long tenantId, List<String> targetTypes);
}
