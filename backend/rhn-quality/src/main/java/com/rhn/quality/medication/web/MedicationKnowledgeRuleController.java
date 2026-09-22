package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.*;
import com.rhn.quality.medication.application.MedicationKnowledgeRuleService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-knowledge-drafts/{id}/rule-candidates")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgeRuleController {
    private final MedicationKnowledgeRuleService service;
    public MedicationKnowledgeRuleController(MedicationKnowledgeRuleService service) {this.service=service;}
    @GetMapping("/preview") public Preview preview(@PathVariable Long id,@RequestParam int expectedVersion) {return service.preview(id,expectedVersion);}
    @PostMapping public KnowledgeRuleCandidate create(@PathVariable Long id,@RequestBody Create input) {return service.create(id,input);}
}
