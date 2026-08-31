package com.rhn.platform.realtime.web;

import com.rhn.platform.realtime.api.PresenceSummary;
import com.rhn.platform.realtime.api.PresenceUserPage;
import com.rhn.platform.realtime.api.PresenceTrend;
import com.rhn.platform.realtime.api.PresenceTerminationResult;
import com.rhn.platform.realtime.api.TerminatePresenceRequest;
import com.rhn.platform.realtime.application.PresenceService;
import com.rhn.platform.realtime.application.PresenceTrendService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.Instant;

@RestController
@RequestMapping("/api/presence")
public class PresenceController {
    private final PresenceService service;
    private final PresenceTrendService trends;

    public PresenceController(PresenceService service, PresenceTrendService trends) {
        this.service = service; this.trends = trends;
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAnyAuthority('PRESENCE.SUMMARY.READ','ROLE_ADMIN')")
    PresenceSummary summary() { return service.summary(); }

    @GetMapping("/users")
    @PreAuthorize("hasAnyAuthority('PRESENCE.USER.READ','ROLE_ADMIN')")
    PresenceUserPage users(@RequestParam(required = false) String query,
                           @RequestParam(defaultValue = "false") boolean activeOnly,
                           @RequestParam(defaultValue = "0") int page,
                           @RequestParam(defaultValue = "50") int size) {
        return service.users(query, activeOnly, page, size);
    }

    @GetMapping("/trend")
    @PreAuthorize("hasAnyAuthority('PRESENCE.TREND.READ','ROLE_ADMIN')")
    PresenceTrend trend(@RequestParam(defaultValue = "DEPARTMENT") String scopeType,
                        @RequestParam(required = false) Long organizationId,
                        @RequestParam(required = false) Long departmentId,
                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return trends.trend(scopeType, organizationId, departmentId, from, to);
    }

    @PostMapping("/users/{userId}/terminate")
    @PreAuthorize("hasAnyAuthority('PRESENCE.SESSION.TERMINATE','ROLE_ADMIN')")
    PresenceTerminationResult terminate(@PathVariable Long userId,
                                        @Valid @RequestBody TerminatePresenceRequest request) {
        return service.terminate(userId, request.reason());
    }

    @PostMapping("/activity")
    @PreAuthorize("isAuthenticated()")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void activity() { service.activity(); }
}
