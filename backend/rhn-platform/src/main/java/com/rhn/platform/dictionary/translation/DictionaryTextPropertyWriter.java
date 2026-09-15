package com.rhn.platform.dictionary.translation;

import tools.jackson.core.JsonGenerator;
import tools.jackson.databind.PropertyName;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ser.BeanPropertyWriter;

final class DictionaryTextPropertyWriter extends BeanPropertyWriter {
    private final DictionaryFieldBinding binding;

    DictionaryTextPropertyWriter(BeanPropertyWriter source, DictionaryFieldBinding binding) {
        super(source, new PropertyName(binding.textPropertyName()));
        this.binding = binding;
    }

    @Override
    public void serializeAsProperty(Object bean, JsonGenerator generator,
                                    SerializationContext context) throws Exception {
        DictionaryTranslationContext translations = DictionaryTranslationRequestContext.current().orElse(null);
        if (translations == null) return;
        Object translated = translations.translate(binding.dictionaryCode(), get(bean));
        context.defaultSerializeProperty(binding.textPropertyName(), translated, generator);
    }
}
