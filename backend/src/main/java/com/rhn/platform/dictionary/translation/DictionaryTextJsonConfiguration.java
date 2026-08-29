package com.rhn.platform.dictionary.translation;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.BeanDescription;
import tools.jackson.databind.SerializationConfig;
import tools.jackson.databind.module.SimpleModule;
import tools.jackson.databind.ser.BeanPropertyWriter;
import tools.jackson.databind.ser.ValueSerializerModifier;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Configuration
class DictionaryTextJsonConfiguration {
    @Bean
    SimpleModule dictionaryTextJsonModule(DictionaryBindingRegistry registry) {
        return new SimpleModule("rhn-dictionary-text")
                .setSerializerModifier(new ValueSerializerModifier() {
                    @Override
                    public List<BeanPropertyWriter> changeProperties(
                            SerializationConfig config,
                            BeanDescription.Supplier beanDescription,
                            List<BeanPropertyWriter> beanProperties) {
                        Class<?> ownerType = beanDescription.getBeanClass();
                        Set<String> existingNames = new HashSet<>();
                        beanProperties.forEach(property -> existingNames.add(property.getName()));
                        List<BeanPropertyWriter> result = new ArrayList<>();
                        for (BeanPropertyWriter property : beanProperties) {
                            result.add(property);
                            registry.bindingFor(ownerType, property.getName(),
                                            property.getAnnotation(DictionaryBinding.class))
                                    .ifPresent(binding -> {
                                        if (existingNames.contains(binding.textPropertyName())) {
                                            throw new IllegalStateException(ownerType.getName() + " 同时声明了自动字典文本字段 "
                                                    + binding.textPropertyName());
                                        }
                                        result.add(new DictionaryTextPropertyWriter(property, binding));
                                    });
                        }
                        return List.copyOf(result);
                    }
                });
    }
}
