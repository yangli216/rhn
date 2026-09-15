package com.rhn.platform.printing.web;

import com.rhn.platform.printing.application.PrintBusinessAdministrationService;
import com.rhn.platform.printing.application.PrintBusinessAdministrationService.BindingCommand;
import com.rhn.platform.printing.application.PrintBusinessAdministrationService.BindingView;
import com.rhn.platform.printing.application.PrintBusinessAdministrationService.Overview;
import com.rhn.platform.printing.application.PrintBusinessAdministrationService.ResolutionView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/platform/printing/administration/business")
@PreAuthorize("hasAnyAuthority('CONFIGURATION.ACCESS','ROLE_ADMIN')")
public class PrintBusinessAdministrationController {
    private final PrintBusinessAdministrationService service;

    public PrintBusinessAdministrationController(PrintBusinessAdministrationService service) { this.service = service; }

    @GetMapping
    Overview overview() { return service.overview(); }

    @GetMapping("/resolution")
    ResolutionView resolution(@RequestParam String taskCode, @RequestParam String purpose) {
        return service.preview(taskCode, purpose);
    }

    @PostMapping("/bindings")
    BindingView bind(@Valid @RequestBody BindingRequest request) {
        return service.bind(new BindingCommand(request.expectedRevision(), request.taskDefinitionId(),
                request.scopeType(), request.purpose(), request.implementationId(), request.fallbackPolicy()));
    }

    record BindingRequest(@Min(0) long expectedRevision, @NotNull Long taskDefinitionId,
            @NotBlank String scopeType, @NotBlank String purpose, @NotNull Long implementationId,
            @NotBlank String fallbackPolicy) {}
}
