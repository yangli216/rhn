package com.rhn.platform.identityaccess.application;

import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.DepartmentDefaultRoleView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.DepartmentDefaultRolesView;
import com.rhn.platform.identityaccess.application.ManagementScopes.Scope;
import com.rhn.platform.organization.api.StaffAssignmentSynchronizer;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static com.rhn.platform.identityaccess.application.RoleGrantStore.timestamp;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/**
 * Department default roles and their automatic grants. A practitioner with a login account receives the
 * department's default roles for each open assignment there, valid until the assignment ends. Ending, voiding or
 * transferring the assignment ends those grants; manual grants and grants revoked by hand are never touched again.
 */
@Service
public class DepartmentDefaultRoleService implements StaffAssignmentSynchronizer {
    private final JdbcTemplate jdbc;
    private final ExecutionContextProvider contextProvider;
    private final ManagementScopes scopes;
    private final RoleGrantStore grants;

    public DepartmentDefaultRoleService(JdbcTemplate jdbc, ExecutionContextProvider contextProvider,
                                        ManagementScopes scopes, RoleGrantStore grants) {
        this.jdbc = jdbc;
        this.contextProvider = contextProvider;
        this.scopes = scopes;
        this.grants = grants;
    }

    @Transactional(readOnly = true)
    public DepartmentDefaultRolesView defaults(Long departmentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long organizationId = organizationOf(context.tenantId(), departmentId);
        boolean manageable = scopes.resolve(context).coversDepartment(organizationId, departmentId);
        return new DepartmentDefaultRolesView(organizationId, departmentId, manageable,
                rows(context.tenantId(), departmentId), 0);
    }

    /**
     * Replaces the department's default roles. Newly added roles must be active and contain only permissions the
     * acting account holds. Removing a role keeps grants already made; applyToCurrentStaff grants the defaults to
     * practitioners already serving in the department.
     */
    @Transactional
    public DepartmentDefaultRolesView replace(Long departmentId, Set<Long> roleIds, boolean applyToCurrentStaff) {
        ExecutionContext context = contextProvider.requireCurrent();
        Scope scope = scopes.resolve(context);
        Long organizationId = scopes.requireDepartment(context.tenantId(), scope, departmentId);
        jdbc.queryForObject("select ID_DEPT from RHN_SYS_DEPT where ID_TNT = ? and ID_DEPT = ? for update",
                Long.class, context.tenantId(), departmentId);
        Set<Long> desired = roleIds == null ? Set.of() : new LinkedHashSet<>(roleIds);
        Set<Long> existing = rows(context.tenantId(), departmentId).stream()
                .map(DepartmentDefaultRoleView::roleId).collect(Collectors.toSet());
        Set<Long> added = desired.stream().filter(value -> !existing.contains(value))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (!added.isEmpty()) {
            List<Object> parameters = new ArrayList<>(List.of(context.tenantId()));
            parameters.addAll(added);
            String placeholders = String.join(",", java.util.Collections.nCopies(added.size(), "?"));
            Integer activeRoles = jdbc.queryForObject("""
                    select count(*) from RHN_SYS_ACC_ROLE where ID_TNT = ? and SD_STATUS = 'ACTIVE' and ID_ACC_ROLE in (
                    """ + placeholders + ")", Integer.class, parameters.toArray());
            if (activeRoles == null || activeRoles != added.size()) {
                throw badRequest("IAM_ROLE_INACTIVE", "默认角色包含不存在或已停用的角色");
            }
            Instant now = Instant.now();
            Set<String> permissionCodes = new LinkedHashSet<>(jdbc.query("""
                    select distinct permission.CD_ACC_PERM from RHN_SYS_ROLE_PERM_ASSIGN role_permission
                      join RHN_SYS_ACC_PERM permission
                        on permission.ID_TNT = role_permission.ID_TNT and permission.ID_ACC_PERM = role_permission.ID_ACC_PERM
                     where role_permission.ID_TNT = ? and permission.SD_STATUS = 'ACTIVE'
                       and role_permission.DT_VALID_FROM <= ?
                       and (role_permission.DT_VALID_TO is null or role_permission.DT_VALID_TO > ?)
                       and role_permission.ID_ACC_ROLE in (""" + placeholders + ")",
                    (result, index) -> result.getString(1), withTimes(parameters, now)));
            ManagementScopes.requireGrantable(context, permissionCodes,
                    "IAM_ROLE_ESCALATION_FORBIDDEN", "默认角色包含当前账号未具备的权限");
        }
        for (Long roleId : existing) {
            if (!desired.contains(roleId)) jdbc.update("""
                    delete from RHN_SYS_DEPT_DFLT_ROLE where ID_TNT = ? and ID_DEPT = ? and ID_ACC_ROLE = ?
                    """, context.tenantId(), departmentId, roleId);
        }
        for (Long roleId : added) {
            jdbc.update("""
                    insert into RHN_SYS_DEPT_DFLT_ROLE
                        (ID_DEPT_DFLT_ROLE, ID_TNT, ID_ORG, ID_DEPT, ID_ACC_ROLE, DT_CREATED, ID_USER_CREATED)
                    values (?, ?, ?, ?, ?, ?, ?)
                    """, GlobalIds.next(), context.tenantId(), organizationId, departmentId, roleId,
                    timestamp(Instant.now()), context.subjectId());
        }
        List<DepartmentDefaultRoleView> after = rows(context.tenantId(), departmentId);
        grants.event(context, "DEPT_DEFAULT_ROLES_REPLACED", "DEPARTMENT", departmentId,
                after.stream().map(DepartmentDefaultRoleView::roleCode).sorted().toList().toString());
        int granted = 0;
        if (applyToCurrentStaff) {
            List<Long> practitioners = jdbc.query("select distinct employment.ID_PRACT " + ManagementScopes.OPEN_STAFF
                            + " and staff.ID_DEPT = ?", (result, index) -> result.getLong(1),
                    context.tenantId(), Date.valueOf(ManagementScopes.today()), departmentId);
            for (Long practitionerId : practitioners) granted += apply(context, practitionerId);
        }
        return new DepartmentDefaultRolesView(organizationId, departmentId, true, after, granted);
    }

