package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.*;
import com.rhn.quality.medication.application.PharmacyFeedbackImprovementService;
import com.rhn.shared.api.PageResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/pharmacy-tasks/{task}/reviews/{review}/improvement-intakes")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE') and hasAnyAuthority('PHARMACY.DISPENSE','ROLE_ADMIN')")
public class PharmacyFeedbackImprovementController {
    private final PharmacyFeedbackImprovementService service;
    public PharmacyFeedbackImprovementController(PharmacyFeedbackImprovementService service) {this.service=service;}
    @GetMapping("/source") public FeedbackOrigin source(@PathVariable Long task,@PathVariable Long review,@RequestParam(required=false) Long findingId) {return service.source(task,review,findingId);}
    @GetMapping public PageResult<Summary> history(@PathVariable Long task,@PathVariable Long review,@RequestParam(defaultValue="0") int page) {return service.history(task,review,page);}
    @PostMapping public Run analyze(@PathVariable Long task,@PathVariable Long review,@RequestBody PharmacyImprovementRequest input) {return service.analyze(task,review,input);}
}
