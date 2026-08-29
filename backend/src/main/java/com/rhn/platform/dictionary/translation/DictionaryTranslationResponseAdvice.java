package com.rhn.platform.dictionary.translation;

import com.rhn.platform.tenant.TenantContext;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.util.Map;
import java.util.Set;

@RestControllerAdvice
class DictionaryTranslationResponseAdvice implements ResponseBodyAdvice<Object> {
    private final DictionaryTranslationCollector collector;
    private final DictionaryTextResolver resolver;

    DictionaryTranslationResponseAdvice(DictionaryTranslationCollector collector,
                                        DictionaryTextResolver resolver) {
        this.collector = collector;
        this.resolver = resolver;
    }

    @Override
    public boolean supports(MethodParameter returnType,
                            Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        if (body == null || !MediaType.APPLICATION_JSON.isCompatibleWith(selectedContentType)) return body;
        Map<String, Set<String>> requests = collector.collect(body);
        if (!requests.isEmpty()) {
            DictionaryTranslationRequestContext.set(resolver.resolve(
                    TenantContext.currentTenantId().orElse(null), requests));
        }
        return body;
    }
}
