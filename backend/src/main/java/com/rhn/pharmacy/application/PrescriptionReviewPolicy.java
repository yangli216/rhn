package com.rhn.pharmacy.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class PrescriptionReviewPolicy {
    public static final String PARAMETER_KEY = "pharmacy.prescription-review.mode";

    private final ConfigurationDirectory configuration;
    private final String modeOverride;

    public PrescriptionReviewPolicy(ConfigurationDirectory configuration,
                                    @Value("${rhn.pharmacy.prescription-review.mode-override:}")
                                    String modeOverride) {
        this.configuration = configuration;
        this.modeOverride = modeOverride == null ? "" : modeOverride.trim();
    }

    public Mode resolve(ExecutionContext context, Long organizationId, Long departmentId) {
        if (!modeOverride.isBlank()) return parse(modeOverride);
        var configured = configuration.resolveCurrent(context.tenantId(), context.subjectId(),
                organizationId, departmentId, PARAMETER_KEY);
        return configured.value() == null ? Mode.DISABLED : parse(configured.value().asString());
    }

    private Mode parse(String value) {
        try {
            return Mode.valueOf(value == null ? "DISABLED" : value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return Mode.DISABLED;
        }
    }

    public enum Mode {
        DISABLED,
        PRE_DISPENSE,
        POST_DISPENSE;

        public boolean enabled() { return this != DISABLED; }
        public boolean beforeDispense() { return this == PRE_DISPENSE; }
        public boolean afterDispense() { return this == POST_DISPENSE; }
    }
}
