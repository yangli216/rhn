package com.rhn.platform.cryptography.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;
import java.util.List;
import java.util.Map;

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
                           List<OrganizationVendor> organizations,
                           Map<String, VendorSettings> vendors) {
    public CaProperties {
        organizations = organizations == null ? List.of() : List.copyOf(organizations);
        vendors = vendors == null ? Map.of() : Map.copyOf(vendors);
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

    /**
     * Deployment connection settings of one HTTP vendor adapter ({@code rhn.crypto.ca.vendors.<vendor>}).
     * Credentials are deployment configuration only: never stored in the database, logged or echoed.
     */
    public record VendorSettings(@DefaultValue("false") boolean enabled, List<Connection> organizations) {
        public VendorSettings {
            organizations = organizations == null ? List.of() : List.copyOf(organizations);
            if (enabled && organizations.isEmpty()) {
                throw new IllegalArgumentException("an enabled CA vendor needs at least one organizations[*] connection");
            }
        }

        /** Connection serving the organization: exact organization first, then the tenant-wide entry. */
        public java.util.Optional<Connection> connectionFor(Long tenantId, Long organizationId) {
            Connection tenantWide = null;
            for (Connection value : organizations) {
                if (!value.tenantId().equals(tenantId)) continue;
                if (value.organizationId() == null) tenantWide = value;
                else if (value.organizationId().equals(organizationId)) return java.util.Optional.of(value);
            }
            return java.util.Optional.ofNullable(tenantWide);
        }
    }

    public record Connection(Long tenantId, Long organizationId, String baseUrl, String clientId, String clientSecret,
                             @DefaultValue("PT3S") Duration connectTimeout, @DefaultValue("PT20S") Duration readTimeout) {
        public Connection {
            if (tenantId == null) throw new IllegalArgumentException("CA vendor connection needs tenant-id");
            if (baseUrl == null || !baseUrl.trim().matches("(?i)https?://[^\\s]+")) {
                throw new IllegalArgumentException("CA vendor connection base-url must be an http(s) URL");
            }
            if (clientId == null || clientId.isBlank() || clientSecret == null || clientSecret.isBlank()) {
                throw new IllegalArgumentException("CA vendor connection needs client-id and client-secret");
            }
            baseUrl = baseUrl.trim().replaceAll("/+$", "");
        }

        @Override
        public String toString() {
            return "Connection[tenantId=" + tenantId + ", organizationId=" + organizationId + ", credentials=REDACTED]";
        }
    }

    /** In-process simulated CA; refused by the registry whenever compliance enforcement is on. */
    public record Development(@DefaultValue("false") boolean enabled) {}
}
