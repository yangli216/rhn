package com.rhn.analytics.application;

import com.rhn.analytics.api.AnalyticsCapabilities;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class AnalyticsCapabilitiesService {
    private final boolean enabled;
    private final boolean pilotEnabled;

    public AnalyticsCapabilitiesService(@Value("${rhn.analytics.enabled:false}") boolean enabled,
            @Value("${rhn.analytics.pilot-enabled:false}") boolean pilotEnabled) {
        this.enabled = enabled;
        this.pilotEnabled = pilotEnabled;
    }

    public AnalyticsCapabilities current() {
        // The separate pilot flag opts into fixed outpatient queries; the general entry flag alone does not.
        return new AnalyticsCapabilities(enabled || pilotEnabled, pilotEnabled, "a04-contract-v1", pilotEnabled);
    }
}
