package com.rhn;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.config.TaskManagementConfigUtils;

@TestConfiguration(proxyBeanMethods = false)
class RhnDatabaseResetConfiguration {
    @Bean
    static BeanFactoryPostProcessor disableScheduledTasksDuringDatabaseReset() {
        return factory -> {
            // Do not let a scheduled worker race DROP ALL OBJECTS or mutate the saved baseline.
            var registry = (BeanDefinitionRegistry) factory;
            String name = TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
            if (registry.containsBeanDefinition(name)) registry.removeBeanDefinition(name);
        };
    }
}
