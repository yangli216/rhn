package com.rhn.shared.id;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
class GlobalIdConfiguration {
    GlobalIdConfiguration(@Value("${rhn.id.worker-id:0}") long workerId,
                          @Value("${rhn.id.data-center-id:0}") long dataCenterId,
                          @Value("${rhn.id.allow-default-node:false}") boolean allowDefaultNode) {
        if (!allowDefaultNode && workerId == 0 && dataCenterId == 0) {
            throw new IllegalStateException(
                    "Production must configure a unique Snowflake data-center-id and worker-id");
        }
        GlobalIds.configure(workerId, dataCenterId);
    }
}
