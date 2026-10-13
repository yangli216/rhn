package com.rhn.diagnostics.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;

/** An optional second signer, without a separate approval workflow. */
@Service
public class DiagnosticSigningPolicy {
    private final ConfigurationDirectory configuration;

    public DiagnosticSigningPolicy(ConfigurationDirectory configuration) { this.configuration = configuration; }

    public boolean requiresSecondSigner(ExecutionContext context, String requestType, Long organizationId) {
        String key = "diagnostics." + ("LABORATORY".equals(requestType) ? "laboratory" : "examination")
                + ".double-sign.required";
        var value = configuration.resolveCurrent(context.tenantId(), context.subjectId(), organizationId, null, key);
        return value != null && value.value() != null && value.value().asBoolean(false);
    }
}
