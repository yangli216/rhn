package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.SupplyItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SupplyItemRepository extends JpaRepository<SupplyItem, Long> {
    List<SupplyItem> findByTenantIdOrderByName(Long tenantId);
    Optional<SupplyItem> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
    boolean existsByTenantIdAndUdiDi(Long tenantId, String udiDi);
}
