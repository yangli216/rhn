package com.rhn.diagnostics.web;

import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.application.DiagnosticExchangeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class DiagnosticReportController {
    private final DiagnosticExchangeService service;
    public DiagnosticReportController(DiagnosticExchangeService service) { this.service = service; }

    @GetMapping("/encounters/{encounterId}/diagnostic-reports")
    List<DiagnosticReportResponse> byEncounter(@PathVariable Long encounterId) {
        return service.listByEncounter(encounterId);
    }

    @GetMapping("/service-requests/{requestId}/diagnostic-reports")
    List<DiagnosticReportResponse> byRequest(@PathVariable Long requestId) {
        return service.listByRequest(requestId);
    }
}
