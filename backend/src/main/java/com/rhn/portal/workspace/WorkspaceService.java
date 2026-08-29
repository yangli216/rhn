package com.rhn.portal.workspace;

import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
class WorkspaceService {
    private final PortalUserWorkspaceRepository repository;
    private final ExecutionContextProvider contextProvider;
    private final WorkContextDirectory workContextDirectory;
    private final JsonCodec jsonCodec;

    WorkspaceService(PortalUserWorkspaceRepository repository, ExecutionContextProvider contextProvider,
                     WorkContextDirectory workContextDirectory, JsonCodec jsonCodec) {
        this.repository = repository;
        this.contextProvider = contextProvider;
        this.workContextDirectory = workContextDirectory;
        this.jsonCodec = jsonCodec;
    }

    @Transactional
    WorkspaceResponse current() {
        ExecutionContext context = requireUser();
        return WorkspaceResponse.from(repository.findByTenantIdAndUserId(context.tenantId(), context.subjectId())
                .orElseGet(() -> repository.save(new PortalUserWorkspace(context.tenantId(), context.subjectId()))));
    }

    @Transactional
    WorkspaceResponse update(UpdateWorkspaceRequest request) {
        ExecutionContext context = requireUser();
        if (request.defaultOrganizationId() != null) {
            workContextDirectory.requireAuthorized(context.tenantId(), context.subjectId(),
                    request.defaultOrganizationId(), request.defaultDepartmentId());
        }
        jsonCodec.readTree(request.favoritesJson());
        jsonCodec.readTree(request.tabsJson());
        jsonCodec.readTree(request.layoutJson());
        PortalUserWorkspace workspace = repository.findByTenantIdAndUserId(context.tenantId(), context.subjectId())
                .orElseGet(() -> new PortalUserWorkspace(context.tenantId(), context.subjectId()));
        workspace.update(request.defaultOrganizationId(), request.defaultDepartmentId(), request.favoritesJson(),
                request.tabsJson(), request.layoutJson());
        return WorkspaceResponse.from(repository.save(workspace));
    }

    private ExecutionContext requireUser() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null) throw forbidden("USER_CONTEXT_REQUIRED", "当前账号没有稳定用户标识");
        return context;
    }
}
