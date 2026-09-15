package com.rhn.analytics.web;

import com.rhn.analytics.api.AnalyticsCapabilities;
import com.rhn.analytics.application.AnalyticsCapabilitiesService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics/capabilities")
public class AnalyticsCapabilitiesController {
    private final AnalyticsCapabilitiesService service;

    public AnalyticsCapabilitiesController(AnalyticsCapabilitiesService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PORTAL.ACCESS')")
    public AnalyticsCapabilities current() {
        return service.current();
    }
}
