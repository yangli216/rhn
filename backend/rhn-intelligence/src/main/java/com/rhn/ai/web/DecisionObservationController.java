package com.rhn.ai.web;

import com.rhn.ai.api.DecisionObservationContracts.*;
import com.rhn.ai.application.DecisionObservationService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;

@RestController
@RequestMapping("/api/ai/administration/decision-observations")
@PreAuthorize("hasAuthority(T(com.rhn.platform.configuration.api.ClinicalAiConfigurationPermissions).MANAGE)")
public class DecisionObservationController {
    private final DecisionObservationService service;
    public DecisionObservationController(DecisionObservationService service){this.service=service;}
    @GetMapping public DecisionObservation list(@RequestParam(required=false) String scene,@RequestParam(required=false) String mode,
            @RequestParam(required=false) String outcome,@RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.list(scene,mode,outcome,from,to,page,size);}
    @GetMapping("/{id}") public DecisionDetail detail(@PathVariable Long id){return service.detail(id);}
    @PostMapping("/{id}/reviews") public DecisionReview review(@PathVariable Long id,@Valid @RequestBody DecisionReviewRequest input){return service.review(id,input);}
}
