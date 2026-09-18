package com.rhn.outpatient.ordering;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class OutpatientAllergyVerificationPolicy {
    public static final String PARAMETER_KEY = "outpatient.medication.allergy-verification.mode";

    private final ConfigurationDirectory configuration;
    private final String modeOverride;

    public OutpatientAllergyVerificationPolicy(
            ConfigurationDirectory configuration,
            @Value("${rhn.outpatient.medication.allergy-verification.mode-override:}") String modeOverride) {
        this.configuration = configuration;
        this.modeOverride = modeOverride == null ? "" : modeOverride.trim();
    }

    public Mode resolve(ExecutionContext context, Long organizationId, Long departmentId) {
        if (!modeOverride.isBlank()) return parse(modeOverride);
        if (context == null || configuration == null) return Mode.WARN;
        var configured = configuration.resolveCurrent(context.tenantId(), context.subjectId(),
                organizationId, departmentId, PARAMETER_KEY);
        return configured == null || configured.value() == null
                ? Mode.WARN : parse(configured.value().asString());
    }

    private Mode parse(String value) {
        try {
            return Mode.valueOf(value == null ? "WARN" : value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return Mode.WARN;
        }
    }

    public enum Mode {
        WARN,
        BLOCK;

        public boolean blocksUnverifiedAllergies() {
            return this == BLOCK;
        }
    }
}
