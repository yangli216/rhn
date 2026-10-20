package com.rhn.platform.identityaccess.application;

import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.ManagementScopeView;
import com.rhn.platform.identityaccess.api.IdentityAccessPermissions;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

/**
 * Derives what the acting account may administer from its own {@code IAM.MANAGE} grants: a tenant-wide grant (or
 * ROLE_ADMIN) manages the tenant, an organization grant manages that organization, and department grants manage
 * only the department of the current work context.
 */
@Component
class ManagementScopes {
    static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    record Scope(String type, Long organizationId, Long departmentId) {
        static final Scope TENANT = new Scope("TENANT", null, null);

        boolean covers(String scopeType, Long organization, Long department) {
            return switch (type) {
                case "TENANT" -> true;
                case "ORGANIZATION" -> organizationId.equals(organization);
                default -> "DEPARTMENT".equals(scopeType) && organizationId.equals(organization)
                        && departmentId.equals(department);
            };
        }

        boolean coversDepartment(Long organization, Long department) {
            return covers("DEPARTMENT", organization, department);
        }

        /** Restricts user-role grants (alias {@code grant_row}) to this scope. */
        String grantFilter(List<Object> parameters) {
            return switch (type) {
                case "TENANT" -> "";
                case "ORGANIZATION" -> {
                    parameters.add(organizationId);
                    yield " and grant_row.ID_ORG = ?";
                }
                default -> {
                    parameters.add(organizationId);
                    parameters.add(departmentId);
                    yield " and grant_row.ID_ORG = ? and grant_row.ID_DEPT = ? and grant_row.SD_DATA_SCOPE_TYPE = 'DEPARTMENT'";
                }
            };
        }

        /** Restricts staff assignments (alias {@code staff}) to this scope. */
        String staffFilter(List<Object> parameters) {
            return switch (type) {
                case "TENANT" -> "";
                case "ORGANIZATION" -> {
                    parameters.add(organizationId);
                    yield " and staff.ID_ORG = ?";
                }
                default -> {
                    parameters.add(organizationId);
                    parameters.add(departmentId);
                    yield " and staff.ID_ORG = ? and staff.ID_DEPT = ?";
                }
            };
        }
    }

    /** Staff assignments that are not voided and have not ended, joined to their employment. */
    static final String OPEN_STAFF = """
              from RHN_SYS_EMPL employment
              join RHN_SYS_STAFF_ASSIGN staff
                on staff.ID_TNT = employment.ID_TNT and staff.ID_EMPL = employment.ID_EMPL
             where employment.ID_TNT = ? and employment.SD_STATUS = 'ACTIVE' and staff.SD_STATUS = 'ACTIVE'
               and (staff.DA_VALID_TO is null or staff.DA_VALID_TO >= ?)
            """;

    private final JdbcTemplate jdbc;

