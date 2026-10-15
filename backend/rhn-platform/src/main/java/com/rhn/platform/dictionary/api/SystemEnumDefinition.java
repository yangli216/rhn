package com.rhn.platform.dictionary.api;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public record SystemEnumDefinition(
        String code,
        String name,
        String description,
        List<SystemEnumItem> items
) {
    public SystemEnumDefinition {
        items = List.copyOf(items);
    }

    /** Definition whose item codes must equal the constants of {@code enumType}. */
    public static <E extends Enum<E>> SystemEnumDefinition of(String code, String name, String description,
                                                               Class<E> enumType, List<SystemEnumItem> items) {
        Set<String> expected = Arrays.stream(enumType.getEnumConstants()).map(Enum::name)
                .collect(Collectors.toUnmodifiableSet());
        Set<String> actual = items.stream().map(SystemEnumItem::code).collect(Collectors.toUnmodifiableSet());
        if (items.size() != actual.size() || !expected.equals(actual)) {
            throw new IllegalStateException(code + " 与 " + enumType.getSimpleName() + " 定义不一致");
        }
        return new SystemEnumDefinition(code, name, description, items);
    }

    /** Definition of a value set without a Java enum (database check constraint or computed status). */
    public static SystemEnumDefinition of(String code, String name, String description, List<SystemEnumItem> items) {
        Set<String> codes = items.stream().map(SystemEnumItem::code).collect(Collectors.toUnmodifiableSet());
        if (items.isEmpty() || codes.size() != items.size()) {
            throw new IllegalStateException(code + " 存在空项或重复枚举编码");
        }
        return new SystemEnumDefinition(code, name, description, items);
    }

    /** Items numbered 10, 20, ... in the given order: {@code items("CODE", "名称", "说明", ...)}. */
    public static List<SystemEnumItem> items(String... codeNameDescription) {
        if (codeNameDescription.length % 3 != 0) throw new IllegalArgumentException("每项需要编码、名称和说明");
        List<SystemEnumItem> result = new ArrayList<>();
        for (int i = 0; i < codeNameDescription.length; i += 3) {
            result.add(new SystemEnumItem(codeNameDescription[i], codeNameDescription[i + 1],
                    codeNameDescription[i + 2], (i / 3 + 1) * 10));
        }
        return result;
    }
}
