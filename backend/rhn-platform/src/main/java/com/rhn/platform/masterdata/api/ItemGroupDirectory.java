package com.rhn.platform.masterdata.api;

import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;

public interface ItemGroupDirectory {
    List<ItemGroupSnapshot> searchOrderableGroups(Long tenantId, Long organizationId,
                                                   String serviceType, String query, LocalDate at);

    record ItemGroupSnapshot(Long id, long revision, String code, String name, String groupType,
                             List<MemberSnapshot> members) {}

    record MemberSnapshot(Long catalogItemId, String code, String name, String serviceType,
                          BigDecimal quantity, String unitCode, String memberDescription, boolean requiredMember) {}
}
