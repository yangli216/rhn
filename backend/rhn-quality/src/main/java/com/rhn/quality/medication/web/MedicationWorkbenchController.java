package com.rhn.quality.medication.web;

import com.rhn.quality.medication.application.MedicationWorkbenchService;
import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory.Knowledge;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/quality/medication-workbench")
public class MedicationWorkbenchController {
    private final MedicationWorkbenchService service;
    public MedicationWorkbenchController(MedicationWorkbenchService service) { this.service=service; }
    @GetMapping("/ai-status") public MedicationRuleAuthoringAi.Status status() { return service.status(); }
    @GetMapping("/medications") public List<Knowledge> medications(@RequestParam(required=false) String query) { return service.medications(query); }
    @PostMapping("/candidates/{id}/suite") public TrialRun suite(@PathVariable Long id) { return service.suite(id); }
    @PostMapping("/active-rules/trial") public ActiveRuleTrialRun activeRuleTrial(@RequestBody ActiveRuleTrialRequest request) { return service.activeRuleTrial(request); }
    @GetMapping("/active-rules") public List<ActiveRuleView> activeRules() { return service.activeRules(); }
    @GetMapping("/evaluations") public List<EvaluationSummary> evaluations() { return service.recentEvaluations(); }
    @GetMapping("/evaluation-records") public com.rhn.shared.api.PageResult<EvaluationSummary> evaluationPage(
            @RequestParam(required=false) String mode,@RequestParam(required=false) String decision,@RequestParam(required=false) Long prescriptionId,
            @RequestParam(required=false) java.time.Instant from,@RequestParam(required=false) java.time.Instant to,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.evaluationPage(mode,decision,prescriptionId,from,to,page,size);}
    @GetMapping("/evaluation-records/{id}") public EvaluationDetail evaluationDetail(@PathVariable Long id){return service.evaluationDetail(id);}
}
