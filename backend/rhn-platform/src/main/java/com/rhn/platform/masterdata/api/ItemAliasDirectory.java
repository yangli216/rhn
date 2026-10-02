package com.rhn.platform.masterdata.api;

import java.util.Set;

public interface ItemAliasDirectory {
    Set<Long> findActiveServiceIdsByAlias(Long tenantId, String aliasName);
}
