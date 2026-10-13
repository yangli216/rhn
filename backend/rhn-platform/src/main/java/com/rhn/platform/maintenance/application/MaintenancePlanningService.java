package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import com.rhn.platform.maintenance.infrastructure.StoredMaintenancePlan;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MaintenancePlanningService {
    private final MaintenanceAccess access;
    private final MaintenanceRegistry registry;
    private final MaintenanceStore store;
    private final JsonCodec json;
    private final MaintenanceEnvironmentPolicy environment;

    public MaintenancePlanningService(MaintenanceAccess access, MaintenanceRegistry registry,
                                      MaintenanceStore store, JsonCodec json, MaintenanceEnvironmentPolicy environment) {
        this.access = access; this.registry = registry; this.store = store; this.json = json; this.environment = environment;
    }

    public List<Dataset> datasets() {
        access.current("MAINTENANCE.VIEW");
        return registry.datasets();
    }

    @Transactional
    public BatchView registerBatch(BatchRequest request) {
        var actor = access.current("MAINTENANCE.MANAGE");
        if (!Boolean.TRUE.equals(request.noRealEffectsConfirmed()))
            throw badRequest("MAINTENANCE_TEST_ATTESTATION_REQUIRED", "需明确核对所选业务为测试数据，且未发生真实资金或药品交付");
        Scope scope = access.expand(actor, request.scope());
        String name = required(request.name(), "批次名称", 200);
        String evidence = required(request.evidence(), "测试来源核对依据", 1000);
        String command = required(request.requestCode(), "请求编码", 128);
        var participant = registry.require(request.datasetCode());
        if (!participant.dataset().operations().contains(Operation.CLEAN_TEST))
            throw badRequest("MAINTENANCE_BATCH_UNSUPPORTED", "该数据集不支持测试业务批次");
        if (request.roots() == null || request.roots().isEmpty() || request.roots().size() > 1000)
            throw badRequest("MAINTENANCE_ROOTS_INVALID", "测试批次需包含1至1000个明确的业务根对象");
        if (request.roots().stream().anyMatch(root -> root == null || root.module() == null
                || root.resourceType() == null || root.resourceId() == null))
            throw badRequest("MAINTENANCE_ROOTS_INVALID", "业务根对象的模块、类型与标识不能为空");
        List<Root> roots = request.roots().stream()
                .sorted(Comparator.comparing(Root::module).thenComparing(Root::resourceType).thenComparing(Root::resourceId))
                .toList();
        if (roots.stream().distinct().count() != roots.size())
            throw badRequest("MAINTENANCE_ROOT_DUPLICATE", "测试批次不能重复登记同一业务对象");
        for (Root root : roots) {
            if (root.resourceId() == null || root.resourceId() <= 0
                    || !scope.organizationIds().contains(root.organizationId())
                    || !participant.dataset().modules().contains(root.module()))
                throw badRequest("MAINTENANCE_ROOT_SCOPE_INVALID", "业务对象必须属于所选机构及模块");
        }
        String hash = digest(new BatchRequest(new ScopeRequest(scope.wholeTenant(), scope.organizationIds(), false),
                name, evidence, command, request.datasetCode(), roots));
        var repeated = store.batchByCommand(actor.tenantId(), command, hash);
        if (repeated.isPresent()) { access.requireScope(actor, repeated.get().scope()); return repeated.get(); }
        participant.validateTestRoots(actor, scope, roots, evidence);
        BatchView view = new BatchView(GlobalIds.next(), scope, request.datasetCode(), name, evidence,
                actor.actor(), Instant.now(), roots);
        store.saveBatch(view, command, hash);
        store.audit(actor.tenantId(), view.id(), "REGISTER_BATCH", actor.actor(), "已核对测试来源及业务对象归属");
        return view;
    }

    public List<BatchView> batches() {
        var actor = access.current("MAINTENANCE.VIEW");
        return store.batches(actor.tenantId()).stream().filter(value -> visible(actor, value.scope())).toList();
    }

    @Transactional
    public PlanView preview(PreviewRequest request) {
        var actor = access.current("MAINTENANCE.MANAGE");
        Scope scope = access.expand(actor, request.scope());
        environment.requireOperation(request.operation());
        String reason = required(request.reason(), "操作原因", 1000);
        var participant = registry.require(request.datasetCode());
        if (request.operation() == null || !participant.dataset().operations().contains(request.operation()))
            throw badRequest("MAINTENANCE_OPERATION_UNSUPPORTED", "该数据集不支持所选维护场景");
        if (request.modules() == null || request.modules().isEmpty()
                || !participant.dataset().modules().containsAll(request.modules()))
            throw badRequest("MAINTENANCE_MODULE_INVALID", "请选择该数据集支持的业务模块");
        var modules = new TreeSet<>(request.modules());
        String input = request.inputJson() == null || request.inputJson().isBlank() ? "{}" : request.inputJson();
        if (input.length() > 8_000_000) throw badRequest("MAINTENANCE_INPUT_TOO_LARGE", "维护输入超过允许大小");
        json.readStrictTree(input);
        List<Root> roots = List.of();
        if (request.operation() == Operation.CLEAN_TEST) {
            if (request.batchId() == null) throw badRequest("MAINTENANCE_BATCH_REQUIRED", "请选择有明确来源的测试批次");
            BatchView batch = store.batch(actor.tenantId(), request.batchId());
            access.requireScope(actor, batch.scope());
            if (!batch.datasetCode().equals(request.datasetCode()))
                throw badRequest("MAINTENANCE_BATCH_DATASET_MISMATCH", "测试批次不属于所选业务数据集");
            roots = batch.roots().stream().filter(root -> scope.organizationIds().contains(root.organizationId())).toList();
            if (roots.isEmpty()) throw badRequest("MAINTENANCE_BATCH_SCOPE_EMPTY", "所选范围没有本批次的测试业务");
        } else if (request.operation() == Operation.RESET_PRELIVE) {
            if (request.batchId() != null) throw badRequest("MAINTENANCE_BATCH_UNEXPECTED", "上线前重置不按测试批次筛选");
            if (!actor.hasAuthority("MAINTENANCE.LIFECYCLE")) throw forbidden("MAINTENANCE_PERMISSION_REQUIRED", "上线前重置需要上线状态维护权限");
            roots = participant.resetRoots(actor, scope);
            if (roots.isEmpty()) throw badRequest("MAINTENANCE_RESET_EMPTY", "目标范围没有可重置的门诊业务");
        } else if (request.batchId() != null) {
            throw badRequest("MAINTENANCE_BATCH_UNEXPECTED", "该维护场景不使用测试清理批次");
        }
        var change = participant.preview(actor, scope, request.operation(), modules, roots, input);
        var data = new StoredMaintenancePlan(actor, scope, request.operation(), request.datasetCode(), modules,
                request.batchId(), roots, input, reason, participant.dataset().ruleVersion(), change);
        PlanView view = new PlanView(GlobalIds.next(), scope, request.operation(), request.datasetCode(), modules,
                request.batchId(), reason, digest(data), Instant.now().plus(Duration.ofMinutes(15)),
                change.impacts(), change.blockers(), change.retained(), change.lines());
        store.savePlan(view, data);
        store.audit(actor.tenantId(), view.id(), "PREVIEW", actor.actor(),
                change.blockers().isEmpty() ? "维护预览通过" : "维护预览存在阻断项");
        return view;
    }

    public PlanView plan(Long id) {
        var actor = access.current("MAINTENANCE.VIEW");
        PlanView view = store.plan(actor.tenantId(), id);
        access.requireScope(actor, view.scope());
        return view;
    }

    String digest(Object value) {
        return MaintenanceFingerprint.of(json.write(canonical(json.readObject(json.write(value)))));
    }
    private Object canonical(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new TreeMap<>();
            map.forEach((key, item) -> result.put(key.toString(), canonical(item)));
            return result;
        }
        if (value instanceof List<?> list) return list.stream().map(this::canonical).toList();
        return value;
    }
    private boolean visible(com.rhn.shared.context.ExecutionContext actor, Scope scope) {
        return actor.hasAuthority("MAINTENANCE.TENANT")
                || !scope.wholeTenant() && scope.organizationIds().stream().allMatch(actor::canAccessOrganization);
    }
    static String required(String value, String label, int max) {
        if (value == null || value.isBlank() || value.trim().length() > max)
            throw badRequest("MAINTENANCE_PARAMETER_INVALID", label + "不能为空且长度不能超过" + max);
        return value.trim();
    }
}
