package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceWorkspace;
import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.api.MaintenanceRootDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class MaintenanceWorkspaceService {
    private final MaintenanceAccess access;
    private final OrganizationDirectory organizations;
    private final MaintenanceEnvironmentPolicy environment;
    private final Optional<MaintenanceRootDirectory> roots;
    private final JdbcTemplate jdbc;
    public MaintenanceWorkspaceService(MaintenanceAccess access, OrganizationDirectory organizations,
                                       MaintenanceEnvironmentPolicy environment, Optional<MaintenanceRootDirectory> roots,
                                       JdbcTemplate jdbc) {
        this.access = access; this.organizations = organizations; this.environment = environment; this.roots = roots; this.jdbc = jdbc;
    }
    public MaintenanceWorkspace workspace() {
        var actor = access.current("MAINTENANCE.VIEW");
        var options = organizations.listOrganizationUnits(actor.tenantId()).stream()
                .filter(org -> actor.hasAuthority("MAINTENANCE.TENANT") || actor.canAccessOrganization(org.id()))
                .map(org -> new MaintenanceWorkspace.OrganizationOption(org.id(), org.name(), lifecycle(actor.tenantId(), org.id()))).toList();
        return new MaintenanceWorkspace(actor.tenantId(), organizations.requireTenant(actor.tenantId()).name(),
                environment.environmentName(), environment.physicalCleanupEnabled(), options);
    }
    public List<MaintenanceRootDirectory.RootCandidate> candidates(ScopeRequest request, String query) {
        var actor = access.current("MAINTENANCE.MANAGE");
        if (query != null && query.length() > 128) throw badRequest("MAINTENANCE_QUERY_INVALID", "就诊查询条件不能超过128字");
        return roots.orElseThrow(() -> badRequest("MAINTENANCE_ROOT_DIRECTORY_UNAVAILABLE", "就诊来源核对能力尚未接入"))
                .candidates(actor, access.expand(actor, request), query);
    }
    private String lifecycle(Long tenant, Long organization) {
        var states = jdbc.query("select SD_LFCYCL from RHN_SYS_MAINT_ORG_STATE where ID_TNT=? and ID_ORG=?",
                (rs, row) -> rs.getString(1), tenant, organization);
        return states.isEmpty() ? "UNKNOWN" : states.getFirst();
    }
}
