package com.rhn.quality.medication.web;

import com.rhn.quality.medication.application.MedicationRuleCatalogService;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.Candidate;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/quality/medication-rule-catalog")
public class MedicationRuleCatalogController {
    private final MedicationRuleCatalogService service;
    public MedicationRuleCatalogController(MedicationRuleCatalogService service) {this.service=service;}
    @GetMapping public Catalog ruleCatalog() {return service.catalog();}
    @PostMapping("/drafts") public Candidate ruleCatalogCreateDraft(@RequestBody DraftCommand command) {return service.draft(command);}
    @PostMapping("/{key}/commands") public CatalogEntry ruleCatalogCommand(@PathVariable String key,@RequestBody CatalogCommand command) {return service.command(key,command);}
    @GetMapping("/{key}/runs") public List<RuntimeRecord> ruleCatalogRuns(@PathVariable String key) {return service.runs(key);}
}
