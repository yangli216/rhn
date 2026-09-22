package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.*;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment;
import com.rhn.quality.medication.application.MedicationKnowledgeDeploymentService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-knowledge-rule-candidates/{id}/deployments")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgeDeploymentController {
    private final MedicationKnowledgeDeploymentService service;
    public MedicationKnowledgeDeploymentController(MedicationKnowledgeDeploymentService service) {this.service=service;}
    @GetMapping public Preview preview(@PathVariable Long id) {return service.preview(id);}
    @PostMapping("/commands") public Deployment command(@PathVariable Long id,@RequestBody Command command) {return service.command(id,command);}
    @GetMapping("/{deploymentId}/observations") public Observations observations(@PathVariable Long id,@PathVariable Long deploymentId,@RequestParam(defaultValue="0") int page) {return service.observations(id,deploymentId,page);}
}