    @Override
    @Transactional
    public void synchronize(Long tenantId, Long practitionerId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.tenantId().equals(tenantId)) return;
        apply(context, practitionerId);
    }

    /** Ends default grants of closed assignments and adds missing ones for open assignments; returns grants added. */
    private int apply(ExecutionContext context, Long practitionerId) {
        Long tenantId = context.tenantId();
        List<Long> users = jdbc.query("select ID_USER from RHN_SYS_USER_ACCT where ID_TNT = ? and ID_PRACT = ?",
                (result, index) -> result.getLong(1), tenantId, practitionerId);
        if (users.isEmpty()) return 0;
        List<StaffRow> assignments = jdbc.query("""
                select staff.ID_STAFF_ASSIGN as id, staff.ID_ORG as organization_id, staff.ID_DEPT as department_id,
                       staff.DA_VALID_FROM as valid_from, staff.DA_VALID_TO as valid_to,
                       staff.SD_STATUS as status, employment.SD_STATUS as employment_status
                  from RHN_SYS_EMPL employment
                  join RHN_SYS_STAFF_ASSIGN staff
                    on staff.ID_TNT = employment.ID_TNT and staff.ID_EMPL = employment.ID_EMPL
                 where employment.ID_TNT = ? and employment.ID_PRACT = ?
                """, (result, index) -> new StaffRow(result.getLong("id"), result.getLong("organization_id"),
                result.getLong("department_id"), result.getDate("valid_from").toLocalDate(),
                result.getDate("valid_to") == null ? null : result.getDate("valid_to").toLocalDate(),
                "ACTIVE".equals(result.getString("status")) && "ACTIVE".equals(result.getString("employment_status"))),
                tenantId, practitionerId);
        if (assignments.isEmpty()) return 0;
        Instant now = Instant.now();
        LocalDate today = ManagementScopes.today();
        Map<Long, StaffRow> byId = new HashMap<>();
        assignments.forEach(value -> byId.put(value.id(), value));

        List<Object> userParameters = new ArrayList<>(List.of(tenantId, RoleGrantStore.DEPT_DEFAULT));
        userParameters.addAll(users);
        String userPlaceholders = String.join(",", java.util.Collections.nCopies(users.size(), "?"));
        List<AutoGrant> existing = jdbc.query("""
                select ID_USER_ROLE_ASSIGN as id, ID_USER as user_id, ID_ACC_ROLE as role_id,
                       ID_STAFF_ASSIGN as staff_id, DT_VALID_TO as valid_to
                  from RHN_SYS_USER_ROLE_ASSIGN
                 where ID_TNT = ? and SD_GRANT_SRC = ? and ID_STAFF_ASSIGN is not null and ID_USER in (
                """ + userPlaceholders + ")", (result, index) -> {
            Timestamp to = result.getTimestamp("valid_to");
            return new AutoGrant(result.getLong("id"), result.getLong("user_id"), result.getLong("role_id"),
                    result.getLong("staff_id"), to == null ? null : to.toInstant());
        }, userParameters.toArray());

        for (AutoGrant grant : existing) {
            StaffRow assignment = byId.get(grant.staffAssignmentId());
            if (assignment == null) continue;
            Instant end = assignment.active() ? endOf(assignment.validTo()) : now;
            if (end != null && (grant.validTo() == null || grant.validTo().isAfter(end))) {
                grants.end(context, grant.id(), end, "USER_ROLE_AUTO_ENDED");
            }
        }

        Map<Long, List<DefaultRole>> defaults = defaultRoles(tenantId, assignments.stream()
                .filter(value -> value.open(today)).map(StaffRow::departmentId).collect(Collectors.toSet()));
        int added = 0;
        for (StaffRow assignment : assignments) {
            if (!assignment.open(today)) continue;
            for (DefaultRole role : defaults.getOrDefault(assignment.departmentId(), List.of())) {
                for (Long userId : users) {
                    boolean handled = existing.stream().anyMatch(value -> value.userId().equals(userId)
                            && value.roleId().equals(role.roleId()) && value.staffAssignmentId().equals(assignment.id()));
                    if (handled) continue;
                    Instant from = max(assignment.validFrom().atStartOfDay(ManagementScopes.BUSINESS_ZONE).toInstant(), now);
                    Instant to = endOf(assignment.validTo());
                    if (to != null && !to.isAfter(from)) continue;
                    if (grants.overlaps(tenantId, userId, role.roleId(), assignment.organizationId(),
                            assignment.departmentId(), from, to)) continue;
                    grants.insert(context, userId, role.roleId(), role.roleCode(), assignment.organizationId(),
                            assignment.departmentId(), "DEPARTMENT", from, to, RoleGrantStore.DEPT_DEFAULT, assignment.id());
                    added++;
                }
            }
        }
        return added;
    }

    private Map<Long, List<DefaultRole>> defaultRoles(Long tenantId, Set<Long> departments) {
        if (departments.isEmpty()) return Map.of();
        List<Object> parameters = new ArrayList<>(List.of(tenantId));
        parameters.addAll(departments);
        String placeholders = String.join(",", java.util.Collections.nCopies(departments.size(), "?"));
        Map<Long, List<DefaultRole>> result = new HashMap<>();
        jdbc.query("""
                select dflt.ID_DEPT as department_id, role.ID_ACC_ROLE as role_id, role.CD_ACC_ROLE as role_code
                  from RHN_SYS_DEPT_DFLT_ROLE dflt
                  join RHN_SYS_ACC_ROLE role
                    on role.ID_TNT = dflt.ID_TNT and role.ID_ACC_ROLE = dflt.ID_ACC_ROLE
                 where dflt.ID_TNT = ? and role.SD_STATUS = 'ACTIVE' and dflt.ID_DEPT in (""" + placeholders + ")",
                (org.springframework.jdbc.core.RowCallbackHandler) row -> result
                        .computeIfAbsent(row.getLong("department_id"), key -> new ArrayList<>())
                        .add(new DefaultRole(row.getLong("role_id"), row.getString("role_code"))),
                parameters.toArray());
        return result;
    }

    private List<DepartmentDefaultRoleView> rows(Long tenantId, Long departmentId) {
        return jdbc.query("""
                select dflt.ID_DEPT_DFLT_ROLE as id, dflt.ID_ORG as organization_id, dflt.ID_DEPT as department_id,
                       role.ID_ACC_ROLE as role_id, role.CD_ACC_ROLE as role_code, role.NA_ACC_ROLE as role_name,
                       role.SD_STATUS as role_status, dflt.DT_CREATED as created_at
                  from RHN_SYS_DEPT_DFLT_ROLE dflt
                  join RHN_SYS_ACC_ROLE role
                    on role.ID_TNT = dflt.ID_TNT and role.ID_ACC_ROLE = dflt.ID_ACC_ROLE
                 where dflt.ID_TNT = ? and dflt.ID_DEPT = ?
                 order by role.CD_ACC_ROLE
                """, (result, index) -> new DepartmentDefaultRoleView(result.getLong("id"),
                result.getLong("organization_id"), result.getLong("department_id"), result.getLong("role_id"),
                result.getString("role_code"), result.getString("role_name"), result.getString("role_status"),
                result.getTimestamp("created_at").toInstant()), tenantId, departmentId);
    }

    private Long organizationOf(Long tenantId, Long departmentId) {
        List<Long> values = jdbc.query("select ID_ORG from RHN_SYS_DEPT where ID_TNT = ? and ID_DEPT = ?",
                (result, index) -> result.getLong(1), tenantId, departmentId);
        if (values.isEmpty()) throw com.rhn.shared.api.BusinessErrors.notFound("DEPARTMENT_NOT_FOUND", "科室不存在");
        return values.getFirst();
    }

    private static Object[] withTimes(List<Object> roleParameters, Instant now) {
        List<Object> values = new ArrayList<>();
        values.add(roleParameters.getFirst());
        values.add(timestamp(now));
        values.add(timestamp(now));
        values.addAll(roleParameters.subList(1, roleParameters.size()));
        return values.toArray();
    }

    /** Assignment end dates are inclusive, so the grant ends at the start of the following day. */
    private static Instant endOf(LocalDate lastDay) {
        return lastDay == null ? null : lastDay.plusDays(1).atStartOfDay(ManagementScopes.BUSINESS_ZONE).toInstant();
    }

    private static Instant max(Instant left, Instant right) {
        return left.isAfter(right) ? left : right;
    }

    private record StaffRow(Long id, Long organizationId, Long departmentId, LocalDate validFrom, LocalDate validTo,
                            boolean active) {
        boolean open(LocalDate today) {
            return active && (validTo == null || !validTo.isBefore(today));
        }
    }

    private record AutoGrant(Long id, Long userId, Long roleId, Long staffAssignmentId, Instant validTo) {
    }

    private record DefaultRole(Long roleId, String roleCode) {
    }
}
