package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.*;
import com.rhn.quality.medication.application.MedicationKnowledgeFeedbackService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-knowledge-rule-candidates/{candidate}/deployments/{deployment}/observations/{run}/feedback")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgeFeedbackController {
    private final MedicationKnowledgeFeedbackService service;
    public MedicationKnowledgeFeedbackController(MedicationKnowledgeFeedbackService service) {this.service=service;}
    @GetMapping public Detail detail(@PathVariable Long candidate,@PathVariable Long deployment,@PathVariable Long run,@RequestParam(defaultValue="0") int page) {return service.detail(candidate,deployment,run,page);}
    @PostMapping public Detail command(@PathVariable Long candidate,@PathVariable Long deployment,@PathVariable Long run,@RequestBody Command command) {return service.command(candidate,deployment,run,command);}
}
