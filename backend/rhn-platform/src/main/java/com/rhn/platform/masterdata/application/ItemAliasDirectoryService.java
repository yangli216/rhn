package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ItemAliasDirectory;
import com.rhn.platform.masterdata.infrastructure.ItemAliasRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

@Service
public class ItemAliasDirectoryService implements ItemAliasDirectory {
    private final ItemAliasRepository aliases;

    public ItemAliasDirectoryService(ItemAliasRepository aliases) {
        this.aliases = aliases;
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> findActiveServiceIdsByAlias(Long tenantId, String aliasName) {
        if (tenantId == null || aliasName == null || aliasName.isBlank()) return Set.of();
        return aliases.findActiveTargetIdsByAlias(tenantId, aliasName.trim());
    }
}
