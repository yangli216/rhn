package com.rhn.pharmacy.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.conflict;

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
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty()) return Mode.DISABLED;
        try {
            return Mode.valueOf(normalized);
        } catch (IllegalArgumentException invalid) {
            // Silently disabling review on a typo would let prescriptions bypass pharmacist review.
            throw conflict("PRESCRIPTION_REVIEW_MODE_INVALID",
                    "审方模式配置无效，请维护为 DISABLED、PRE_DISPENSE 或 POST_DISPENSE");
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
