package com.rhn.ai.web;

import com.rhn.ai.api.ClinicalTriageContracts.AssessmentRequest;
import com.rhn.ai.api.ClinicalTriageContracts.AssessmentResponse;
import com.rhn.ai.application.ClinicalTriageAssessmentService;
import com.rhn.ai.application.ClinicalTriageDecisionService;
import com.rhn.ai.api.ClinicalTriageContracts.DecisionAssessment;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/outpatient/triage/assessments")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_REGISTRATION.ACCESS','OUTPATIENT_RECEPTION.ACCESS','OUTPATIENT_TRIAGE.ACCESS','ROLE_ADMIN')")
class ClinicalTriageAssessmentController {
    private final ClinicalTriageAssessmentService service;

    private final ClinicalTriageDecisionService decisionService;

    ClinicalTriageAssessmentController(ClinicalTriageAssessmentService service,
                                       ClinicalTriageDecisionService decisionService) {
        this.service = service;
        this.decisionService = decisionService;
    }

    @PostMapping("/decision")
    DecisionAssessment decide(@Valid @RequestBody AssessmentRequest request) {
        return decisionService.assess(request);
    }

    @PostMapping
    AssessmentResponse assess(@Valid @RequestBody AssessmentRequest request) {
        return service.assess(request);
    }
}
