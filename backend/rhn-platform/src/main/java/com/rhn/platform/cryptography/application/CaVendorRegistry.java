package com.rhn.platform.cryptography.application;

import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import com.rhn.platform.cryptography.spi.ProviderAssurance;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/** A vendor code has exactly one adapter; adding a bean can never silently reroute existing signers. */
@Service
@EnableConfigurationProperties(CaProperties.class)
public class CaVendorRegistry {
    private static final Pattern CODE = Pattern.compile("[a-z][a-z0-9-]{1,31}");
    private final Map<String, CaVendorAdapter> adapters;
    private final CaProperties properties;

    public CaVendorRegistry(List<CaVendorAdapter> adapters, CaProperties properties,
                            @Value("${rhn.crypto.enforce-compliance:true}") boolean enforceCompliance) {
        Map<String, CaVendorAdapter> registered = new LinkedHashMap<>();
        for (CaVendorAdapter adapter : adapters) {
            String code = adapter.vendorCode();
            if (code == null || !CODE.matcher(code).matches()) {
                throw new IllegalStateException("CA adapter code must be lower-case kebab case: " + code);
            }
            CaVendorAdapter.Capabilities capabilities = adapter.capabilities();
            if (capabilities == null || adapter.verification() == null) {
                throw new IllegalStateException("CA adapter must declare capabilities and verification: " + code);
            }
            if (enforceCompliance && capabilities.assurance() == ProviderAssurance.DEVELOPMENT_ONLY) {
                throw new IllegalStateException("Development CA adapter must not run with compliance enforcement: " + code);
            }
            if (registered.putIfAbsent(code, adapter) != null) {
                throw new IllegalStateException("Duplicate CA adapter code: " + code);
            }
        }
        this.adapters = Map.copyOf(registered);
        this.properties = properties;
        String defaultVendor = properties.defaultVendor();
        if (properties.enabled() && defaultVendor != null && !defaultVendor.isBlank()
                && !this.adapters.containsKey(defaultVendor.trim())) {
            throw new IllegalStateException("rhn.crypto.ca.default-vendor has no adapter: " + defaultVendor);
        }
        for (CaProperties.OrganizationVendor value : properties.organizations()) {
            if (!this.adapters.containsKey(value.vendor())) {
                throw new IllegalStateException("rhn.crypto.ca.organizations vendor has no adapter: " + value.vendor());
            }
        }
    }

    /** Vendor serving new signing orders for the organization, or empty when CA signing does not apply. */
    public Optional<CaVendorAdapter> forOrganization(Long tenantId, Long organizationId) {
        if (!properties.enabled()) return Optional.empty();
        String code = properties.vendorFor(tenantId, organizationId);
        if (code == null) return Optional.empty();
        CaVendorAdapter adapter = adapters.get(code);
        return adapter != null && adapter.configured(tenantId, organizationId) ? Optional.of(adapter) : Optional.empty();
    }

    /** Adapter that issued an existing binding or order; independent of current routing. */
    public Optional<CaVendorAdapter> byCode(String vendorCode) {
        return Optional.ofNullable(vendorCode == null ? null : adapters.get(vendorCode));
    }
}
