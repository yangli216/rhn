package com.rhn.platform.security;

import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.identityaccess.api.WorkContextOption;
import com.rhn.platform.web.RequestCorrelationContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
class SpringSecurityExecutionContextProvider implements ExecutionContextProvider {
    private final IdentityAccessDirectory identityAccessDirectory;
    private final WorkContextDirectory workContextDirectory;

    SpringSecurityExecutionContextProvider(IdentityAccessDirectory identityAccessDirectory,
                                           WorkContextDirectory workContextDirectory) {
        this.identityAccessDirectory = identityAccessDirectory;
        this.workContextDirectory = workContextDirectory;
    }

    @Override
    public ExecutionContext requireCurrent() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String actor = authentication == null ? "system" : authentication.getName();
        Long userId = null;
        Long practitionerId = null;
        if (authentication != null && authentication.getPrincipal() instanceof RhnUserDetails value) {
            userId = value.userId();
            practitionerId = value.practitionerId();
        } else if (authentication != null && authentication.getPrincipal() instanceof RhnPrincipal value) {
            userId = value.userId();
        }
        Long tenantId = TenantContext.requireTenantId();
        if (authentication != null && authentication.isAuthenticated() && (userId == null || practitionerId == null)) {
            var account = identityAccessDirectory.findActiveAccount(tenantId, actor).orElse(null);
            if (account != null) {
                if (userId == null) userId = account.id();
                practitionerId = account.practitionerId();
            }
        }
        Set<String> authorities = authentication == null ? Set.of() : authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
        WorkContextRequest.Selection selection = WorkContextRequest.current();
        WorkContextOption workContext = selection == null || userId == null ? null
                : workContextDirectory.requireAuthorized(tenantId, userId,
                selection.organizationId(), selection.departmentId());
        return new ExecutionContext(tenantId, userId, actor, RequestCorrelationContext.currentOrCreate(), authorities,
                workContext == null ? null : workContext.organizationId(),
                workContext == null ? null : workContext.departmentId(),
                workContext == null ? null : workContext.dataScopeType(),
                workContext == null || workContext.organizationId() == null ? Set.of() : Set.of(workContext.organizationId()),
                workContext == null || workContext.departmentId() == null ? Set.of() : Set.of(workContext.departmentId()),
                practitionerId);
    }
}
