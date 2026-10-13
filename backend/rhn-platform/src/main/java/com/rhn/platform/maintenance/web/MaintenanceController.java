package com.rhn.platform.maintenance.web;

import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.api.MaintenanceWorkspace;
import com.rhn.platform.maintenance.api.MaintenanceRootDirectory;
import com.rhn.platform.maintenance.application.MaintenanceWorkspaceService;
import org.springframework.http.ResponseEntity;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import com.rhn.platform.maintenance.application.MaintenancePlanningService;
import com.rhn.platform.maintenance.application.MaintenanceTaskService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/platform/maintenance")
@PreAuthorize("hasAuthority('MAINTENANCE.VIEW')")
public class MaintenanceController {
    private final MaintenancePlanningService planning;
    private final MaintenanceTaskService tasks;
    private final MaintenanceWorkspaceService workspace;
    private final com.rhn.platform.maintenance.application.MaintenanceLifecycleService lifecycle;

    public MaintenanceController(MaintenancePlanningService planning, MaintenanceTaskService tasks, MaintenanceWorkspaceService workspace, com.rhn.platform.maintenance.application.MaintenanceLifecycleService lifecycle) {
        this.planning = planning; this.tasks = tasks; this.workspace = workspace; this.lifecycle=lifecycle;
    }
    @PostMapping("/lifecycle")
    @PreAuthorize("hasAuthority('MAINTENANCE.LIFECYCLE')")
    List<OrganizationLifecycle> lifecycle(@RequestBody LifecycleRequest request) { return lifecycle.transition(request); }
    @GetMapping("/workspace")
    MaintenanceWorkspace workspace() { return workspace.workspace(); }
    @PostMapping("/candidates")
    @PreAuthorize("hasAuthority('MAINTENANCE.MANAGE')")
    List<MaintenanceRootDirectory.RootCandidate> candidates(@RequestBody CandidateRequest request) {
        return workspace.candidates(request.scope(), request.query());
    }
    @io.swagger.v3.oas.annotations.media.Schema(name = "MaintenanceCandidateRequest")
    record CandidateRequest(ScopeRequest scope, String query) {}
    @GetMapping("/tasks/{id}/backup")
    @PreAuthorize("hasAuthority('MAINTENANCE.BACKUP')")
    ResponseEntity<byte[]> backup(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Content-Disposition", "attachment; filename=maintenance-" + id + ".json")
                .contentType(MediaType.APPLICATION_OCTET_STREAM).body(tasks.backupExport(id));
    }
    @GetMapping("/datasets")
    List<Dataset> datasets() { return planning.datasets(); }
    @GetMapping("/batches")
    List<BatchView> batches() { return planning.batches(); }
    @PostMapping("/batches")
    @PreAuthorize("hasAuthority('MAINTENANCE.MANAGE')")
    BatchView register(@RequestBody BatchRequest request) { return planning.registerBatch(request); }
    @PostMapping("/plans")
    @PreAuthorize("hasAuthority('MAINTENANCE.MANAGE')")
    PlanView preview(@RequestBody PreviewRequest request) { return planning.preview(request); }
    @GetMapping("/plans/{id}")
    PlanView plan(@PathVariable Long id) { return planning.plan(id); }
    @PostMapping("/plans/{id}/execute")
    @PreAuthorize("hasAuthority('MAINTENANCE.EXECUTE')")
    TaskView execute(@PathVariable Long id, @RequestBody ExecuteRequest request) { return tasks.execute(id, request); }
    @GetMapping("/tasks")
    List<TaskView> tasks() { return tasks.tasks(); }
    @GetMapping("/tasks/{id}")
    TaskView task(@PathVariable Long id) { return tasks.task(id); }
    @GetMapping("/tasks/{id}/audit")
    List<AuditView> audit(@PathVariable Long id) { return tasks.audit(id); }
    @PostMapping("/tasks/{id}/cancel")
    @PreAuthorize("hasAuthority('MAINTENANCE.EXECUTE')")
    TaskView cancel(@PathVariable Long id) { return tasks.cancel(id); }
    @PostMapping("/tasks/{id}/retry-verification")
    @PreAuthorize("hasAuthority('MAINTENANCE.EXECUTE')")
    TaskView retryVerification(@PathVariable Long id) { return tasks.retryVerification(id); }
}
