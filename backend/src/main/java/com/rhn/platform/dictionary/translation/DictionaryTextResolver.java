package com.rhn.platform.dictionary.translation;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.platform.dictionary.api.SystemEnumItem;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
class DictionaryTextResolver {
    private final SystemEnumDirectory systemEnumDirectory;
    private final DictionaryDirectory dictionaryDirectory;
    private final DictionaryTextCache cache;

    DictionaryTextResolver(SystemEnumDirectory systemEnumDirectory,
                           DictionaryDirectory dictionaryDirectory,
                           DictionaryTextCache cache) {
        this.systemEnumDirectory = systemEnumDirectory;
        this.dictionaryDirectory = dictionaryDirectory;
        this.cache = cache;
    }

    DictionaryTranslationContext resolve(Long tenantId, Map<String, Set<String>> requests) {
        Map<String, Map<String, String>> resolved = new LinkedHashMap<>();
        requests.forEach((dictionaryCode, requestedCodes) -> {
            Map<String, String> dictionary = systemEnumDirectory.findSystemEnum(dictionaryCode)
                    .map(this::systemEnumTexts)
                    .orElseGet(() -> cache.get(tenantId, dictionaryCode,
                            () -> dictionaryDirectory.resolveItemTexts(tenantId, dictionaryCode)));
            Map<String, String> requested = requestedCodes.stream()
                    .filter(dictionary::containsKey)
                    .collect(Collectors.toUnmodifiableMap(Function.identity(), dictionary::get));
            resolved.put(dictionaryCode, requested);
        });
        return new DictionaryTranslationContext(resolved);
    }

    private Map<String, String> systemEnumTexts(SystemEnumDefinition definition) {
        return definition.items().stream().collect(Collectors.toUnmodifiableMap(
                SystemEnumItem::code, SystemEnumItem::name));
    }
}
