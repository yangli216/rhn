package com.rhn.analytics.web.v2;

import com.rhn.analytics.semantic.execution.ExecutionResult;
import com.rhn.analytics.semantic.execution.SemanticAnalysisService;
import com.rhn.analytics.semantic.interpreter.AnalysisIntentInterpreter;
import com.rhn.analytics.semantic.model.SemanticQuery;
import com.rhn.analytics.semantic.plan.CompiledQuery;
import com.rhn.analytics.semantic.plan.LogicalQueryPlan;
import com.rhn.analytics.semantic.plan.PlannedScope;
import com.rhn.analytics.semantic.resolver.Resolution;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/analytics/v2")
@PreAuthorize("hasAuthority('PORTAL.ACCESS')")
public class SemanticAnalysisController {

    private final AnalysisIntentInterpreter interpreter;
    private final SemanticAnalysisService analysisService;

    public SemanticAnalysisController(
        AnalysisIntentInterpreter interpreter,
        SemanticAnalysisService analysisService
    ) {
        this.interpreter = interpreter;
        this.analysisService = analysisService;
    }

    @Operation(operationId = "analyticsV2Interpret")
    @PostMapping("/interpret")
    public SemanticQuery interpret(@RequestBody AnalysisIntentInterpreter.InterpretRequest request) {
        return interpreter.interpret(request);
    }

    @Operation(operationId = "analyticsV2Resolve")
    @PostMapping("/resolve")
    public Resolution resolve(@RequestBody SemanticQuery query) {
        return analysisService.resolve(query);
    }

    @Operation(operationId = "analyticsV2Plan")
    @PostMapping("/plan")
    public LogicalQueryPlan plan(@RequestBody SemanticQuery query) {
        Resolution resolution = analysisService.resolve(query);
        if (resolution.query() == null) {
            throw new IllegalArgumentException("Cannot plan unresolved query: " + resolution.status());
        }
        PlannedScope scope = analysisService.resolveCurrentScope(query.scope());
        return analysisService.plan(resolution.query(), scope, LocalDate.now());
    }

    @Operation(operationId = "analyticsV2Compile")
    @PostMapping("/compile")
    public CompiledQuery compile(@RequestBody SemanticQuery query) {
        Resolution resolution = analysisService.resolve(query);
        if (resolution.query() == null) {
            throw new IllegalArgumentException("Cannot compile unresolved query: " + resolution.status());
        }
        PlannedScope scope = analysisService.resolveCurrentScope(query.scope());
        LogicalQueryPlan plan = analysisService.plan(resolution.query(), scope, LocalDate.now());
        var validation = analysisService.validate(plan);
        if (!validation.isValid()) {
            throw new IllegalStateException("Query plan validation failed: " + String.join(", ", validation.errors()));
        }
        return analysisService.compile(plan);
    }

    @Operation(operationId = "analyticsV2Execute")
    @PostMapping("/execute")
    public ExecutionResult execute(@RequestBody ExecuteRequest request) {
        if (request.query() != null) {
            return analysisService.executeEndToEnd(request.query(), request.scope());
        } else if (request.text() != null && !request.text().isBlank()) {
            return analysisService.executeNaturalLanguage(request.text(), request.scope());
        } else {
            throw new IllegalArgumentException("Either query or text must be provided");
        }
    }

    public record ExecuteRequest(
        SemanticQuery query,
        String text,
        PlannedScope scope
    ) {}
}
