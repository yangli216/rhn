package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationKnowledgeReviewContracts.*;
import com.rhn.quality.medication.application.MedicationKnowledgeReviewService;
import com.rhn.shared.api.PageResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-knowledge-rule-candidates/{id}/review")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationKnowledgeReviewController {
    private final MedicationKnowledgeReviewService service;
    public MedicationKnowledgeReviewController(MedicationKnowledgeReviewService service) {this.service=service;}
    @GetMapping public Preview preview(@PathVariable Long id) {return service.preview(id);}
    @PostMapping("/commands") public Event command(@PathVariable Long id,@RequestBody Command command) {return service.command(id,command);}
    @GetMapping("/history") public PageResult<Summary> history(@PathVariable Long id,@RequestParam(defaultValue="0") int page) {return service.history(id,page);}
    @GetMapping("/history/{eventId}") public Event event(@PathVariable Long id,@PathVariable Long eventId) {return service.event(id,eventId);}
}
