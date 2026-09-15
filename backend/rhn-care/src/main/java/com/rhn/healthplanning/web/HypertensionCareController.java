package com.rhn.healthplanning.web;

import com.rhn.healthplanning.api.HypertensionCandidateView;
import com.rhn.healthplanning.application.HypertensionScreeningService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/health-planning/hypertension-candidates")
class HypertensionCareController {
    private final HypertensionScreeningService service;

    HypertensionCareController(HypertensionScreeningService service) {
        this.service = service;
    }

    @GetMapping
    List<HypertensionCandidateView> candidates(@RequestParam(required = false) Long residentId) {
        return service.candidates(residentId);
    }
}
