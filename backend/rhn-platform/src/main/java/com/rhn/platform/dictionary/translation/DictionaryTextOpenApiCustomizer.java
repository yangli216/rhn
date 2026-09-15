package com.rhn.platform.dictionary.translation;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.lang.reflect.GenericArrayType;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.lang.reflect.WildcardType;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

@Component
class DictionaryTextOpenApiCustomizer implements OpenApiCustomizer {
    private final DictionaryBindingRegistry registry;
    private final ObjectProvider<RequestMappingHandlerMapping> handlerMappingProvider;

    DictionaryTextOpenApiCustomizer(DictionaryBindingRegistry registry,
                                    ObjectProvider<RequestMappingHandlerMapping> handlerMappingProvider) {
        this.registry = registry;
        this.handlerMappingProvider = handlerMappingProvider;
    }

    @Override
    public void customise(OpenAPI openApi) {
        if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) return;
        Set<Class<?>> responseTypes = new LinkedHashSet<>();
        for (RequestMappingHandlerMapping handlerMapping : handlerMappingProvider.orderedStream().toList()) {
            for (HandlerMethod handler : handlerMapping.getHandlerMethods().values()) {
                if (handler.getBeanType().getName().startsWith("com.rhn")) {
                    collectResponseTypes(handler.getMethod().getGenericReturnType(), responseTypes,
                            new LinkedHashSet<>());
                }
            }
        }
        responseTypes.forEach(type -> addTextProperties(openApi, type));
    }

    @SuppressWarnings("unchecked")
    private void addTextProperties(OpenAPI openApi, Class<?> type) {
        Map<String, String> textProperties = registry.textPropertiesFor(type);
        if (textProperties.isEmpty()) return;
        Schema<Object> schema = openApi.getComponents().getSchemas().get(type.getSimpleName());
        if (schema == null) return;
        textProperties.forEach((propertyName, dictionaryCode) -> {
            if (schema.getProperties() != null && schema.getProperties().containsKey(propertyName)) {
                throw new IllegalStateException(type.getName() + " 同时声明了自动字典文本字段 " + propertyName);
            }
            schema.addProperty(propertyName, new StringSchema()
                    .readOnly(true)
                    .nullable(true)
                    .description("字典 " + dictionaryCode + " 的显示文本"));
        });
    }

    private void collectResponseTypes(Type type, Set<Class<?>> result, Set<Type> visiting) {
        if (type == null || !visiting.add(type)) return;
        try {
            if (type instanceof Class<?> rawType) {
                if (rawType.isArray()) {
                    collectResponseTypes(rawType.getComponentType(), result, visiting);
                } else if (rawType.getName().startsWith("com.rhn")) {
                    result.add(rawType);
                    if (rawType.isRecord()) {
                        for (RecordComponent component : rawType.getRecordComponents()) {
                            collectResponseTypes(component.getGenericType(), result, visiting);
                        }
                    }
                }
                return;
            }
            if (type instanceof ParameterizedType parameterized) {
                collectResponseTypes(parameterized.getRawType(), result, visiting);
                for (Type argument : parameterized.getActualTypeArguments()) {
                    collectResponseTypes(argument, result, visiting);
                }
                return;
            }
            if (type instanceof GenericArrayType arrayType) {
                collectResponseTypes(arrayType.getGenericComponentType(), result, visiting);
                return;
            }
            if (type instanceof WildcardType wildcard) {
                for (Type upperBound : wildcard.getUpperBounds()) {
                    collectResponseTypes(upperBound, result, visiting);
                }
            }
        } finally {
            visiting.remove(type);
        }
    }
}
