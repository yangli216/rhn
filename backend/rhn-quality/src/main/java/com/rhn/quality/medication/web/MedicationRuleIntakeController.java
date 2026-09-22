package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.*;
import com.rhn.quality.medication.application.MedicationRuleIntakeService;
import com.rhn.shared.api.PageResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/quality/medication-rule-intakes")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationRuleIntakeController {
    private final MedicationRuleIntakeService service;
    public MedicationRuleIntakeController(MedicationRuleIntakeService service) {this.service=service;}
    @GetMapping("/capabilities") public List<Capability> capabilities() {return service.capabilities();}
    @PostMapping public Run analyze(@RequestBody Request input) {return service.analyze(input);}
    @GetMapping public PageResult<Summary> history(@RequestParam(defaultValue="0") int page) {return service.history(page);}
    @GetMapping("/{id}/feedback-origin") public FeedbackOrigin origin(@PathVariable Long id) {return service.feedbackOrigin(id);}
    @GetMapping("/{id}") public Run get(@PathVariable Long id) {return service.get(id);}
}
