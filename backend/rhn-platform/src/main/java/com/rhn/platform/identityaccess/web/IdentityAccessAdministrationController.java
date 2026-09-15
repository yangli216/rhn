package com.rhn.platform.identityaccess.web;

import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.PermissionView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.RoleView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.UserRoleAssignmentView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.UserView;
import com.rhn.platform.identityaccess.application.IdentityAccessAdministrationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/platform/iam")
@PreAuthorize("hasAuthority(T(com.rhn.platform.identityaccess.api.IdentityAccessPermissions).MANAGE)")
public class IdentityAccessAdministrationController {
    private final IdentityAccessAdministrationService service;

    public IdentityAccessAdministrationController(IdentityAccessAdministrationService service) {
        this.service = service;
    }

    @GetMapping("/roles")
    List<RoleView> roles() { return service.roles(); }

    @GetMapping("/permissions")
    List<PermissionView> permissions() { return service.permissions(); }

    @GetMapping("/users")
    List<UserView> users() { return service.users(); }

    @GetMapping("/users/{userId}/role-assignments")
    List<UserRoleAssignmentView> assignments(@PathVariable Long userId) { return service.assignments(userId); }

    @PostMapping("/roles")
    @ResponseStatus(HttpStatus.CREATED)
    RoleView createRole(@Valid @RequestBody CreateRoleRequest request) {
        return service.createRole(request.code(), request.name(), request.roleType());
    }

    @PutMapping("/roles/{roleId}")
    RoleView updateRole(@PathVariable Long roleId, @Valid @RequestBody UpdateRoleRequest request) {
        return service.updateRole(roleId, request.expectedVersion(), request.name(), request.status());
    }

    @PutMapping("/roles/{roleId}/permissions")
    RoleView replacePermissions(@PathVariable Long roleId,
                                @Valid @RequestBody ReplaceRolePermissionsRequest request) {
        return service.replaceRolePermissions(roleId, request.expectedVersion(), request.permissionIds());
    }

    @PostMapping("/users/{userId}/role-assignments")
    @ResponseStatus(HttpStatus.CREATED)
    UserRoleAssignmentView assignRole(@PathVariable Long userId,
                                      @Valid @RequestBody AssignRoleRequest request) {
        return service.assignRole(userId, request.roleId(), request.organizationId(), request.departmentId(),
                request.dataScopeType(), request.validFrom(), request.validTo());
    }

    @DeleteMapping("/user-role-assignments/{assignmentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@PathVariable Long assignmentId) { service.revokeAssignment(assignmentId); }

    public record CreateRoleRequest(@NotBlank @Size(max = 64) String code,
                                    @NotBlank @Size(max = 128) String name,
                                    @NotBlank String roleType) {
    }

    public record UpdateRoleRequest(@PositiveOrZero long expectedVersion,
                                    @NotBlank @Size(max = 128) String name,
                                    @NotBlank String status) {
    }

    public record ReplaceRolePermissionsRequest(@PositiveOrZero long expectedVersion,
                                                @NotNull Set<@NotNull Long> permissionIds) {
    }

    public record AssignRoleRequest(@NotNull Long roleId, Long organizationId, Long departmentId,
                                    @NotBlank String dataScopeType, Instant validFrom, Instant validTo) {
    }
}
