package com.rhn.billing.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.List;
import java.util.Map;

/** Explicit insurer registrations supplied by deployment configuration; no synthetic identifiers. */
@ConfigurationProperties(prefix = "rhn.billing.insurance.quick-submission")
public record InsuranceQuickSubmissionProperties(List<Registration> registrations) {
    public InsuranceQuickSubmissionProperties {
        registrations = registrations == null ? List.of() : List.copyOf(registrations);
    }
    public record Registration(Long tenantId, Long organizationId, Long departmentId,
                               String insuranceTypeCode, String regionCode, String organizationCode,
                               String departmentCode, String insuranceSystemCode, Map<String, String> practitionerCodes) {
        public Registration {
            practitionerCodes = practitionerCodes == null ? Map.of() : Map.copyOf(practitionerCodes);
        }
    }
}
