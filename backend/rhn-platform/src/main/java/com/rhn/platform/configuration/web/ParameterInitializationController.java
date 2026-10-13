package com.rhn.platform.configuration.web;

import com.rhn.platform.configuration.api.ParameterInitializationOptions;
import com.rhn.platform.configuration.application.ParameterInitializationParticipant;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/platform/maintenance/parameters")
@PreAuthorize("hasAuthority('MAINTENANCE.VIEW')")
public class ParameterInitializationController {
    private final ParameterInitializationParticipant participant;
    private final ExecutionContextProvider contexts;
    public ParameterInitializationController(ParameterInitializationParticipant participant, ExecutionContextProvider contexts) {
        this.participant = participant; this.contexts = contexts;
    }
    @GetMapping("/options")
    ParameterInitializationOptions options() { return participant.options(contexts.requireCurrent()); }
}
