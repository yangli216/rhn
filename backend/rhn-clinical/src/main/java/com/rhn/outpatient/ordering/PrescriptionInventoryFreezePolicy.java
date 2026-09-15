package com.rhn.outpatient.ordering;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 门诊处方开立库存冻结策略：控制提交处方时是否立即冻结发药药房库存。
 */
@Service
public class PrescriptionInventoryFreezePolicy {
    public static final String PARAMETER_KEY = "outpatient.prescription.inventory-freeze.enabled";

    private final ConfigurationDirectory configuration;
    private final String overrideValue;

    public PrescriptionInventoryFreezePolicy(ConfigurationDirectory configuration,
                                             @Value("${rhn.outpatient.prescription.inventory-freeze.enabled:}")
                                             String overrideValue) {
        this.configuration = configuration;
        this.overrideValue = overrideValue == null ? "" : overrideValue.trim();
    }

    public boolean isInventoryFreezeEnabled(ExecutionContext context, Long organizationId, Long departmentId) {
        if (!overrideValue.isBlank()) {
            return Boolean.parseBoolean(overrideValue);
        }
        if (context == null || !context.hasWorkContext()) {
            return true;
        }
        var configured = configuration.resolveCurrent(context.tenantId(), context.subjectId(),
                organizationId, departmentId, PARAMETER_KEY);
        if (configured == null || configured.value() == null) {
            return true;
        }
        return configured.value().asBoolean(true);
    }
}
