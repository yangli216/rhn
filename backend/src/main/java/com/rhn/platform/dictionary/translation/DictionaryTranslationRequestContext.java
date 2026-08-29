package com.rhn.platform.dictionary.translation;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import java.util.Optional;

final class DictionaryTranslationRequestContext {
    private static final String ATTRIBUTE = DictionaryTranslationRequestContext.class.getName() + ".context";

    private DictionaryTranslationRequestContext() {
    }

    static void set(DictionaryTranslationContext context) {
        RequestAttributes attributes = RequestContextHolder.currentRequestAttributes();
        attributes.setAttribute(ATTRIBUTE, context, RequestAttributes.SCOPE_REQUEST);
    }

    static Optional<DictionaryTranslationContext> current() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes == null) return Optional.empty();
        return Optional.ofNullable((DictionaryTranslationContext) attributes.getAttribute(
                ATTRIBUTE, RequestAttributes.SCOPE_REQUEST));
    }
}
