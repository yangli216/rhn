package com.rhn.platform.dictionary.api;

import java.util.List;
import java.util.Optional;

public interface SystemEnumDirectory {
    List<SystemEnumDefinition> listSystemEnums();

    Optional<SystemEnumDefinition> findSystemEnum(String code);

    default boolean isSystemEnumCode(String code) {
        return findSystemEnum(code).isPresent();
    }

    /** Whether {@code itemCode} is an item of system enum {@code code}; the enum is the single source of its values. */
    default boolean contains(String code, String itemCode) {
        return itemCode != null && findSystemEnum(code).stream()
                .flatMap(definition -> definition.items().stream())
                .anyMatch(item -> item.code().equals(itemCode));
    }
}
