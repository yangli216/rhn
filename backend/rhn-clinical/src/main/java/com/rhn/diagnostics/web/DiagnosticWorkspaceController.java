package com.rhn.diagnostics.web;

import com.rhn.diagnostics.api.DiagnosticExecutionTaskView;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.application.DiagnosticExecutionService;
import com.rhn.diagnostics.application.DiagnosticWorkspaceService;
import com.rhn.diagnostics.application.DiagnosticWorkspaceService.LocalReportCommand;
import com.rhn.diagnostics.application.DiagnosticWorkspaceService.LocalObservation;
import com.rhn.diagnostics.application.DiagnosticWorkspaceService.DraftView;
import com.rhn.diagnostics.application.DiagnosticWorkspaceService.IssueDraftCommand;
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

    @GetMapping("/worklist-page")
    com.rhn.shared.api.PageResult<DiagnosticExecutionTaskView> worklistPage(
            @RequestParam String requestType, @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "0") @jakarta.validation.constraints.Min(0) int page,
            @RequestParam(defaultValue = "20") @jakarta.validation.constraints.Min(1)
            @jakarta.validation.constraints.Max(100) int size,
            @RequestParam(required = false) Long encounterId, @RequestParam(required = false) Long residentId,
            @RequestParam(required = false) com.rhn.diagnostics.domain.DiagnosticExecutionTaskStatus status,
            @RequestParam(required = false) java.time.Instant createdFrom,
            @RequestParam(required = false) java.time.Instant createdBefore,
            @RequestParam(defaultValue = "false") boolean activeAndRecent) {
        return execution.worklistPage(requestType, keyword, page, size, encounterId, residentId, status, createdFrom, createdBefore, activeAndRecent);
    }

    @PostMapping("/tasks/{taskId}/collection")
    DiagnosticExecutionTaskView collect(@PathVariable Long taskId, @Valid @RequestBody CollectionRequest input) {
        return execution.collect(taskId, input.expectedRevision(), input.specimenNo(), input.note());
    }

    @GetMapping("/tasks/{taskId}")
    DiagnosticExecutionTaskView task(@PathVariable Long taskId) { return execution.task(taskId); }

    @PostMapping("/tasks/{taskId}/start")
    DiagnosticExecutionTaskView start(@PathVariable Long taskId, @Valid @RequestBody StartRequest input) {
        return execution.start(taskId, input.expectedRevision());
    }

    @PostMapping("/tasks/{taskId}/local-reports")
    @ResponseStatus(HttpStatus.CREATED)
    DiagnosticReportResponse report(@PathVariable Long taskId, @Valid @RequestBody LocalReportRequest input) {
        return workspace.recordLocalReport(taskId, input.command());
    }

    @GetMapping("/tasks/{taskId}/report-template")
    com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.TemplateView template(@PathVariable Long taskId) {
        return workspace.template(taskId);
    }

    @GetMapping("/tasks/{taskId}/report-draft")
    DraftView draft(@PathVariable Long taskId) { return workspace.draft(taskId); }

    @PostMapping("/tasks/{taskId}/report-draft")
    DraftView saveDraft(@PathVariable Long taskId, @Valid @RequestBody LocalReportRequest input) {
        return workspace.saveDraft(taskId, input.command());
    }

    @PostMapping("/tasks/{taskId}/report-draft/issue")
    @ResponseStatus(HttpStatus.CREATED)
    DiagnosticReportResponse issueDraft(@PathVariable Long taskId, @Valid @RequestBody IssueDraftRequest input) {
        return workspace.issueDraft(taskId, new IssueDraftCommand(
                input.expectedRevision(), input.expectedDraftRevision(), input.commandId()));
    }

    record IssueDraftRequest(@NotNull Long expectedRevision, @NotNull Long expectedDraftRevision,
                             @NotBlank @Size(max = 64) String commandId) {}
    record LocalObservationRequest(
            @Size(max = 64) String observationCode, @Size(max = 200) String observationName,
            @Pattern(regexp = "NUMBER|STRING|CODE") String valueType,
            @Size(max = 1000) String observationValue, @Size(max = 64) String unitCode,
            BigDecimal referenceRangeLow, BigDecimal referenceRangeHigh,
            @Pattern(regexp = "N|NORMAL|H|HH|L|LL|A|CRITICAL|PANIC") String interpretationCode,
            @Pattern(regexp = "EQ|LT|LE|GT|GE") String valueComparator,
            @Size(max = 64) String instrumentCode, @Size(max = 64) String populationCode) {
        LocalObservation command() { return new LocalObservation(observationCode, observationName, valueType,
                observationValue, unitCode, referenceRangeLow, referenceRangeHigh, interpretationCode,
                valueComparator, instrumentCode, populationCode, null, null); }
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
            @Size(max = 20000) String conclusion,
            @Size(max = 200) List<@Valid @NotNull LocalObservationRequest> observations,
            @Size(max = 20000) String findings,
            Long expectedDraftRevision, @Size(max = 1000) String correctionReason,
            @Size(max = 64) String commandId, Long templateVersionId) {
        LocalReportCommand command() { return new LocalReportCommand(expectedRevision, valueType,
                observationValue, unitCode, referenceRangeLow, referenceRangeHigh, interpretationCode, conclusion,
                observations == null ? null : observations.stream().map(LocalObservationRequest::command).toList(),
                findings, expectedDraftRevision, correctionReason, commandId, templateVersionId, null); }
    }
}
