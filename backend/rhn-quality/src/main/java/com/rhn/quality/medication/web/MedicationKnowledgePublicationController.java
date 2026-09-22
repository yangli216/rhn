package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.*;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment;
import com.rhn.quality.medication.application.MedicationKnowledgePublicationService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-knowledge-rule-candidates/{id}/deployments")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgePublicationController {
    private final MedicationKnowledgePublicationService service;
    public MedicationKnowledgePublicationController(MedicationKnowledgePublicationService service) {this.service=service;}
    @GetMapping("/formal-preview") public Preview preview(@PathVariable Long id,@RequestParam Long sourceDeploymentId,@RequestParam String operation) {return service.preview(id,sourceDeploymentId,operation);}
    @PostMapping("/formal-commands") public Deployment command(@PathVariable Long id,@RequestBody Command command) {return service.command(id,command);}
    @GetMapping("/{deploymentId}/formal-material") public Authorization material(@PathVariable Long id,@PathVariable Long deploymentId) {return service.material(id,deploymentId);}
}
