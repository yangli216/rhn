package com.rhn.analytics.web;

import com.rhn.analytics.api.PilotAnalysis.*;
import com.rhn.analytics.application.PilotAnalysisService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import java.util.List;

@RestController
@RequestMapping("/api/analytics/pilot")
@PreAuthorize("hasAuthority('PORTAL.ACCESS')")
public class PilotAnalysisController {
    private final PilotAnalysisService service;
    private final com.rhn.analytics.application.AnalysisInterpretationService interpretation;
    public PilotAnalysisController(PilotAnalysisService service, com.rhn.analytics.application.AnalysisInterpretationService interpretation){this.service=service;this.interpretation=interpretation;}
    @GetMapping("/ai-status") public com.rhn.ai.api.StructuredAiDirectory.Status aiStatus(){return interpretation.status();}
    @PostMapping("/interpret") public Interpretation interpret(@Valid @RequestBody InterpretRequest request){return interpretation.interpret(request);}
    @PostMapping("/query") public Result query(@Valid @RequestBody Query query){return service.query(query);}
    @GetMapping("/saved") public List<Saved> saved(){return service.saved();}
    @PostMapping("/saved") public Saved save(@Valid @RequestBody Save request){return service.save(request);}
}
