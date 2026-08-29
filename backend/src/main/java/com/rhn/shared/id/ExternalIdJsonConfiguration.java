package com.rhn.shared.id;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.module.SimpleModule;
import tools.jackson.databind.ser.std.ToStringSerializer;

/**
 * Serializes boxed longs as strings. Transport DTOs reserve boxed Long for entity identifiers;
 * ordinary non-null numeric values use primitives, Integer or BigDecimal.
 */
@Configuration
class ExternalIdJsonConfiguration {
    @Bean
    SimpleModule externalIdJsonModule() {
        return new SimpleModule("rhn-external-id")
                .addSerializer(Long.class, new ToStringSerializer(Long.class));
    }
}
