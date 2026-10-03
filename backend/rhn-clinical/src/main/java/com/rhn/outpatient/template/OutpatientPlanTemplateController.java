package com.rhn.outpatient.template;

import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts;

@RestController
@RequestMapping("/api/outpatient/plan-templates")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')")
class OutpatientPlanTemplateController {
    private final OutpatientPlanTemplateService service;
    OutpatientPlanTemplateController(OutpatientPlanTemplateService service) { this.service = service; }

    @Operation(operationId = "listOutpatientPlanTemplates")
    @GetMapping
    List<OutpatientPlanTemplateContracts.View> list(@RequestParam(required = false) String keyword) {
        return service.visible(keyword);
    }

    @Operation(operationId = "createOutpatientPlanTemplate")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    OutpatientPlanTemplateContracts.View create(
            @Valid @RequestBody OutpatientPlanTemplateContracts.SaveRequest input) {
        return service.create(input);
    }

    @Operation(operationId = "useOutpatientPlanTemplate")
    @PostMapping("/{id}/use")
    OutpatientPlanTemplateContracts.View use(@PathVariable Long id) { return service.markUsed(id); }

    @Operation(operationId = "updateOutpatientPlanTemplate")
    @PutMapping("/{id}")
    OutpatientPlanTemplateContracts.View update(
            @PathVariable Long id,
            @Valid @RequestBody OutpatientPlanTemplateContracts.UpdateRequest input) {
        return service.update(id, input);
    }

    @Operation(operationId = "disableOutpatientPlanTemplate")
    @PostMapping("/{id}/disable")
    OutpatientPlanTemplateContracts.View disable(@PathVariable Long id,
            @Valid @RequestBody OutpatientPlanTemplateContracts.RevisionRequest input) {
        return service.disable(id, input.expectedRevision());
    }
}
