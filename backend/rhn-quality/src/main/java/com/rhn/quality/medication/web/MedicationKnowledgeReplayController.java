package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgeReplayContracts.*;
import com.rhn.quality.medication.application.MedicationKnowledgeReplayService;
import com.rhn.shared.api.PageResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-knowledge-drafts")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgeReplayController {
    private final MedicationKnowledgeReplayService service;
    public MedicationKnowledgeReplayController(MedicationKnowledgeReplayService service) {this.service=service;}
    @GetMapping("/replay-sources") public PageResult<Source> sources(@RequestParam(defaultValue="0") int page) {return service.sources(page);}
    @PostMapping("/{id}/replays") public Run replay(@PathVariable Long id,@RequestBody Request input) {return service.replay(id,input);}
    @GetMapping("/{id}/replays") public PageResult<Summary> history(@PathVariable Long id,@RequestParam(defaultValue="0") int page) {return service.history(id,page);}
    @GetMapping("/{id}/replays/{runId}") public Run detail(@PathVariable Long id,@PathVariable Long runId) {return service.detail(id,runId);}
}