    ManagementScopes(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    static LocalDate today() {
        return LocalDate.now(BUSINESS_ZONE);
    }

    Scope resolve(ExecutionContext context) {
        if (!context.hasWorkContext() || context.hasAuthority("ROLE_ADMIN")) return Scope.TENANT;
        Instant now = Instant.now();
        List<Long[]> grants = jdbc.query("""
                select distinct grant_row.ID_ORG as organization_id, grant_row.ID_DEPT as department_id
                  from RHN_SYS_USER_ROLE_ASSIGN grant_row
                  join RHN_SYS_ACC_ROLE role
                    on role.ID_TNT = grant_row.ID_TNT and role.ID_ACC_ROLE = grant_row.ID_ACC_ROLE
                  join RHN_SYS_ROLE_PERM_ASSIGN role_permission
                    on role_permission.ID_TNT = grant_row.ID_TNT and role_permission.ID_ACC_ROLE = grant_row.ID_ACC_ROLE
                  join RHN_SYS_ACC_PERM permission
                    on permission.ID_TNT = role_permission.ID_TNT and permission.ID_ACC_PERM = role_permission.ID_ACC_PERM
                 where grant_row.ID_TNT = ? and grant_row.ID_USER = ? and permission.CD_ACC_PERM = ?
                   and role.SD_STATUS = 'ACTIVE' and permission.SD_STATUS = 'ACTIVE'
                   and grant_row.DT_VALID_FROM <= ? and (grant_row.DT_VALID_TO is null or grant_row.DT_VALID_TO > ?)
                   and role_permission.DT_VALID_FROM <= ?
                   and (role_permission.DT_VALID_TO is null or role_permission.DT_VALID_TO > ?)
                """, (result, index) -> new Long[]{result.getObject("organization_id", Long.class),
                        result.getObject("department_id", Long.class)},
                context.tenantId(), context.subjectId(), IdentityAccessPermissions.MANAGE,
                RoleGrantStore.timestamp(now), RoleGrantStore.timestamp(now),
                RoleGrantStore.timestamp(now), RoleGrantStore.timestamp(now));
        if (grants.stream().anyMatch(value -> value[0] == null)) return Scope.TENANT;
        if (grants.stream().anyMatch(value -> context.organizationId().equals(value[0]) && value[1] == null)) {
            return new Scope("ORGANIZATION", context.organizationId(), null);
        }
        return new Scope("DEPARTMENT", context.organizationId(), context.departmentId());
    }

    ManagementScopeView view(Long tenantId, Scope scope) {
        String organizationName = scope.organizationId() == null ? null : jdbc.query("""
                select NA_ORG from RHN_SYS_ORG where ID_TNT = ? and ID_ORG = ?
                """, (result, index) -> result.getString(1), tenantId, scope.organizationId()).stream().findFirst().orElse(null);
        String departmentName = scope.departmentId() == null ? null : jdbc.query("""
                select NA_DEPT from RHN_SYS_DEPT where ID_TNT = ? and ID_DEPT = ?
                """, (result, index) -> result.getString(1), tenantId, scope.departmentId()).stream().findFirst().orElse(null);
        return new ManagementScopeView(scope.type(), scope.organizationId(), organizationName,
                scope.departmentId(), departmentName);
    }

    /** The practitioner exists and, outside tenant scope, holds an open assignment within the scope. */
    void requirePractitioner(Long tenantId, Scope scope, Long practitionerId) {
        Integer exists = jdbc.queryForObject("""
                select count(*) from RHN_SYS_PRACT where ID_TNT = ? and ID_PRACT = ?
                """, Integer.class, tenantId, practitionerId);
        if (exists == null || exists == 0) throw notFound("PRACTITIONER_NOT_FOUND", "人员不存在");
        if (!inScope(tenantId, scope, practitionerId)) {
            throw forbidden("IAM_USER_SCOPE_FORBIDDEN", "当前管理范围内没有该人员的任职，不能管理其账号与授权");
        }
    }

    /** Returns the account's practitioner (may be null) after checking the account is manageable. */
    Long requireUser(Long tenantId, Scope scope, Long userId) {
        List<Long> practitioners = jdbc.query("""
                select ID_PRACT from RHN_SYS_USER_ACCT where ID_TNT = ? and ID_USER = ?
                """, (result, index) -> result.getObject(1, Long.class), tenantId, userId);
        if (practitioners.isEmpty()) throw notFound("IAM_USER_NOT_FOUND", "未找到用户账号");
        Long practitionerId = practitioners.getFirst();
        if (!"TENANT".equals(scope.type()) && (practitionerId == null || !inScope(tenantId, scope, practitionerId))) {
            throw forbidden("IAM_USER_SCOPE_FORBIDDEN", "当前工作上下文不能管理该用户账号");
        }
        return practitionerId;
    }

    /** Organization id of a department inside the scope. */
    Long requireDepartment(Long tenantId, Scope scope, Long departmentId) {
        List<Long> organizations = jdbc.query("""
                select ID_ORG from RHN_SYS_DEPT where ID_TNT = ? and ID_DEPT = ?
                """, (result, index) -> result.getLong(1), tenantId, departmentId);
        if (organizations.isEmpty()) throw notFound("DEPARTMENT_NOT_FOUND", "科室不存在");
        if (!scope.coversDepartment(organizations.getFirst(), departmentId)) {
            throw forbidden("IAM_SCOPE_ESCALATION_FORBIDDEN", "当前管理范围不包含该科室");
        }
        return organizations.getFirst();
    }

    /** Non-admins may only hand out permissions they hold themselves in the current context. */
    static void requireGrantable(ExecutionContext context, Set<String> permissionCodes, String code, String message) {
        if (!context.hasAuthority("ROLE_ADMIN") && !context.authorities().containsAll(permissionCodes)) {
            throw forbidden(code, message);
        }
    }

    private boolean inScope(Long tenantId, Scope scope, Long practitionerId) {
        if ("TENANT".equals(scope.type())) return true;
        List<Object> parameters = new java.util.ArrayList<>(List.of(tenantId, java.sql.Date.valueOf(today()), practitionerId));
        String filter = scope.staffFilter(parameters);
        Integer count = jdbc.queryForObject("select count(*) " + OPEN_STAFF + " and employment.ID_PRACT = ?" + filter,
                Integer.class, parameters.toArray());
        return count != null && count > 0;
    }
}
