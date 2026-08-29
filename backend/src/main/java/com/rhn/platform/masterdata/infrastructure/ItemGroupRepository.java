package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ItemGroupRepository extends JpaRepository<ItemGroup, Long> {
    List<ItemGroup> findByTenantIdOrderByName(Long tenantId);
    Optional<ItemGroup> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndOrganizationIdAndCode(Long tenantId, Long organizationId, String code);
}
