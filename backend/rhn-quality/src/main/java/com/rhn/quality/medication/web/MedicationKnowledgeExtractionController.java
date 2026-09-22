package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgeExtractionContracts.*;
import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import com.rhn.quality.medication.application.MedicationKnowledgeExtractionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/quality/medication-knowledge-extractions")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgeExtractionController {
    private final MedicationKnowledgeExtractionService service;
    public MedicationKnowledgeExtractionController(MedicationKnowledgeExtractionService service) {this.service=service;}
    @GetMapping("/status") public MedicationRuleAuthoringAi.Status status() {return service.status();}
    @PostMapping public Run extract(@RequestBody Request input) {return service.extract(input);}
    @GetMapping public List<Summary> list(@RequestParam(defaultValue="0") int page) {return service.list(page);}
    @GetMapping("/{id}") public Run get(@PathVariable Long id) {return service.get(id);}
}
