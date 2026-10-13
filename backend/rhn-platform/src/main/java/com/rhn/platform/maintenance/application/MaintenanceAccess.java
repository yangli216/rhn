package com.rhn.platform.maintenance.application;

import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.maintenance.api.MaintenanceModels.Scope;
import com.rhn.platform.maintenance.api.MaintenanceModels.ScopeRequest;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import static com.rhn.shared.api.BusinessErrors.*;

@Component
public class MaintenanceAccess {
    private final ExecutionContextProvider contexts;
    private final OrganizationDirectory directory;
    private final IdentityAccessDirectory accounts;
    private final WorkContextDirectory workContexts;

    public MaintenanceAccess(ExecutionContextProvider contexts, OrganizationDirectory directory,
                             IdentityAccessDirectory accounts,
                             WorkContextDirectory workContexts) {
        this.contexts = contexts; this.directory = directory;
        this.accounts = accounts; this.workContexts = workContexts;
    }

    public ExecutionContext current(String permission) {
        ExecutionContext context = contexts.requireCurrent();
        if (context.subjectId() == null || !context.hasAuthority(permission))
            throw forbidden("MAINTENANCE_PERMISSION_REQUIRED", "缺少业务维护权限");
        return context;
    }

    public Scope expand(ExecutionContext actor, ScopeRequest request) {
        if (request == null) throw badRequest("MAINTENANCE_SCOPE_REQUIRED", "请选择维护范围");
        List<Long> requested = request.organizationIds() == null ? List.of() : request.organizationIds();
        if (requested.stream().anyMatch(id -> id == null || id <= 0))
            throw badRequest("MAINTENANCE_ORGANIZATION_INVALID", "机构标识格式不正确");
        if (request.wholeTenant() && !requested.isEmpty())
            throw badRequest("MAINTENANCE_SCOPE_AMBIGUOUS", "租户范围不能同时指定机构");
        if (request.wholeTenant() && !actor.hasAuthority("MAINTENANCE.TENANT"))
            throw forbidden("MAINTENANCE_TENANT_PERMISSION_REQUIRED", "租户整体维护需要独立权限");
        var all = directory.listOrganizationUnits(actor.tenantId());
        Set<Long> selected = new TreeSet<>(requested);
        if (request.wholeTenant()) all.forEach(value -> selected.add(value.id()));
        if (selected.isEmpty()) throw badRequest("MAINTENANCE_ORGANIZATION_REQUIRED", "请选择至少一个机构");
        for (Long id : selected) directory.requireOrganization(actor.tenantId(), id);
        if (request.includeDescendants()) {
            var ancestors = Set.copyOf(selected);
            for (var organization : all) {
                if (directory.organizationLineage(actor.tenantId(), organization.id()).stream()
                        .anyMatch(value -> ancestors.contains(value.id()))) selected.add(organization.id());
            }
        }
        Scope scope = new Scope(actor.tenantId(), request.wholeTenant(), List.copyOf(selected));
        requireScope(actor, scope);
        return scope;
    }

    public void requireScope(ExecutionContext actor, Scope scope) {
        if (!actor.tenantId().equals(scope.tenantId()))
            throw notFound("MAINTENANCE_RESOURCE_NOT_FOUND", "未找到维护资源");
        boolean tenantAccess = actor.hasAuthority("MAINTENANCE.TENANT");
        if (scope.wholeTenant() && !tenantAccess)
            throw forbidden("MAINTENANCE_TENANT_PERMISSION_REQUIRED", "租户整体维护需要独立权限");
        for (Long id : scope.organizationIds()) {
            directory.requireOrganization(actor.tenantId(), id);
            if (!tenantAccess && !actor.canAccessOrganization(id))
                throw forbidden("MAINTENANCE_ORGANIZATION_FORBIDDEN", "当前账号不能维护所选机构");
        }
    }

    /** Re-evaluate the original account and grants on every asynchronous execution/recovery. */
    public ExecutionContext reauthorize(ExecutionContext original, Scope scope) {
        var account = accounts.findActiveAccount(original.tenantId(), original.actor())
                .filter(value -> value.id().equals(original.subjectId()))
                .orElseThrow(() -> forbidden("MAINTENANCE_ACTOR_INACTIVE", "任务发起账号已停用"));
        Set<String> authorities = original.organizationId() == null ? account.authorities()
                : workContexts.authoritiesFor(original.tenantId(), account.id(),
                        original.organizationId(), original.departmentId());
        ExecutionContext current = new ExecutionContext(original.tenantId(), account.id(), account.username(),
                original.correlationId(), authorities, original.organizationId(), original.departmentId(),
                original.dataScopeType(), original.organizationId() == null ? Set.of() : Set.of(original.organizationId()),
                original.departmentId() == null ? Set.of() : Set.of(original.departmentId()), account.practitionerId());
        if (!current.hasAuthority("MAINTENANCE.EXECUTE"))
            throw forbidden("MAINTENANCE_PERMISSION_REVOKED", "任务执行权限已撤销");
        requireScope(current, scope);
        return current;
    }
}
