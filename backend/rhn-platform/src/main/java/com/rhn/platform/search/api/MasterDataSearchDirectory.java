package com.rhn.platform.search.api;

import java.util.Collection;
import java.util.Set;

public interface MasterDataSearchDirectory {
    Set<Long> findMatchingTargetIds(String targetType, Long tenantId, Long organizationId,
                                    Long departmentId, String query);

    Set<Long> findMatchingTargetIds(String targetType, Long tenantId, Long organizationId,
                                    Long departmentId, String query, Collection<Long> candidateTargetIds);

    SearchPreference resolvePreference(Long tenantId, Long organizationId, Long departmentId);
}
