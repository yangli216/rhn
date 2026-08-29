package com.rhn.platform.dictionary.translation;

import java.lang.reflect.Array;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

record DictionaryTranslationContext(Map<String, Map<String, String>> dictionaries) {
    DictionaryTranslationContext {
        dictionaries = Map.copyOf(dictionaries);
    }

    Object translate(String dictionaryCode, Object value) {
        if (value == null) return null;
        if (value instanceof Iterable<?> iterable) {
            List<String> result = new ArrayList<>();
            iterable.forEach(item -> result.add(translateOne(dictionaryCode, item)));
            return List.copyOf(result);
        }
        if (value.getClass().isArray()) {
            List<String> result = new ArrayList<>();
            for (int index = 0; index < Array.getLength(value); index++) {
                result.add(translateOne(dictionaryCode, Array.get(value, index)));
            }
            return List.copyOf(result);
        }
        return translateOne(dictionaryCode, value);
    }

    private String translateOne(String dictionaryCode, Object value) {
        String code = DictionaryTranslationCollector.codeOf(value);
        return dictionaries.getOrDefault(dictionaryCode, Map.of()).getOrDefault(code, code);
    }
}
