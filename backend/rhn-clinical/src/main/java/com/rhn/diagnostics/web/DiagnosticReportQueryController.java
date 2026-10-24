package com.rhn.diagnostics.web;

import com.rhn.diagnostics.api.DiagnosticReportQueryRow;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.application.DiagnosticReportQueryService;
import com.rhn.shared.api.PageResult;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/diagnostics/reports")
@PreAuthorize(com.rhn.diagnostics.api.DiagnosticPermissions.ACCESS)
public class DiagnosticReportQueryController {
    private final DiagnosticReportQueryService queries;
    public DiagnosticReportQueryController(DiagnosticReportQueryService queries) { this.queries = queries; }

    @GetMapping
    PageResult<DiagnosticReportQueryRow> query(@RequestParam String requestType,
            @RequestParam(defaultValue = "") @Size(max = 200) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Instant issuedFrom, @RequestParam(required = false) Instant issuedBefore,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return queries.query(requestType, keyword, status, issuedFrom, issuedBefore, page, size);
    }

    @GetMapping("/{reportId}/history")
    List<DiagnosticReportResponse> history(@PathVariable Long reportId) { return queries.history(reportId); }
}
