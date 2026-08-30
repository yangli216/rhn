package com.rhn.platform.identityaccess.application;

import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.PermissionView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.RoleView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.UserRoleAssignmentView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.UserView;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class IdentityAccessAdministrationService {
    private static final Pattern ROLE_CODE = Pattern.compile("[A-Z][A-Z0-9_]{1,63}");
    private static final Set<String> ROLE_TYPES = Set.of("SYSTEM", "BUSINESS", "CUSTOM");
    private static final Set<String> ROLE_STATUSES = Set.of("ACTIVE", "INACTIVE");
    private static final Set<String> DATA_SCOPES = Set.of("TENANT", "ORGANIZATION", "DEPARTMENT");

    private final JdbcTemplate jdbc;
    private final ExecutionContextProvider contextProvider;

    public IdentityAccessAdministrationService(JdbcTemplate jdbc, ExecutionContextProvider contextProvider) {
        this.jdbc = jdbc;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<RoleView> roles() {
        Long tenantId = current().tenantId();
        List<BaseRole> rows = jdbc.query("""
                select id, code, name, role_type, status, version
                  from access_roles
                 where tenant_id = ?
                 order by status, role_type, code
                """, (result, index) -> new BaseRole(result.getLong("id"), result.getString("code"),
                result.getString("name"), result.getString("role_type"), result.getString("status"),
                result.getLong("version")), tenantId);
        return rows.stream().map(value -> role(value, tenantId)).toList();
    }

    @Transactional(readOnly = true)
    public List<PermissionView> permissions() {
        Long tenantId = current().tenantId();
        return jdbc.query("""
                select permission.id, permission.code, permission.name, permission.resource_code,
                       permission.action_code, permission.status, module.id as module_id,
                       module.code as module_code, module.name as module_name, module.route_path
                  from access_permissions permission
                  left join management_modules module
                    on module.tenant_id = permission.tenant_id and module.id = permission.management_module_id
                 where permission.tenant_id = ?
                 order by module.sort_order, permission.resource_code, permission.action_code
                """, (result, index) -> new PermissionView(result.getLong("id"), result.getString("code"),
                result.getString("name"), result.getString("resource_code"), result.getString("action_code"),
                result.getString("status"), result.getObject("module_id", Long.class),
                result.getString("module_code"), result.getString("module_name"), result.getString("route_path")),
                tenantId);
    }

    @Transactional(readOnly = true)
    public List<UserView> users() {
        ExecutionContext context = current();
        if (!context.hasWorkContext()) {
            return jdbc.query("""
                    select id, username, status from user_accounts where tenant_id = ? order by username
                    """, (result, index) -> new UserView(result.getLong("id"), result.getString("username"),
                    result.getString("status")), context.tenantId());
        }
        return jdbc.query("""
                select distinct account.id, account.username, account.status
                  from user_accounts account
                  join employments employment
                    on employment.tenant_id = account.tenant_id
                   and employment.practitioner_id = account.practitioner_id
                  join staff_assignments assignment
                    on assignment.tenant_id = employment.tenant_id
                   and assignment.employment_id = employment.id
                 where account.tenant_id = ?
                   and assignment.organization_id = ? and assignment.department_id = ?
                   and employment.status = 'ACTIVE' and assignment.status = 'ACTIVE'
                   and employment.hire_date <= current_date
                   and (employment.leave_date is null or employment.leave_date >= current_date)
                   and assignment.valid_from <= current_date
                   and (assignment.valid_to is null or assignment.valid_to >= current_date)
                 order by account.username
                """, (result, index) -> new UserView(result.getLong("id"), result.getString("username"),
                result.getString("status")), context.tenantId(), context.organizationId(), context.departmentId());
    }

    @Transactional(readOnly = true)
    public List<UserRoleAssignmentView> assignments(Long userId) {
        ExecutionContext context = current();
        Long tenantId = context.tenantId();
        requireManageableUser(context, userId);
        Instant now = Instant.now();
        String scopeFilter = context.hasWorkContext()
                ? " and assignment.organization_id = ? and assignment.department_id = ? and assignment.data_scope_type = 'DEPARTMENT'"
                : "";
        List<Object> parameters = new ArrayList<>(List.of(tenantId, userId));
        if (context.hasWorkContext()) {
            parameters.add(context.organizationId());
            parameters.add(context.departmentId());
        }
        return jdbc.query("""
                select assignment.id, assignment.user_id, account.username, assignment.role_id,
                       role.code as role_code, role.name as role_name,
                       assignment.organization_id, organization.name as organization_name,
                       assignment.department_id, department.name as department_name,
                       assignment.data_scope_type, assignment.valid_from, assignment.valid_to,
                       assignment.granted_by, assignment.created_at
                  from user_role_assignments assignment
                  join user_accounts account
                    on account.tenant_id = assignment.tenant_id and account.id = assignment.user_id
                  join access_roles role
                    on role.tenant_id = assignment.tenant_id and role.id = assignment.role_id
                  left join organizations organization
                    on organization.tenant_id = assignment.tenant_id and organization.id = assignment.organization_id
                  left join departments department
                    on department.tenant_id = assignment.tenant_id and department.id = assignment.department_id
                 where assignment.tenant_id = ? and assignment.user_id = ?
                """ + scopeFilter + """
                 order by assignment.valid_from desc, assignment.id desc
                """, (result, index) -> {
            Instant from = result.getTimestamp("valid_from").toInstant();
            var toValue = result.getTimestamp("valid_to");
            Instant to = toValue == null ? null : toValue.toInstant();
            return new UserRoleAssignmentView(result.getLong("id"), result.getLong("user_id"),
                    result.getString("username"), result.getLong("role_id"), result.getString("role_code"),
                    result.getString("role_name"), result.getObject("organization_id", Long.class),
                    result.getString("organization_name"), result.getObject("department_id", Long.class),
                    result.getString("department_name"), result.getString("data_scope_type"), from, to,
                    result.getObject("granted_by", Long.class), result.getTimestamp("created_at").toInstant(),
                    !from.isAfter(now) && (to == null || to.isAfter(now)));
        }, parameters.toArray());
    }

    @Transactional
    public RoleView createRole(String code, String name, String roleType) {
        ExecutionContext context = current();
        String normalizedCode = roleCode(code);
        String normalizedName = required(name, "角色名称");
        String normalizedType = enumValue(roleType, ROLE_TYPES, "角色类型");
        Integer exists = jdbc.queryForObject("""
                select count(*) from access_roles where tenant_id = ? and code = ?
                """, Integer.class, context.tenantId(), normalizedCode);
        if (exists != null && exists > 0) throw conflict("IAM_ROLE_CODE_DUPLICATE", "角色编码已经存在");
        Long id = GlobalIds.next();
        Instant now = Instant.now();
        jdbc.update("""
                insert into access_roles
                    (id, tenant_id, code, name, role_type, status, created_at, updated_at, version)
                values (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 0)
                """, id, context.tenantId(), normalizedCode, normalizedName, normalizedType,
                sqlTimestamp(now), sqlTimestamp(now));
        event(context, "ROLE_CREATED", "ROLE", id, normalizedCode);
        return role(id, normalizedCode, normalizedName, normalizedType, "ACTIVE", 0, context.tenantId());
    }

    @Transactional
    public RoleView updateRole(Long roleId, long expectedVersion, String name, String status) {
        ExecutionContext context = current();
        requireRole(context.tenantId(), roleId);
        String normalizedName = required(name, "角色名称");
        String normalizedStatus = enumValue(status, ROLE_STATUSES, "角色状态");
        int changed = jdbc.update("""
                update access_roles set name = ?, status = ?, updated_at = ?, version = version + 1
                 where tenant_id = ? and id = ? and version = ?
                """, normalizedName, normalizedStatus, sqlTimestamp(Instant.now()),
                context.tenantId(), roleId, expectedVersion);
        if (changed == 0) throw conflict("IAM_ROLE_VERSION_CONFLICT", "角色已被其他用户修改，请刷新后重试");
        event(context, "ROLE_UPDATED", "ROLE", roleId, normalizedStatus);
        return requireRole(context.tenantId(), roleId);
    }

    @Transactional
    public RoleView replaceRolePermissions(Long roleId, long expectedVersion, Set<Long> permissionIds) {
        ExecutionContext context = current();
        requireRole(context.tenantId(), roleId);
        Set<Long> desired = permissionIds == null ? Set.of() : Set.copyOf(permissionIds);
        var permissionCodes = permissionCodes(context.tenantId(), desired);
        if (permissionCodes.size() != desired.size()) throw badRequest("IAM_PERMISSION_INVALID", "包含不存在或已停用的权限");
        if (!context.hasAuthority("ROLE_ADMIN") && !context.authorities().containsAll(permissionCodes.values())) {
            throw forbidden("IAM_PERMISSION_ESCALATION_FORBIDDEN", "不能授予当前账号自身不具备的权限");
        }
        int versionChanged = jdbc.update("""
                update access_roles set updated_at = ?, version = version + 1
                 where tenant_id = ? and id = ? and version = ?
                """, sqlTimestamp(Instant.now()), context.tenantId(), roleId, expectedVersion);
        if (versionChanged == 0) throw conflict("IAM_ROLE_VERSION_CONFLICT", "角色已被其他用户修改，请刷新后重试");

        Instant now = Instant.now();
        Set<Long> active = new LinkedHashSet<>(jdbc.query("""
                select permission_id from role_permission_assignments
                 where tenant_id = ? and role_id = ? and valid_from <= ?
                   and (valid_to is null or valid_to > ?)
                """, (result, index) -> result.getLong(1), context.tenantId(), roleId,
                sqlTimestamp(now), sqlTimestamp(now)));
        for (Long permissionId : active) {
            if (!desired.contains(permissionId)) jdbc.update("""
                    update role_permission_assignments set valid_to = ?
                     where tenant_id = ? and role_id = ? and permission_id = ?
                       and valid_from <= ? and (valid_to is null or valid_to > ?)
                    """, sqlTimestamp(now), context.tenantId(), roleId, permissionId,
                    sqlTimestamp(now), sqlTimestamp(now));
        }
        for (Long permissionId : desired) {
            if (!active.contains(permissionId)) jdbc.update("""
                    insert into role_permission_assignments
                        (id, tenant_id, role_id, permission_id, valid_from, valid_to, granted_by, created_at)
                    values (?, ?, ?, ?, ?, null, ?, ?)
                    """, GlobalIds.next(), context.tenantId(), roleId, permissionId,
                    sqlTimestamp(now), context.subjectId(), sqlTimestamp(now));
        }
        event(context, "ROLE_PERMISSIONS_REPLACED", "ROLE", roleId,
                permissionCodes.values().stream().sorted().toList().toString());
        return requireRole(context.tenantId(), roleId);
    }

    @Transactional
    public UserRoleAssignmentView assignRole(Long userId, Long roleId, Long organizationId, Long departmentId,
                                             String dataScopeType, Instant validFrom, Instant validTo) {
        ExecutionContext context = current();
        requireManageableUser(context, userId);
        RoleView role = requireRole(context.tenantId(), roleId);
        if (!"ACTIVE".equals(role.status())) throw badRequest("IAM_ROLE_INACTIVE", "不能分配已停用角色");
        String scope = enumValue(dataScopeType, DATA_SCOPES, "数据范围");
        validateScope(context, scope, organizationId, departmentId);
        Instant from = validFrom == null ? Instant.now() : validFrom;
        if (validTo != null && !validTo.isAfter(from)) throw badRequest("IAM_VALIDITY_INVALID", "失效时间必须晚于生效时间");
        Set<String> rolePermissions = new LinkedHashSet<>(role.permissionCodes());
        if (!context.hasAuthority("ROLE_ADMIN") && !context.authorities().containsAll(rolePermissions)) {
            throw forbidden("IAM_ROLE_ESCALATION_FORBIDDEN", "不能分配包含当前账号未具备权限的角色");
        }
        if (overlaps(context.tenantId(), userId, roleId, organizationId, departmentId, from, validTo)) {
            throw conflict("IAM_ASSIGNMENT_OVERLAP", "相同用户、角色和范围已经存在重叠授权");
        }
        Long id = GlobalIds.next();
        Instant now = Instant.now();
        jdbc.update("""
                insert into user_role_assignments
                    (id, tenant_id, user_id, role_id, organization_id, department_id, data_scope_type,
                     valid_from, valid_to, granted_by, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, context.tenantId(), userId, roleId, organizationId, departmentId, scope,
                sqlTimestamp(from), sqlTimestamp(validTo), context.subjectId(), sqlTimestamp(now));
        event(context, "USER_ROLE_ASSIGNED", "USER_ROLE_ASSIGNMENT", id,
                userId + ":" + role.code() + ":" + scope);
        return assignments(userId).stream().filter(value -> value.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public void revokeAssignment(Long assignmentId) {
        ExecutionContext context = current();
        List<AssignmentTarget> targets = jdbc.query("""
                select user_id, organization_id, department_id, data_scope_type
                  from user_role_assignments where tenant_id = ? and id = ?
                """, (result, index) -> new AssignmentTarget(result.getLong("user_id"),
                result.getObject("organization_id", Long.class), result.getObject("department_id", Long.class),
                result.getString("data_scope_type")), context.tenantId(), assignmentId);
        if (targets.isEmpty()) throw notFound("IAM_ASSIGNMENT_NOT_FOUND", "未找到用户角色授权");
        AssignmentTarget target = targets.getFirst();
        requireManageableUser(context, target.userId());
        if (context.hasWorkContext() && (!"DEPARTMENT".equals(target.dataScopeType())
                || !context.organizationId().equals(target.organizationId())
                || !context.departmentId().equals(target.departmentId()))) {
            throw forbidden("IAM_SCOPE_ESCALATION_FORBIDDEN", "当前工作上下文不能撤销其他范围的授权");
        }
        Instant now = Instant.now();
        int changed = jdbc.update("""
                update user_role_assignments
                   set valid_to = case when valid_from > ? then valid_from else ? end
                 where tenant_id = ? and id = ? and (valid_to is null or valid_to > ?)
                """, sqlTimestamp(now), sqlTimestamp(now), context.tenantId(), assignmentId, sqlTimestamp(now));
        if (changed == 0) throw conflict("IAM_ASSIGNMENT_ALREADY_REVOKED", "授权已经失效");
        event(context, "USER_ROLE_REVOKED", "USER_ROLE_ASSIGNMENT", assignmentId, target.userId().toString());
    }

    private RoleView role(Long id, String code, String name, String roleType, String status,
                          long version, Long tenantId) {
        Instant now = Instant.now();
        List<String> permissions = jdbc.query("""
                select permission.code
                  from role_permission_assignments assignment
                  join access_permissions permission
                    on permission.tenant_id = assignment.tenant_id and permission.id = assignment.permission_id
                 where assignment.tenant_id = ? and assignment.role_id = ?
                   and permission.status = 'ACTIVE' and assignment.valid_from <= ?
                   and (assignment.valid_to is null or assignment.valid_to > ?)
                 order by permission.code
                """, (result, index) -> result.getString(1), tenantId, id,
                sqlTimestamp(now), sqlTimestamp(now));
        return new RoleView(id, code, name, roleType, status, version, permissions);
    }

    private RoleView requireRole(Long tenantId, Long roleId) {
        List<BaseRole> values = jdbc.query("""
                select id, code, name, role_type, status, version
                  from access_roles where tenant_id = ? and id = ?
                """, (result, index) -> new BaseRole(result.getLong("id"), result.getString("code"),
                result.getString("name"), result.getString("role_type"), result.getString("status"),
                result.getLong("version")), tenantId, roleId);
        if (values.isEmpty()) throw notFound("IAM_ROLE_NOT_FOUND", "未找到角色");
        return role(values.getFirst(), tenantId);
    }

    private RoleView role(BaseRole value, Long tenantId) {
        return role(value.id(), value.code(), value.name(), value.roleType(), value.status(), value.version(), tenantId);
    }

    private void requireUser(Long tenantId, Long userId) {
        Integer count = jdbc.queryForObject("""
                select count(*) from user_accounts where tenant_id = ? and id = ?
                """, Integer.class, tenantId, userId);
        if (count == null || count == 0) throw notFound("IAM_USER_NOT_FOUND", "未找到用户账号");
    }

    private void requireManageableUser(ExecutionContext context, Long userId) {
        requireUser(context.tenantId(), userId);
        if (!context.hasWorkContext()) return;
        Integer count = jdbc.queryForObject("""
                select count(*)
                  from user_accounts account
                  join employments employment
                    on employment.tenant_id = account.tenant_id
                   and employment.practitioner_id = account.practitioner_id
                  join staff_assignments assignment
                    on assignment.tenant_id = employment.tenant_id
                   and assignment.employment_id = employment.id
                 where account.tenant_id = ? and account.id = ?
                   and assignment.organization_id = ? and assignment.department_id = ?
                   and employment.status = 'ACTIVE' and assignment.status = 'ACTIVE'
                   and employment.hire_date <= current_date
                   and (employment.leave_date is null or employment.leave_date >= current_date)
                   and assignment.valid_from <= current_date
                   and (assignment.valid_to is null or assignment.valid_to >= current_date)
                """, Integer.class, context.tenantId(), userId,
                context.organizationId(), context.departmentId());
        if (count == null || count == 0) {
            throw forbidden("IAM_USER_SCOPE_FORBIDDEN", "当前工作上下文不能管理该用户账号");
        }
    }

    private java.util.Map<Long, String> permissionCodes(Long tenantId, Set<Long> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        List<Object> parameters = new ArrayList<>();
        parameters.add(tenantId);
        parameters.addAll(ids);
        java.util.LinkedHashMap<Long, String> result = new java.util.LinkedHashMap<>();
        jdbc.query("select id, code from access_permissions where tenant_id = ? and status = 'ACTIVE' and id in ("
                        + placeholders + ")", (org.springframework.jdbc.core.RowCallbackHandler)
                        values -> result.put(values.getLong(1), values.getString(2)), parameters.toArray());
        return result;
    }

    private void validateScope(ExecutionContext context, String scope, Long organizationId, Long departmentId) {
        boolean shapeValid = switch (scope) {
            case "TENANT" -> organizationId == null && departmentId == null;
            case "ORGANIZATION" -> organizationId != null && departmentId == null;
            case "DEPARTMENT" -> organizationId != null && departmentId != null;
            default -> false;
        };
        if (!shapeValid) throw badRequest("IAM_SCOPE_INVALID", "数据范围与机构、科室选择不匹配");
        if (organizationId != null) {
            Integer organization = jdbc.queryForObject("""
                    select count(*) from organizations where tenant_id = ? and id = ?
                    """, Integer.class, context.tenantId(), organizationId);
            if (organization == null || organization == 0) throw badRequest("IAM_ORGANIZATION_INVALID", "授权机构不存在");
        }
        if (departmentId != null) {
            Integer department = jdbc.queryForObject("""
                    select count(*) from departments where tenant_id = ? and id = ? and organization_id = ?
                    """, Integer.class, context.tenantId(), departmentId, organizationId);
            if (department == null || department == 0) throw badRequest("IAM_DEPARTMENT_INVALID", "授权科室不属于所选机构");
        }
        if (context.hasWorkContext() && (!"DEPARTMENT".equals(scope)
                || !organizationId.equals(context.organizationId()) || !departmentId.equals(context.departmentId()))) {
            throw forbidden("IAM_SCOPE_ESCALATION_FORBIDDEN", "当前工作上下文只能管理本机构、本科室的授权");
        }
    }

    private boolean overlaps(Long tenantId, Long userId, Long roleId, Long organizationId, Long departmentId,
                             Instant validFrom, Instant validTo) {
        String endCondition = validTo == null ? "" : " and valid_from < ?";
        List<Object> parameters = new ArrayList<>(List.of(tenantId, userId, roleId));
        parameters.add(organizationId);
        parameters.add(organizationId);
        parameters.add(departmentId);
        parameters.add(departmentId);
        parameters.add(sqlTimestamp(validFrom));
        if (validTo != null) parameters.add(sqlTimestamp(validTo));
        Integer count = jdbc.queryForObject("""
                select count(*) from user_role_assignments
                 where tenant_id = ? and user_id = ? and role_id = ?
                   and ((organization_id is null and ? is null) or organization_id = ?)
                   and ((department_id is null and ? is null) or department_id = ?)
                   and (valid_to is null or valid_to > ?)
                """ + endCondition, Integer.class, parameters.toArray());
        return count != null && count > 0;
    }

    private void event(ExecutionContext context, String eventType, String targetType, Long targetId, String details) {
        jdbc.update("""
                insert into iam_authorization_events
                    (id, tenant_id, event_type, target_type, target_id, actor_id, details_json, occurred_at)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """, GlobalIds.next(), context.tenantId(), eventType, targetType, targetId,
                context.subjectId(), details, sqlTimestamp(Instant.now()));
    }

    private ExecutionContext current() {
        return contextProvider.requireCurrent();
    }

    private static Timestamp sqlTimestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private String roleCode(String value) {
        String normalized = required(value, "角色编码").toUpperCase(Locale.ROOT);
        if (!ROLE_CODE.matcher(normalized).matches()) {
            throw badRequest("IAM_ROLE_CODE_INVALID", "角色编码只能包含大写字母、数字和下划线，且必须以字母开头");
        }
        return normalized;
    }

    private String required(String value, String label) {
        if (value == null || value.isBlank()) throw badRequest("IAM_REQUIRED", label + "不能为空");
        return value.trim();
    }

    private String enumValue(String value, Set<String> allowed, String label) {
        String normalized = required(value, label).toUpperCase(Locale.ROOT);
        if (!allowed.contains(normalized)) throw badRequest("IAM_ENUM_INVALID", label + "不合法");
        return normalized;
    }

    private record BaseRole(Long id, String code, String name, String roleType, String status, long version) {
    }

    private record AssignmentTarget(Long userId, Long organizationId, Long departmentId, String dataScopeType) {
    }
}
