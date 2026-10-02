package com.rhn.platform.masterdata.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

public final class ItemAliasViews {
    private ItemAliasViews() {}

    public record ItemAliasView(Long id, Long catalogItemId, @DictionaryBinding("BD_ALIAS_TYPE") String aliasType, String aliasName,
                                boolean primaryAlias, String status) {}
}
