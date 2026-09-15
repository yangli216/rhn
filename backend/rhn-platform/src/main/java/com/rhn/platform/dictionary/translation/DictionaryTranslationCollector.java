package com.rhn.platform.dictionary.translation;

import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.lang.reflect.Array;
import java.time.temporal.TemporalAccessor;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Component
class DictionaryTranslationCollector {
    private final DictionaryBindingRegistry registry;

    DictionaryTranslationCollector(DictionaryBindingRegistry registry) {
        this.registry = registry;
    }

    Map<String, Set<String>> collect(Object body) {
        Map<String, Set<String>> requests = new LinkedHashMap<>();
        Set<Object> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        visit(body, requests, visited);
        requests.replaceAll((ignored, values) -> Set.copyOf(values));
        return Map.copyOf(requests);
    }

    private void visit(Object value, Map<String, Set<String>> requests, Set<Object> visited) {
        if (value == null || isScalar(value.getClass()) || !visited.add(value)) return;
        if (value instanceof Optional<?> optional) {
            optional.ifPresent(item -> visit(item, requests, visited));
            return;
        }
        if (value instanceof Iterable<?> iterable) {
            iterable.forEach(item -> visit(item, requests, visited));
            return;
        }
        if (value instanceof Map<?, ?> map) {
            map.values().forEach(item -> visit(item, requests, visited));
            return;
        }
        if (value.getClass().isArray()) {
            if (value instanceof byte[]) return;
            for (int index = 0; index < Array.getLength(value); index++) {
                visit(Array.get(value, index), requests, visited);
            }
            return;
        }
        if (!isApplicationType(value.getClass())) return;
        for (DictionaryBindingRegistry.ResponseProperty property : registry.planFor(value.getClass()).properties()) {
            Object propertyValue = property.read(value);
            if (property.binding() != null) {
                Set<String> codes = requests.computeIfAbsent(property.binding().dictionaryCode(),
                        ignored -> new LinkedHashSet<>());
                collectCodes(propertyValue, codes);
            }
            visit(propertyValue, requests, visited);
        }
    }

    private void collectCodes(Object value, Set<String> target) {
        if (value == null) return;
        if (value instanceof Iterable<?> iterable) {
            iterable.forEach(item -> collectCodes(item, target));
            return;
        }
        if (value.getClass().isArray()) {
            for (int index = 0; index < Array.getLength(value); index++) {
                collectCodes(Array.get(value, index), target);
            }
            return;
        }
        target.add(codeOf(value));
    }

    static String codeOf(Object value) {
        if (value instanceof Enum<?> enumeration) return enumeration.name();
        if (value instanceof CharSequence sequence) return sequence.toString();
        throw new IllegalStateException("字典字段只支持字符串、枚举或它们的集合，实际类型为 "
                + value.getClass().getName());
    }

    private boolean isApplicationType(Class<?> type) {
        Package typePackage = type.getPackage();
        return typePackage != null && typePackage.getName().startsWith("com.rhn");
    }

    private boolean isScalar(Class<?> type) {
        return type.isPrimitive() || type.isEnum() || CharSequence.class.isAssignableFrom(type)
                || Number.class.isAssignableFrom(type) || Boolean.class == type || Character.class == type
                || TemporalAccessor.class.isAssignableFrom(type) || JsonNode.class.isAssignableFrom(type)
                || Class.class == type;
    }
}
