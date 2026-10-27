package com.rhn.platform.masterdata.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

public final class MedicationAliasViews {
    private MedicationAliasViews() {}

    public record MedicationAliasView(Long id, Long medicationId, @DictionaryBinding("BD_ALIAS_TYPE") String aliasType,
                                      String aliasName, boolean primaryAlias, String status) {}
}
