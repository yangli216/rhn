package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.*;
import com.rhn.platform.maintenance.api.MaintenanceRelationalData.*;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Component
public class ClinicalCleanupParticipant implements MaintenanceParticipant {
    private final List<ClinicalMaintenanceContribution> contributions;
    private final Optional<MaintenanceRootDirectory> rootDirectory;
    private final MaintenanceRelationalData data;
    private final MaintenanceStore store;
    private final JsonCodec json;
    private final MaintenanceLifecycleService lifecycle;
    private final MaintenanceEnvironmentPolicy environment;
    public ClinicalCleanupParticipant(List<ClinicalMaintenanceContribution> contributions,
                                      Optional<MaintenanceRootDirectory> rootDirectory,
                                      MaintenanceRelationalData data, MaintenanceStore store, JsonCodec json,
                                      MaintenanceLifecycleService lifecycle, MaintenanceEnvironmentPolicy environment) {
        this.contributions = contributions.stream().sorted(Comparator.comparing(ClinicalMaintenanceContribution::code)).toList();
        this.rootDirectory = rootDirectory; this.data = data; this.store = store; this.json = json; this.lifecycle=lifecycle; this.environment=environment;
    }
    @Override public Dataset dataset() {
        return new Dataset("CLINICAL_TEST", "门诊—收费—药房测试业务", Set.of(Operation.CLEAN_TEST, Operation.RESET_PRELIVE),
                Set.of("OUTPATIENT", "BILLING", "PHARMACY"), "3");
    }
    @Override public List<Root> resetRoots(ExecutionContext actor, Scope scope) {
        lifecycle.requirePrelive(scope);
        return directory().allRoots(actor, scope);
    }
    @Override public void validateTestRoots(ExecutionContext actor, Scope scope, List<Root> roots, String evidence) {
        directory().requireRoots(actor, scope, roots);
        var snapshot = capture(actor, scope, roots);
        List<Issue> issues = contributions.stream().flatMap(part -> part.inspect(actor, scope, snapshot,
                dataset().modules(), roots).stream()).toList();
        if (!issues.isEmpty()) throw badRequest("MAINTENANCE_TEST_SOURCE_UNSAFE",
                "测试来源登记被阻断：" + issues.getFirst().message());
    }
    @Override public PreparedChange preview(ExecutionContext actor, Scope scope, Operation operation,
                                           Set<String> modules, List<Root> roots, String inputJson) {
        environment.requireOperation(operation);
        if (operation == Operation.RESET_PRELIVE) {
            lifecycle.requirePrelive(scope);
            var input = json.readObject(inputJson);
            if (!Boolean.TRUE.equals(input.get("noRealEffectsConfirmed")))
                throw badRequest("MAINTENANCE_PRELIVE_ATTESTATION_REQUIRED", "重置前需明确核对未发生真实诊疗、资金或药品交付");
            if (!directory().allRoots(actor, scope).equals(roots))
                throw conflict("MAINTENANCE_RESET_ROOTS_CHANGED", "范围内业务已变化，请重新预览");
        }
        directory().requireRoots(actor, scope, roots);
        var snapshot = capture(actor, scope, roots);
        Set<Long> rootIds = roots.stream().map(Root::resourceId).collect(java.util.stream.Collectors.toSet());
        var issues = new ArrayList<>(data.dependencies(scope.tenantId(), snapshot, modules, rootIds, Set.copyOf(scope.organizationIds())));
        contributions.forEach(part -> issues.addAll(part.inspect(actor, scope, snapshot, modules, roots)));
        if (contributions.stream().map(ClinicalMaintenanceContribution::code).distinct().count() != contributions.size())
            throw conflict("MAINTENANCE_CONTRIBUTION_DUPLICATE", "存在重复的领域维护能力");
        for (String module : modules) {
            if (snapshot.tables().stream().noneMatch(table -> table.definition().module().equals(module)))
                issues.add(new Issue("MAINTENANCE_MODULE_UNSUPPORTED", "该模块尚未完整接入清理能力", module));
        }
        List<Impact> impacts = snapshot.tables().stream().filter(table -> !table.rows().isEmpty()).map(table ->
                new Impact(table.definition().module(), table.definition().label(), table.rows().size(), table.rows().size(),
                        deleting(table, modules) ? "DELETE" : "KEEP")).toList();
        var lines = new ArrayList<>(snapshot.tables().stream().filter(table -> !table.rows().isEmpty()).map(table ->
                new PreviewLine(table.definition().module(), null, "", table.definition().label(),
                        deleting(table, modules) ? "DELETE" : "KEEP", table.rows().size() + " 条", deleting(table, modules) ? "清理" : "保留",
                        table.definition().retained() ? "受保护数据保留" : "按业务根对象的关联范围处理", null)).toList());
        contributions.forEach(part -> lines.addAll(part.compensationPreview(snapshot, modules)));
        return new PreparedChange(json.write(new Plan(snapshot, new TreeSet<>(modules), roots)), impacts, issues.stream().distinct().toList(),
                List.of("患者/居民主档", "租户、机构、人员与账号权限", "基础目录、价格与参数",
                        "期初库存和库存记账流水", "编号序列、迁移历史与维护审计"), lines);
    }
    @Override public String backup(ExecutionContext actor, Scope scope, PreparedChange change) { return change.payloadJson(); }
    @Override public void apply(ExecutionContext actor, Scope scope, PreparedChange change) {
        Plan plan = json.read(change.payloadJson(), Plan.class);
        for (var contribution : contributions.stream().sorted(Comparator.comparingInt(ClinicalMaintenanceContribution::beforeDeleteOrder)).toList())
            contribution.beforeDelete(actor, scope, plan.capture(), plan.modules());
        data.delete(scope.tenantId(), plan.capture(), plan.modules());
    }
    @Override public void verify(ExecutionContext actor, Scope scope, PreparedChange change) {
        Plan plan = json.read(change.payloadJson(), Plan.class);
        data.verifyDeleted(scope.tenantId(), plan.capture(), plan.modules());
        for (var contribution : contributions) contribution.verify(actor, scope, plan.capture(), plan.modules());
    }
    @Override public void afterCommit(ExecutionContext actor, Scope scope, PreparedChange change) {
        Plan plan = json.read(change.payloadJson(), Plan.class);
        for (var contribution : contributions) contribution.afterCommit(actor, scope, plan.capture(), plan.modules());
    }
    private Capture capture(ExecutionContext actor, Scope scope, List<Root> roots) {
        var definitions = contributions.stream().flatMap(part -> part.tables().stream()).toList();
        if (definitions.isEmpty()) throw badRequest("MAINTENANCE_MODULE_UNSUPPORTED", "临床领域维护能力尚未接入");
        Set<Long> ids = roots.stream().map(Root::resourceId).collect(java.util.stream.Collectors.toSet());
        Map<String, Set<Long>> seeds = new TreeMap<>();
        seeds.put("ID_ENC", new TreeSet<>(ids));
        Capture captured;
        boolean expanded;
        do {
            captured = data.capture(scope.tenantId(), definitions, seeds);
            expanded = false;
            for (var contribution : contributions) {
                for (var entry : contribution.relatedIdentifiers(captured).entrySet()) {
                    if (seeds.computeIfAbsent(entry.getKey(), key -> new TreeSet<>()).addAll(entry.getValue())) expanded = true;
                }
            }
        } while (expanded);
        Map<String, TableSnapshot> tables = new LinkedHashMap<>();
        captured.tables().forEach(table -> tables.put(table.definition().name(), table));
        for (var contribution : contributions) {
            for (var additional : contribution.additionalSnapshots(actor, scope, captured)) {
                var previous = tables.get(additional.definition().name());
                Map<Long, Row> merged = new TreeMap<>();
                if (previous != null) previous.rows().forEach(row -> merged.put(row.id(), row));
                additional.rows().forEach(row -> merged.put(row.id(), row));
                tables.put(additional.definition().name(), new TableSnapshot(additional.definition(), List.copyOf(merged.values())));
            }
        }
        return new Capture(List.copyOf(tables.values()), captured.identifiers());
    }
    private MaintenanceRootDirectory directory() {
        return rootDirectory.orElseThrow(() -> badRequest("MAINTENANCE_ROOT_DIRECTORY_UNAVAILABLE", "就诊来源核对能力尚未接入"));
    }
    private boolean deleting(TableSnapshot table, Set<String> modules) {
        return modules.contains(table.definition().module()) && !table.definition().retained();
    }
    public record Plan(Capture capture, Set<String> modules, List<Root> roots) {}
}
