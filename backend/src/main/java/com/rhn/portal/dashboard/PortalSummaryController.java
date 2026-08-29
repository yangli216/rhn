package com.rhn.portal.dashboard;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/portal/summary")
public class PortalSummaryController {
    private final PortalSummaryService service;

    public PortalSummaryController(PortalSummaryService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PORTAL.ACCESS') or hasRole('CLINICIAN')")
    PortalSummaryResponse current() {
        return service.current();
    }
}
