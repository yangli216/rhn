package com.rhn.platform.dictionary.api;

import java.util.List;
import java.util.Optional;

public interface SystemEnumDirectory {
    List<SystemEnumDefinition> listSystemEnums();

    Optional<SystemEnumDefinition> findSystemEnum(String code);

    default boolean isSystemEnumCode(String code) {
        return findSystemEnum(code).isPresent();
    }
}
