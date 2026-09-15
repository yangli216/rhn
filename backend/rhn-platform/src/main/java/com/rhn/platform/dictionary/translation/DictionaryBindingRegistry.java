package com.rhn.platform.dictionary.translation;

import cn.hutool.core.text.NamingCase;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.dictionary.domain.DictionaryCodePolicy;
import org.springframework.stereotype.Component;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class DictionaryBindingRegistry {
    private static final String PREFIX = "sd";
    private static final String TEXT_SUFFIX = "Text";
    private final Map<Class<?>, ResponseTypePlan> plans = new ConcurrentHashMap<>();

    ResponseTypePlan planFor(Class<?> type) {
        return plans.computeIfAbsent(type, this::inspect);
    }

    public Map<String, String> textPropertiesFor(Class<?> type) {
        Map<String, String> result = new LinkedHashMap<>();
        for (DictionaryFieldBinding binding : planFor(type).bindings()) {
            result.put(binding.textPropertyName(), binding.dictionaryCode());
        }
        return Map.copyOf(result);
    }

    Optional<DictionaryFieldBinding> bindingFor(Class<?> ownerType, String propertyName,
                                                DictionaryBinding annotation) {
        if (annotation == null && !isConventionProperty(propertyName)) return Optional.empty();
        String dictionaryCode = annotation == null
                ? inferDictionaryCode(propertyName)
                : DictionaryCodePolicy.requireDictionaryCode(annotation.value());
        return Optional.of(new DictionaryFieldBinding(ownerType, propertyName,
                propertyName + TEXT_SUFFIX, dictionaryCode));
    }

    private ResponseTypePlan inspect(Class<?> type) {
        Map<String, ResponseProperty> properties = new LinkedHashMap<>();
        if (type.isRecord()) {
            for (RecordComponent component : type.getRecordComponents()) {
                Method accessor = component.getAccessor();
                String propertyName = jsonName(component.getName(), component.getAnnotation(JsonProperty.class),
                        accessor.getAnnotation(JsonProperty.class));
                DictionaryBinding annotation = component.getAnnotation(DictionaryBinding.class);
                if (annotation == null) annotation = accessor.getAnnotation(DictionaryBinding.class);
                properties.put(propertyName, property(type, propertyName, accessor, annotation));
            }
        } else {
            Arrays.stream(type.getMethods())
                    .filter(this::isReadableProperty)
                    .sorted(Comparator.comparing(Method::getName))
                    .forEach(accessor -> {
                        String inferredName = getterPropertyName(accessor);
                        String propertyName = jsonName(inferredName, accessor.getAnnotation(JsonProperty.class));
                        DictionaryBinding annotation = accessor.getAnnotation(DictionaryBinding.class);
                        if (annotation == null) annotation = fieldAnnotation(type, inferredName);
                        properties.putIfAbsent(propertyName, property(type, propertyName, accessor, annotation));
                    });
        }
        return new ResponseTypePlan(List.copyOf(properties.values()));
    }

    private ResponseProperty property(Class<?> type, String name, Method accessor,
                                      DictionaryBinding annotation) {
        accessor.trySetAccessible();
        return new ResponseProperty(name, accessor, bindingFor(type, name, annotation).orElse(null));
    }

    private boolean isConventionProperty(String propertyName) {
        return propertyName != null
                && propertyName.length() > PREFIX.length()
                && propertyName.startsWith(PREFIX)
                && Character.isUpperCase(propertyName.charAt(PREFIX.length()))
                && !propertyName.endsWith(TEXT_SUFFIX);
    }

    private String inferDictionaryCode(String propertyName) {
        String semanticName = propertyName.substring(PREFIX.length());
        return DictionaryCodePolicy.requireDictionaryCode(
                NamingCase.toUnderlineCase(semanticName).toUpperCase(Locale.ROOT));
    }

    private boolean isReadableProperty(Method method) {
        if (!Modifier.isPublic(method.getModifiers()) || method.getParameterCount() != 0
                || method.getReturnType() == Void.TYPE || method.getDeclaringClass() == Object.class) {
            return false;
        }
        return (method.getName().startsWith("get") && method.getName().length() > 3)
                || (method.getName().startsWith("is") && method.getName().length() > 2
                    && (method.getReturnType() == boolean.class || method.getReturnType() == Boolean.class));
    }

    private String getterPropertyName(Method accessor) {
        String prefix = accessor.getName().startsWith("is") ? "is" : "get";
        String value = accessor.getName().substring(prefix.length());
        if (value.length() == 1) return value.toLowerCase(Locale.ROOT);
        return Character.toLowerCase(value.charAt(0)) + value.substring(1);
    }

    private DictionaryBinding fieldAnnotation(Class<?> ownerType, String fieldName) {
        Class<?> current = ownerType;
        while (current != null && current != Object.class) {
            try {
                Field field = current.getDeclaredField(fieldName);
                return field.getAnnotation(DictionaryBinding.class);
            } catch (NoSuchFieldException ignored) {
                current = current.getSuperclass();
            }
        }
        return null;
    }

    private String jsonName(String fallback, JsonProperty... annotations) {
        for (JsonProperty annotation : annotations) {
            if (annotation != null && !annotation.value().isBlank()
                    && !JsonProperty.USE_DEFAULT_NAME.equals(annotation.value())) {
                return annotation.value();
            }
        }
        return fallback;
    }

    record ResponseTypePlan(List<ResponseProperty> properties) {
        List<DictionaryFieldBinding> bindings() {
            List<DictionaryFieldBinding> result = new ArrayList<>();
            for (ResponseProperty property : properties) {
                if (property.binding() != null) result.add(property.binding());
            }
            return List.copyOf(result);
        }
    }

    record ResponseProperty(String name, Method accessor, DictionaryFieldBinding binding) {
        Object read(Object target) {
            try {
                return accessor.invoke(target);
            } catch (ReflectiveOperationException exception) {
                throw new IllegalStateException("无法读取响应字段 " + target.getClass().getName() + "#" + name,
                        exception);
            }
        }
    }
}
