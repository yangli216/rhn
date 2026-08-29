package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ItemGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ItemGroupMemberRepository extends JpaRepository<ItemGroupMember, Long> {
    List<ItemGroupMember> findByTenantIdAndItemGroupIdOrderBySortOrder(Long tenantId, Long itemGroupId);
    void deleteByTenantIdAndItemGroupId(Long tenantId, Long itemGroupId);
}
