package com.rhn.platform.maintenance.api;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Set;

/** Public maintenance contracts contain summaries, never database backups or credentials. */
public final class MaintenanceModels {
    private MaintenanceModels() {}

    @Schema(name = "MaintenanceOperation")
    public enum Operation { INITIALIZE, IMPORT_CATALOG, CLEAN_TEST, RESET_PRELIVE }
    @Schema(name = "MaintenanceLifecycle")
    public enum Lifecycle { UNKNOWN, PRELIVE, LIVE }
    @Schema(name = "MaintenanceLifecycleRequest")
    public record LifecycleRequest(ScopeRequest scope, Lifecycle lifecycle, String confirmation, String reason, Boolean noRealEffectsConfirmed) {}
    @Schema(name = "MaintenanceOrganizationLifecycle")
    public record OrganizationLifecycle(Long organizationId, Lifecycle lifecycle) {}
    @Schema(name = "MaintenanceTaskStatus")
    public enum TaskStatus { QUEUED, PREPARING, RUNNING, VERIFYING, SUCCEEDED, FAILED, CANCELLED }

    @Schema(name = "MaintenanceScope")
    public record Scope(Long tenantId, boolean wholeTenant, List<Long> organizationIds) {
        public Scope { organizationIds = List.copyOf(organizationIds); }
    }
    @Schema(name = "MaintenanceScopeRequest")
    public record ScopeRequest(boolean wholeTenant, List<Long> organizationIds, boolean includeDescendants) {}
    @Schema(name = "MaintenanceRoot")
    public record Root(String module, String resourceType, Long resourceId, Long organizationId) {}
    @Schema(name = "MaintenanceDataset")
    public record Dataset(String code, String label, Set<Operation> operations, Set<String> modules,
                          String ruleVersion) {
        public Dataset { operations = Set.copyOf(operations); modules = Set.copyOf(modules); }
    }
    @Schema(name = "MaintenanceImpact")
    public record Impact(String module, String label, long objectCount, long recordCount, String disposition) {}
    @Schema(name = "MaintenanceIssue")
    public record Issue(String code, String message, String module) {}
    @Schema(name = "MaintenancePreviewLine")
    public record PreviewLine(String module, Long organizationId, String code, String label, String action,
                              String beforeValue, String afterValue, String detail, Integer rowNumber) {}
    @Schema(name = "MaintenanceBatchRequest")
    public record BatchRequest(ScopeRequest scope, String name, String evidence, String requestCode,
                               String datasetCode, List<Root> roots, Boolean noRealEffectsConfirmed) {
        public BatchRequest(ScopeRequest scope, String name, String evidence, String requestCode,
                            String datasetCode, List<Root> roots) {
            this(scope, name, evidence, requestCode, datasetCode, roots, true);
        }
    }
    @Schema(name = "MaintenanceBatchView")
    public record BatchView(Long id, Scope scope, String datasetCode, String name, String evidence, String createdBy,
                            Instant createdAt, List<Root> roots) {}
    @Schema(name = "MaintenancePreviewRequest")
    public record PreviewRequest(ScopeRequest scope, Operation operation, String datasetCode, Set<String> modules,
                                 Long batchId, String inputJson, String reason) {}
    @Schema(name = "MaintenancePlanView")
    public record PlanView(Long id, Scope scope, Operation operation, String datasetCode, Set<String> modules,
                           Long batchId, String reason, String fingerprint, Instant expiresAt,
                           List<Impact> impacts, List<Issue> blockers, List<String> retained, List<PreviewLine> lines) {
        public PlanView { lines = lines == null ? List.of() : List.copyOf(lines); }
        public PlanView(Long id, Scope scope, Operation operation, String datasetCode, Set<String> modules,
                        Long batchId, String reason, String fingerprint, Instant expiresAt,
                        List<Impact> impacts, List<Issue> blockers, List<String> retained) {
            this(id, scope, operation, datasetCode, modules, batchId, reason, fingerprint, expiresAt, impacts, blockers, retained, List.of());
        }
        public boolean executable() { return blockers.isEmpty(); }
    }
    @Schema(name = "MaintenanceExecuteRequest")
    public record ExecuteRequest(String fingerprint, String requestCode, String confirmation) {}
    @Schema(name = "MaintenanceTaskView")
    public record TaskView(Long id, Long planId, Scope scope, Operation operation, String datasetCode,
                           Set<String> modules, TaskStatus status, String actor, Instant createdAt,
                           Instant updatedAt, String failureCode, String failureMessage) {}
    @Schema(name = "MaintenanceAuditView")
    public record AuditView(Long id, Long resourceId, String action, String actor, Instant createdAt,
                            String detail) {}
}
