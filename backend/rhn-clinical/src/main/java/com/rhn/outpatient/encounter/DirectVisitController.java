package com.rhn.outpatient.encounter;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/encounters/direct-visit")
public class DirectVisitController {
    private final DirectVisitService service;
    public DirectVisitController(DirectVisitService service) { this.service = service; }

    @GetMapping("/settings")
    DirectVisitService.Settings settings() { return service.settings(); }

    @PostMapping
    DirectVisitService.Result receive(@Valid @RequestBody DirectVisitService.Request request) {
        return service.receive(request);
    }
}
