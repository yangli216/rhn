package com.rhn.platform.dictionary.api;

import java.util.List;

/**
 * A module's code-defined closed value sets (statuses, types) published as system enums, so responses translate them
 * through {@link DictionaryBinding} and screens never keep their own Chinese copies. Codes are globally unique; build
 * each definition with {@link SystemEnumDefinition#of} so it is checked against the Java enum or for duplicates.
 */
public interface SystemEnumContribution {
    List<SystemEnumDefinition> systemEnums();
}
