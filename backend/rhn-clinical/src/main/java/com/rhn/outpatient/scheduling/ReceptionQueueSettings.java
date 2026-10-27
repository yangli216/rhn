package com.rhn.outpatient.scheduling;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Component;

/** 当前机构、科室是否启用排队叫号；未启用时医生直接从候诊列表接诊，不要求先叫号。 */
@Component
class ReceptionQueueSettings {
    static final String CALLING_ENABLED_KEY = "outpatient.queue.calling-enabled";

    private final ConfigurationDirectory configuration;
    private final ExecutionContextProvider contexts;

    ReceptionQueueSettings(ConfigurationDirectory configuration, ExecutionContextProvider contexts) {
        this.configuration = configuration;
        this.contexts = contexts;
    }

    record View(boolean callingEnabled) {}

    View current() {
        ExecutionContext context = contexts.requireCurrent();
        var configured = configuration.resolveCurrent(context.tenantId(), null, context.organizationId(),
                context.departmentId(), CALLING_ENABLED_KEY);
        boolean enabled = configured == null || configured.value() == null || configured.value().isNull()
                || configured.value().asBoolean(true);
        return new View(enabled);
    }
}
