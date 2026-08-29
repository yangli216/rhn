package com.rhn.platform.dictionary.translation;

record DictionaryFieldBinding(
        Class<?> ownerType,
        String propertyName,
        String textPropertyName,
        String dictionaryCode
) {
}
