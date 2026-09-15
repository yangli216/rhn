package com.rhn.billing.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 门诊退费防损与协同策略：控制未发药、未执行的医嘱是否允许直接在收费处退费。
 */
@Service
public class RefundPolicy {
    public static final String PARAMETER_KEY = "billing.refund.unexecuted-direct-refund.enabled";

    private final ConfigurationDirectory configuration;
    private final String overrideValue;

    public RefundPolicy(ConfigurationDirectory configuration,
                        @Value("${rhn.billing.refund.unexecuted-direct-refund.enabled:}")
                        String overrideValue) {
        this.configuration = configuration;
        this.overrideValue = overrideValue == null ? "" : overrideValue.trim();
    }

    public boolean isUnexecutedDirectRefundAllowed(ExecutionContext context, Long organizationId, Long departmentId) {
        if (!overrideValue.isBlank()) {
            return Boolean.parseBoolean(overrideValue);
        }
        var configured = configuration.resolveCurrent(context.tenantId(), context.subjectId(),
                organizationId, departmentId, PARAMETER_KEY);
        if (configured == null || configured.value() == null) {
            return true;
        }
        return configured.value().asBoolean(true);
    }
}
