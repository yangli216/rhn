package com.rhn.platform.terminology.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

public record ConceptAliasView(
        Long id,
        @DictionaryBinding("BD_ALIAS_TYPE") String sdAliasType,
        String name,
        String searchCode
) {}
