package com.rhn.outpatient.template;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/outpatient/plan-templates")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')")
class OutpatientPlanTemplateController {
    private final OutpatientPlanTemplateService service;
    OutpatientPlanTemplateController(OutpatientPlanTemplateService service) { this.service = service; }

    @GetMapping
    List<OutpatientPlanTemplateContracts.View> list(@RequestParam(required = false) String keyword) {
        return service.visible(keyword);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    OutpatientPlanTemplateContracts.View create(
            @Valid @RequestBody OutpatientPlanTemplateContracts.SaveRequest input) {
        return service.create(input);
    }

    @PostMapping("/{id}/use")
    OutpatientPlanTemplateContracts.View use(@PathVariable Long id) { return service.markUsed(id); }

    @PostMapping("/{id}/disable")
    OutpatientPlanTemplateContracts.View disable(@PathVariable Long id,
            @Valid @RequestBody OutpatientPlanTemplateContracts.RevisionRequest input) {
        return service.disable(id, input.expectedRevision());
    }
}
