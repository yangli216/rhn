package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.*;
import com.rhn.quality.medication.application.MedicationKnowledgeTestService;
import com.rhn.shared.api.PageResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-knowledge-rule-candidates/{id}/tests")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgeTestController {
    private final MedicationKnowledgeTestService service;
    public MedicationKnowledgeTestController(MedicationKnowledgeTestService service) {this.service=service;}
    @GetMapping("/suites") public PageResult<SuiteSummary> suites(@PathVariable Long id,@RequestParam(defaultValue="0") int page) {return service.suites(id,page);}
    @GetMapping("/suites/{version}") public SuiteDetail suite(@PathVariable Long id,@PathVariable int version) {return service.suite(id,version);}
    @PostMapping("/suites") public SuiteDetail save(@PathVariable Long id,@RequestBody Save input) {return service.save(id,input);}
    @GetMapping("/runs") public PageResult<RunSummary> runs(@PathVariable Long id,@RequestParam(defaultValue="0") int page) {return service.runs(id,page);}
    @GetMapping("/runs/{runId}") public Run run(@PathVariable Long id,@PathVariable Long runId) {return service.run(id,runId);}
    @PostMapping("/runs") public Run execute(@PathVariable Long id,@RequestBody Execute input) {return service.execute(id,input);}
}
