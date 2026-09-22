package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.application.MedicationKnowledgeDraftService;
import com.rhn.shared.api.PageResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/quality/medication-knowledge-drafts")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgeDraftController {
    private final MedicationKnowledgeDraftService service;
    private final com.rhn.quality.medication.application.MedicationKnowledgeExamples examples;
    public MedicationKnowledgeDraftController(MedicationKnowledgeDraftService service,
            com.rhn.quality.medication.application.MedicationKnowledgeExamples examples) {this.service = service;this.examples=examples;}
    @GetMapping("/examples") public List<com.rhn.quality.medication.application.MedicationKnowledgeExamples.Example> examples() {return examples.list();}
    @GetMapping public PageResult<Summary> list(@RequestParam(defaultValue="") String query, @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {return service.list(query, page, size);}
    @PostMapping public Detail create(@RequestBody Save input) {return service.save(null, input);}
    @GetMapping("/{id}") public Detail detail(@PathVariable Long id) {return service.detail(id);}
    @GetMapping("/{id}/versions/{version}/intake-origin") public com.rhn.quality.medication.api.MedicationRuleIntakeContracts.Run origin(@PathVariable Long id,@PathVariable int version) {return service.intakeOrigin(id,version);}
    @GetMapping("/{id}/history") public List<Version> history(@PathVariable Long id, @RequestParam(defaultValue="0") int page) {return service.history(id, page);}
    @PostMapping("/{id}/versions") public Detail save(@PathVariable Long id, @RequestBody Save input) {return service.save(id, input);}
    @PostMapping("/validate") public Assessment validate(@RequestBody Body input) {return service.validate(input);}
    @PostMapping("/preview") public List<TestCase> preview(@RequestBody Body input) {return service.preview(input);}
}
