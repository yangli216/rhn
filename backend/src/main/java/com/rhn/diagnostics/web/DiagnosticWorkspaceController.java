package com.rhn.diagnostics.web;

import com.rhn.diagnostics.api.DiagnosticExecutionTaskView;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.application.DiagnosticExecutionService;
import com.rhn.diagnostics.application.DiagnosticWorkspaceService;
import com.rhn.diagnostics.application.DiagnosticWorkspaceService.LocalReportCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/diagnostics")
@PreAuthorize(com.rhn.diagnostics.api.DiagnosticPermissions.ACCESS)
public class DiagnosticWorkspaceController {
    private final DiagnosticExecutionService execution;
    private final DiagnosticWorkspaceService workspace;

    public DiagnosticWorkspaceController(DiagnosticExecutionService execution, DiagnosticWorkspaceService workspace) {
        this.execution = execution; this.workspace = workspace;
    }

    @GetMapping("/worklist")
    List<DiagnosticExecutionTaskView> worklist(@RequestParam(required = false) String requestType,
                                               @RequestParam(required = false) String status) {
        return execution.worklist(requestType, status);
    }

    @PostMapping("/tasks/{taskId}/collection")
    DiagnosticExecutionTaskView collect(@PathVariable Long taskId, @Valid @RequestBody CollectionRequest input) {
        return execution.collect(taskId, input.expectedRevision(), input.specimenNo(), input.note());
    }

    @PostMapping("/tasks/{taskId}/start")
    DiagnosticExecutionTaskView start(@PathVariable Long taskId, @Valid @RequestBody StartRequest input) {
        return execution.start(taskId, input.expectedRevision());
    }

    @PostMapping("/tasks/{taskId}/local-reports")
    @ResponseStatus(HttpStatus.CREATED)
    DiagnosticReportResponse report(@PathVariable Long taskId, @Valid @RequestBody LocalReportRequest input) {
        return workspace.recordLocalReport(taskId, input.command());
    }

    record CollectionRequest(@NotNull Long expectedRevision,
                             @NotBlank @Size(max = 64) String specimenNo,
                             @Size(max = 1000) String note) {}
    record StartRequest(@NotNull Long expectedRevision) {}
    record LocalReportRequest(
            @NotNull Long expectedRevision,
            @Pattern(regexp = "NUMBER|STRING") String valueType,
            @Size(max = 1000) String observationValue,
            @Size(max = 64) String unitCode,
            BigDecimal referenceRangeLow, BigDecimal referenceRangeHigh,
            @Pattern(regexp = "N|NORMAL|H|HH|L|LL|A|CRITICAL|PANIC") String interpretationCode,
            @Size(max = 20000) String conclusion) {
        LocalReportCommand command() { return new LocalReportCommand(expectedRevision, valueType,
                observationValue, unitCode, referenceRangeLow, referenceRangeHigh, interpretationCode, conclusion); }
    }
}
