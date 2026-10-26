package com.rhn.diagnostics.web;

import com.rhn.diagnostics.application.DiagnosticSpecimenService;
import com.rhn.diagnostics.application.DiagnosticSpecimenService.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/diagnostics")
@PreAuthorize(com.rhn.diagnostics.api.DiagnosticPermissions.ACCESS)
public class DiagnosticSpecimenController {
    private final DiagnosticSpecimenService specimens;
    public DiagnosticSpecimenController(DiagnosticSpecimenService specimens) { this.specimens=specimens; }
    @GetMapping("/tasks/{taskId}/specimens")
    List<SpecimenView> list(@PathVariable Long taskId) { return specimens.forTask(taskId); }
    @GetMapping("/specimens/scan")
    SpecimenView scan(@RequestParam @NotBlank @Size(max=64) String specimenNo) { return specimens.scan(specimenNo); }
    @PostMapping("/specimens")
    List<SpecimenView> generate(@Valid @RequestBody GenerateRequest input) {
        return specimens.generate(new GenerateCommand(input.tasks().stream()
                .map(task->new TaskSelection(task.taskId(),task.expectedRevision(),task.specimenConfigurationId())).toList(),input.commandId()));
    }
    @PostMapping("/specimens/plan")
    TubePlanView specimenPlan(@Valid @RequestBody SpecimenPlanRequest input) {
        return specimens.preview(input.tasks().stream().map(task->new TaskSelection(task.taskId(),0L,task.specimenConfigurationId())).toList());
    }
    @PostMapping("/specimens/{id}/collection")
    SpecimenView collect(@PathVariable Long id,@Valid @RequestBody VersionRequest input) { return specimens.collect(id,input.expectedRevision()); }
    @PostMapping("/specimens/{id}/receipt")
    SpecimenView receive(@PathVariable Long id,@Valid @RequestBody VersionRequest input) { return specimens.receive(id,input.expectedRevision()); }
    @PostMapping("/specimens/{id}/rejection")
    SpecimenView reject(@PathVariable Long id,@Valid @RequestBody RejectRequest input) { return specimens.reject(id,input.expectedRevision(),input.reason()); }
    @PostMapping("/specimens/{id}/recollection")
    SpecimenView recollect(@PathVariable Long id,@Valid @RequestBody RecollectRequest input) { return specimens.recollect(id,input.expectedRevision(),input.commandId()); }
    record TaskRequest(@NotNull Long taskId,@NotNull Long expectedRevision,Long specimenConfigurationId) {}
    record GenerateRequest(@NotEmpty @Size(max=50) List<@Valid TaskRequest> tasks,@NotBlank @Size(max=64) String commandId) {}
    record SpecimenPlanTaskRequest(@NotNull Long taskId,Long specimenConfigurationId) {}
    record SpecimenPlanRequest(@NotEmpty @Size(max=50) List<@Valid SpecimenPlanTaskRequest> tasks) {}
    record VersionRequest(@NotNull Long expectedRevision) {}
    record RejectRequest(@NotNull Long expectedRevision,@NotBlank @Size(max=1000) String reason) {}
    record RecollectRequest(@NotNull Long expectedRevision,@NotBlank @Size(max=64) String commandId) {}
}
