package com.rhn.platform.dictionary.api;

import java.util.List;
import java.util.Map;

public interface DictionaryDirectory {
    List<DictionaryValue> resolveActiveItems(Long tenantId, String dictionaryCode);

    List<DictionaryValue> resolveActiveItems(Long tenantId, Long dictionaryId);

    List<DictionaryItemReference> resolveActiveItemReferences(Long tenantId, String dictionaryCode);

    /**
     * Resolves current display text for both active and inactive items. This is for presentation
     * of existing data; selection controls must continue to use {@link #resolveActiveItems}.
     */
    Map<String, String> resolveItemTexts(Long tenantId, String dictionaryCode);
}
