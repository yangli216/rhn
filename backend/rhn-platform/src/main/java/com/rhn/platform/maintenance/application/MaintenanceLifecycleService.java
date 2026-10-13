package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.infrastructure.MaintenanceBarrierStore;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import com.rhn.platform.organization.api.OrganizationDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MaintenanceLifecycleService {
    private final MaintenanceAccess access;
    private final MaintenanceBarrierStore barrier;
    private final MaintenanceStore store;
    private final OrganizationDirectory organizations;
    private final JdbcTemplate jdbc;
    public MaintenanceLifecycleService(MaintenanceAccess access, MaintenanceBarrierStore barrier, MaintenanceStore store,
                                       OrganizationDirectory organizations, JdbcTemplate jdbc) {
        this.access=access; this.barrier=barrier; this.store=store; this.organizations=organizations; this.jdbc=jdbc;
    }
    @Transactional
    public List<OrganizationLifecycle> transition(LifecycleRequest request) {
        var actor = access.current("MAINTENANCE.LIFECYCLE");
        Scope scope = access.expand(actor, request.scope());
        String reason = MaintenancePlanningService.required(request.reason(), "上线状态变更原因", 1000);
        if (request.lifecycle() == null || request.lifecycle() == Lifecycle.UNKNOWN)
            throw badRequest("MAINTENANCE_LIFECYCLE_INVALID", "请选择上线前或正式上线状态");
        String expected = scope.wholeTenant() ? organizations.requireTenant(actor.tenantId()).name()
                : scope.organizationIds().stream().map(id -> organizations.requireOrganization(actor.tenantId(), id).name())
                        .collect(java.util.stream.Collectors.joining("、"));
        if (!expected.equals(request.confirmation())) throw badRequest("MAINTENANCE_CONFIRMATION_INVALID", "请输入完整目标名称确认");
        if (request.lifecycle() == Lifecycle.PRELIVE && !Boolean.TRUE.equals(request.noRealEffectsConfirmed()))
            throw badRequest("MAINTENANCE_PRELIVE_ATTESTATION_REQUIRED", "需确认范围尚未上线且没有真实诊疗、资金或药品交付");
        if (barrier.lock(actor.tenantId()) != null) throw conflict("MAINTENANCE_WRITE_PAUSED", "当前租户维护尚未完成，不能变更上线状态");
        for (Long org : scope.organizationIds()) {
            Lifecycle before = state(actor.tenantId(), org);
            if (before == Lifecycle.LIVE && request.lifecycle() != Lifecycle.LIVE)
                throw conflict("MAINTENANCE_LIFECYCLE_IRREVERSIBLE", "机构已经正式上线，不能回退到上线前");
            if (before == request.lifecycle()) continue;
            var now = Instant.now().atOffset(ZoneOffset.UTC);
            int updated = jdbc.update("update RHN_SYS_MAINT_ORG_STATE set SD_LFCYCL=?,DT_UPDATED=?,NA_ACTOR=? where ID_TNT=? and ID_ORG=?",
                    request.lifecycle().name(), now, actor.actor(), actor.tenantId(), org);
            if (updated == 0) jdbc.update("insert into RHN_SYS_MAINT_ORG_STATE (ID_TNT,ID_ORG,SD_LFCYCL,DT_UPDATED,NA_ACTOR) values (?,?,?,?,?)",
                    actor.tenantId(), org, request.lifecycle().name(), now, actor.actor());
            store.audit(actor.tenantId(), org, "LIFECYCLE", actor.actor(), before + " → " + request.lifecycle() + "；" + reason);
        }
        return scope.organizationIds().stream().map(org -> new OrganizationLifecycle(org, request.lifecycle())).toList();
    }
    public void requirePrelive(Scope scope) {
        for (Long organization : scope.organizationIds()) {
            if (state(scope.tenantId(), organization) != Lifecycle.PRELIVE)
                throw conflict("MAINTENANCE_PRELIVE_REQUIRED", "所有目标机构必须已明确确认为上线前状态；已上线或未确认机构不能重置");
        }
    }
    private Lifecycle state(Long tenant, Long organization) {
        var values = jdbc.query("select SD_LFCYCL from RHN_SYS_MAINT_ORG_STATE where ID_TNT=? and ID_ORG=?",
                (rs,row) -> Lifecycle.valueOf(rs.getString(1)), tenant, organization);
        return values.isEmpty() ? Lifecycle.UNKNOWN : values.getFirst();
    }
}
