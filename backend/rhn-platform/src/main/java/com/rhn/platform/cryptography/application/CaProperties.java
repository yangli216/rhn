package com.rhn.platform.cryptography.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;
import java.util.List;

/**
 * Personal CA signing is optional (ADR-008): when {@code enabled} is false, or no vendor serves the
 * organization, signing requests return {@code NOT_APPLICABLE} and business flows are untouched.
 * {@code organizations} overrides {@code defaultVendor} per tenant/organization.
 */
@ConfigurationProperties(prefix = "rhn.crypto.ca", ignoreUnknownFields = false)
public record CaProperties(@DefaultValue("false") boolean enabled, String defaultVendor,
                           @DefaultValue("P7D") Duration orderTtl,
                           @DefaultValue("PT30S") Duration claimLease,
                           @DefaultValue("PT10S") Duration pollInterval,
                           @DefaultValue("PT5M") Duration maxPollInterval,
                           @DefaultValue("8") int maxSubmitAttempts,
                           @DefaultValue("true") boolean workerEnabled,
                           @DefaultValue("2000") long dispatchIntervalMs,
                           @DefaultValue("50") int dispatchBatchSize,
                           @DefaultValue Development development,
                           List<OrganizationVendor> organizations) {
    public CaProperties {
        organizations = organizations == null ? List.of() : List.copyOf(organizations);
        if (maxSubmitAttempts < 1) throw new IllegalArgumentException("rhn.crypto.ca.max-submit-attempts must be positive");
        if (dispatchBatchSize < 1) throw new IllegalArgumentException("rhn.crypto.ca.dispatch-batch-size must be positive");
    }

    public String vendorFor(Long tenantId, Long organizationId) {
        String organizationVendor = null;
        String tenantVendor = null;
        for (OrganizationVendor value : organizations) {
            if (!value.tenantId().equals(tenantId)) continue;
            if (value.organizationId() == null) tenantVendor = value.vendor();
            else if (value.organizationId().equals(organizationId)) organizationVendor = value.vendor();
        }
        if (organizationVendor != null) return organizationVendor;
        if (tenantVendor != null) return tenantVendor;
        return defaultVendor == null || defaultVendor.isBlank() ? null : defaultVendor.trim();
    }

    /** Backoff between vendor status checks: poll interval doubled per attempt, capped. */
    public Duration backoff(int attempts) {
        Duration value = pollInterval.multipliedBy(1L << Math.min(Math.max(attempts, 0), 6));
        return value.compareTo(maxPollInterval) > 0 ? maxPollInterval : value;
    }

    public record OrganizationVendor(Long tenantId, Long organizationId, String vendor) {
        public OrganizationVendor {
            if (tenantId == null || vendor == null || vendor.isBlank()) {
                throw new IllegalArgumentException("rhn.crypto.ca.organizations entries need tenant-id and vendor");
            }
        }
    }

    /** In-process simulated CA; refused by the registry whenever compliance enforcement is on. */
    public record Development(@DefaultValue("false") boolean enabled) {}
}
