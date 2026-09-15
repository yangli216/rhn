package com.rhn.platform.dictionary.api;

import com.rhn.platform.dictionary.domain.DictionaryCodePolicy;

/** Public dictionary-code contract for modules that bind fields to ordinary dictionaries. */
public final class DictionaryCodes {
    private DictionaryCodes() {
    }

    public static String require(String value) {
        return DictionaryCodePolicy.requireDictionaryCode(value);
    }
}
