package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.*;
import com.rhn.quality.medication.application.MedicationFeedbackImprovementService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-knowledge-rule-candidates/{candidate}/deployments/{deployment}/observations/{run}/feedback/improvement-intakes")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationFeedbackImprovementController {
    private final MedicationFeedbackImprovementService service;
    public MedicationFeedbackImprovementController(MedicationFeedbackImprovementService service) {this.service=service;}
    @GetMapping public com.rhn.shared.api.PageResult<Summary> history(@PathVariable Long candidate,@PathVariable Long deployment,@PathVariable Long run,@RequestParam(defaultValue="0") int page) {return service.history(candidate,deployment,run,page);}
    @PostMapping public Run analyze(@PathVariable Long candidate,@PathVariable Long deployment,@PathVariable Long run,@RequestBody ImprovementRequest input) {return service.analyze(candidate,deployment,run,input);}
}
