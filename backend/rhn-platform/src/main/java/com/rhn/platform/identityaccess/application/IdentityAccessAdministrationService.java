package com.rhn.platform.identityaccess.application;

import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.PermissionView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.PractitionerAccessView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.RoleView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.UserRoleAssignmentView;
import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.UserView;
import com.rhn.platform.identityaccess.application.ManagementScopes.Scope;
import com.rhn.platform.realtime.application.PresenceService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import static com.rhn.platform.identityaccess.application.RoleGrantStore.timestamp;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class IdentityAccessAdministrationService {
    private static final Pattern ROLE_CODE = Pattern.compile("[A-Z][A-Z0-9_]{1,63}");
    private static final Pattern USERNAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{2,63}");
    private static final Set<String> CREATABLE_ROLE_TYPES = Set.of("BUSINESS", "CUSTOM");
    private static final Set<String> ROLE_STATUSES = Set.of("ACTIVE", "INACTIVE");
    private static final Set<String> ACCOUNT_STATUSES = Set.of("ACTIVE", "INACTIVE");
    private static final Set<String> DATA_SCOPES = Set.of("TENANT", "ORGANIZATION", "DEPARTMENT");
    private static final String GRANT_ORDER = "grant_row.DT_VALID_FROM desc, grant_row.ID_USER_ROLE_ASSIGN desc";

    private final JdbcTemplate jdbc;
    private final ExecutionContextProvider contextProvider;
    private final ManagementScopes scopes;
    private final RoleGrantStore grants;
    private final DepartmentDefaultRoleService defaultRoles;
    private final PasswordEncoder passwordEncoder;
    private final PresenceService presence;

    public IdentityAccessAdministrationService(JdbcTemplate jdbc, ExecutionContextProvider contextProvider,
                                               ManagementScopes scopes, RoleGrantStore grants,
                                               DepartmentDefaultRoleService defaultRoles,
                                               PasswordEncoder passwordEncoder, PresenceService presence) {
        this.jdbc = jdbc;
        this.contextProvider = contextProvider;
        this.scopes = scopes;
        this.grants = grants;
        this.defaultRoles = defaultRoles;
        this.passwordEncoder = passwordEncoder;
        this.presence = presence;
    }

    @Transactional(readOnly = true)
    public List<RoleView> roles() {
        Long tenantId = current().tenantId();
        List<BaseRole> rows = jdbc.query("""
                select ID_ACC_ROLE as id, CD_ACC_ROLE as code, NA_ACC_ROLE as name, SD_ROLE_TYPE as role_type, SD_STATUS as status, REVISION as version from RHN_SYS_ACC_ROLE
                 where ID_TNT = ?
                 order by SD_STATUS, SD_ROLE_TYPE, CD_ACC_ROLE
                """, (result, index) -> new BaseRole(result.getLong("id"), result.getString("code"),
                result.getString("name"), result.getString("role_type"), result.getString("status"),
                result.getLong("version")), tenantId);
        return rows.stream().map(value -> role(value, tenantId)).toList();
    }

    @Transactional(readOnly = true)
    public List<PermissionView> permissions() {
        Long tenantId = current().tenantId();
        return jdbc.query("""
                select permission.ID_ACC_PERM as id, permission.CD_ACC_PERM as code, permission.NA_ACC_PERM as name, permission.CD_RSRC as resource_code,
                       permission.CD_ACTION as action_code, permission.SD_STATUS as status, module.ID_MGMT_MOD as module_id,
                       module.CD_MGMT_MOD as module_code, module.NA_MGMT_MOD as module_name, module.ROUTE_PATH from RHN_SYS_ACC_PERM permission
                  left join RHN_SYS_MGMT_MOD module
                    on module.ID_TNT = permission.ID_TNT and module.ID_MGMT_MOD = permission.ID_MGMT_MOD
                 where permission.ID_TNT = ?
                 order by module.SN_SORT, permission.CD_RSRC, permission.CD_ACTION
                """, (result, index) -> new PermissionView(result.getLong("id"), result.getString("code"),
                result.getString("name"), result.getString("resource_code"), result.getString("action_code"),
                result.getString("status"), result.getObject("module_id", Long.class),
                result.getString("module_code"), result.getString("module_name"), result.getString("route_path")),
                tenantId);
    }

    /** Accounts in the manager's scope: all accounts for tenant scope, else those with an open assignment there. */
    @Transactional(readOnly = true)
    public List<UserView> users() {
        ExecutionContext context = current();
        Scope scope = scopes.resolve(context);
        List<Object> parameters = new ArrayList<>(List.of(context.tenantId()));
        String filter = "";
        if (!"TENANT".equals(scope.type())) {
            parameters.add(context.tenantId());
            parameters.add(java.sql.Date.valueOf(ManagementScopes.today()));
            filter = " and exists (select 1 " + ManagementScopes.OPEN_STAFF
                    + " and employment.ID_PRACT = account.ID_PRACT" + scope.staffFilter(parameters) + ")";
        }
        return jdbc.query("""
                select account.ID_USER as id, account.CD_USRNM as username, account.SD_STATUS as status,
                       account.REVISION as revision, practitioner.ID_PRACT as practitioner_id,
                       practitioner.CD_PRACT as practitioner_code, practitioner.NA_FULL as practitioner_name
                  from RHN_SYS_USER_ACCT account
                  left join RHN_SYS_PRACT practitioner
                    on practitioner.ID_TNT = account.ID_TNT and practitioner.ID_PRACT = account.ID_PRACT
                 where account.ID_TNT = ?
                """ + filter + " order by account.CD_USRNM", this::user, parameters.toArray());
    }

    @Transactional(readOnly = true)
    public List<UserRoleAssignmentView> assignments(Long userId) {
        ExecutionContext context = current();
        Scope scope = scopes.resolve(context);
        scopes.requireUser(context.tenantId(), scope, userId);
        return userGrants(context.tenantId(), scope, userId);
    }

    /** Reverse lookup: who holds the role, within the manager's scope. Expired grants only on request. */
    @Transactional(readOnly = true)
    public List<UserRoleAssignmentView> roleMembers(Long roleId, boolean includeExpired) {
        ExecutionContext context = current();
        requireRole(context.tenantId(), roleId);
        List<Object> parameters = new ArrayList<>(List.of(roleId));
        String filter = " and grant_row.ID_ACC_ROLE = ?" + scopes.resolve(context).grantFilter(parameters);
        if (!includeExpired) {
            filter += " and (grant_row.DT_VALID_TO is null or grant_row.DT_VALID_TO > ?)";
            parameters.add(timestamp(Instant.now()));
        }
        return grants.find(context.tenantId(), filter, parameters,
                "organization.NA_ORG, department.NA_DEPT, practitioner.CD_PRACT, account.CD_USRNM, grant_row.DT_VALID_FROM desc");
    }

    @Transactional(readOnly = true)
    public PractitionerAccessView practitionerAccess(Long practitionerId) {
        ExecutionContext context = current();
        Scope scope = scopes.resolve(context);
        scopes.requirePractitioner(context.tenantId(), scope, practitionerId);
        return access(context.tenantId(), scope, practitionerId);
    }

    /** Opens the practitioner's login account and applies the default roles of departments they serve in. */
    @Transactional
    public PractitionerAccessView openAccount(Long practitionerId, String username, String initialPassword) {
        ExecutionContext context = current();
        Scope scope = scopes.resolve(context);
        scopes.requirePractitioner(context.tenantId(), scope, practitionerId);
        String status = jdbc.queryForObject("""
                select SD_STATUS from RHN_SYS_PRACT where ID_TNT = ? and ID_PRACT = ? for update
                """, String.class, context.tenantId(), practitionerId);
        if (!"ACTIVE".equals(status)) throw conflict("PRACTITIONER_INACTIVE", "停用人员不能开通登录账号");
        if (account(context.tenantId(), practitionerId) != null) {
            throw conflict("IAM_ACCOUNT_EXISTS", "该人员已经开通登录账号");
        }
        String normalizedUsername = required(username, "登录账号").toLowerCase(Locale.ROOT);
        if (!USERNAME.matcher(normalizedUsername).matches()) {
            throw badRequest("IAM_USERNAME_INVALID", "登录账号为 3–64 位字母、数字、点、下划线或连字符，且以字母或数字开头");
        }
        Integer duplicate = jdbc.queryForObject("""
                select count(*) from RHN_SYS_USER_ACCT where ID_TNT = ? and lower(CD_USRNM) = ?
                """, Integer.class, context.tenantId(), normalizedUsername);
        if (duplicate != null && duplicate > 0) throw conflict("IAM_USERNAME_DUPLICATE", "登录账号已被使用");
        requireStrongPassword(initialPassword, "初始密码");
        Long userId = GlobalIds.next();
        Instant now = Instant.now();
        jdbc.update("""
                insert into RHN_SYS_USER_ACCT
                    (ID_USER, ID_TNT, ID_PRACT, CD_USRNM, HASH_PWD, SD_STATUS, DT_PWD_CHANGED, DT_LAST_LOGIN,
                     DT_CREATED, DT_UPDATED, REVISION)
                values (?, ?, ?, ?, ?, 'ACTIVE', null, null, ?, ?, 0)
                """, userId, context.tenantId(), practitionerId, normalizedUsername,
                passwordEncoder.encode(initialPassword), timestamp(now), timestamp(now));
        grants.event(context, "ACCOUNT_CREATED", "USER", userId, practitionerId + ":" + normalizedUsername);
        defaultRoles.synchronize(context.tenantId(), practitionerId);
        return access(context.tenantId(), scope, practitionerId);
    }

    /**
     * Enables or disables a login account. Disabling ends its sessions after commit; HTTP Basic and refresh logins
     * re-check the account status on every request, so a disabled account cannot sign in again.
     */
    @Transactional
    public UserView changeAccountStatus(Long userId, long expectedRevision, String status, String reason) {
        ExecutionContext context = current();
        Scope scope = scopes.resolve(context);
        Long practitionerId = scopes.requireUser(context.tenantId(), scope, userId);
        String target = enumValue(status, ACCOUNT_STATUSES, "账号状态");
        UserView account = requireRevision(context.tenantId(), userId, expectedRevision);
        if (target.equals(account.status())) {
            throw conflict("IAM_ACCOUNT_STATUS_UNCHANGED", "ACTIVE".equals(target) ? "账号已经是启用状态" : "账号已经是停用状态");
        }
        if ("INACTIVE".equals(target) && userId.equals(context.subjectId())) {
            throw conflict("IAM_ACCOUNT_SELF_DISABLE", "不能停用当前登录的账号");
        }
        if ("ACTIVE".equals(target) && practitionerId != null && !"ACTIVE".equals(jdbc.queryForObject("""
                select SD_STATUS from RHN_SYS_PRACT where ID_TNT = ? and ID_PRACT = ?
                """, String.class, context.tenantId(), practitionerId))) {
            throw conflict("PRACTITIONER_INACTIVE", "人员档案已停用，不能启用其登录账号");
        }
        String normalizedReason = reason == null || reason.isBlank() ? null : reason.trim();
        int changed = jdbc.update("""
                update RHN_SYS_USER_ACCT set SD_STATUS = ?, DT_UPDATED = ?, REVISION = REVISION + 1
                 where ID_TNT = ? and ID_USER = ? and REVISION = ?
                """, target, timestamp(Instant.now()), context.tenantId(), userId, expectedRevision);
        if (changed == 0) throw accountVersionConflict();
        grants.event(context, "ACTIVE".equals(target) ? "ACCOUNT_ENABLED" : "ACCOUNT_DISABLED", "USER", userId,
                normalizedReason == null ? account.username() : account.username() + ":" + normalizedReason);
        if ("INACTIVE".equals(target)) terminateSessionsAfterCommit(context, userId, "账号已被管理员停用");
        return requireAccount(context.tenantId(), userId);
    }

    /** Replaces the password with one set by the administrator and ends the account's sessions after commit. */
    @Transactional
    public UserView resetPassword(Long userId, long expectedRevision, String newPassword) {
        ExecutionContext context = current();
        scopes.requireUser(context.tenantId(), scopes.resolve(context), userId);
        requireStrongPassword(newPassword, "新密码");
        UserView account = requireRevision(context.tenantId(), userId, expectedRevision);
        int changed = jdbc.update("""
                update RHN_SYS_USER_ACCT set HASH_PWD = ?, DT_PWD_CHANGED = null, DT_UPDATED = ?, REVISION = REVISION + 1
                 where ID_TNT = ? and ID_USER = ? and REVISION = ?
                """, passwordEncoder.encode(newPassword), timestamp(Instant.now()), context.tenantId(), userId,
                expectedRevision);
        if (changed == 0) throw accountVersionConflict();
        grants.event(context, "PASSWORD_RESET", "USER", userId, account.username());
        terminateSessionsAfterCommit(context, userId, "账号密码已被管理员重置");
        return requireAccount(context.tenantId(), userId);
    }

    @Transactional
    public RoleView createRole(String code, String name, String roleType) {
        ExecutionContext context = current();
        String normalizedCode = roleCode(code);
        String normalizedName = required(name, "角色名称");
        String normalizedType = enumValue(roleType, CREATABLE_ROLE_TYPES, "角色类型");
        Integer exists = jdbc.queryForObject("""
                select count(*) from RHN_SYS_ACC_ROLE where ID_TNT = ? and CD_ACC_ROLE = ?
                """, Integer.class, context.tenantId(), normalizedCode);
        if (exists != null && exists > 0) throw conflict("IAM_ROLE_CODE_DUPLICATE", "角色编码已经存在");
        Long id = GlobalIds.next();
        Instant now = Instant.now();
        jdbc.update("""
                insert into RHN_SYS_ACC_ROLE
                    (ID_ACC_ROLE, ID_TNT, CD_ACC_ROLE, NA_ACC_ROLE, SD_ROLE_TYPE, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION)
                values (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, 0)
                """, id, context.tenantId(), normalizedCode, normalizedName, normalizedType,
                timestamp(now), timestamp(now));
        grants.event(context, "ROLE_CREATED", "ROLE", id, normalizedCode);
        return role(id, normalizedCode, normalizedName, normalizedType, "ACTIVE", 0, context.tenantId());
    }

    @Transactional
    public RoleView updateRole(Long roleId, long expectedVersion, String name, String status) {
        ExecutionContext context = current();
        requireRole(context.tenantId(), roleId);
        String normalizedName = required(name, "角色名称");
        String normalizedStatus = enumValue(status, ROLE_STATUSES, "角色状态");
        int changed = jdbc.update("""
                update RHN_SYS_ACC_ROLE set NA_ACC_ROLE = ?, SD_STATUS = ?, DT_UPDATED = ?, REVISION = REVISION + 1
                 where ID_TNT = ? and ID_ACC_ROLE = ? and REVISION = ?
                """, normalizedName, normalizedStatus, timestamp(Instant.now()),
                context.tenantId(), roleId, expectedVersion);
        if (changed == 0) throw conflict("IAM_ROLE_VERSION_CONFLICT", "角色已被其他用户修改，请刷新后重试");
        grants.event(context, "ROLE_UPDATED", "ROLE", roleId, normalizedStatus);
        return requireRole(context.tenantId(), roleId);
    }

    @Transactional
    public RoleView replaceRolePermissions(Long roleId, long expectedVersion, Set<Long> permissionIds) {
        ExecutionContext context = current();
        requireRole(context.tenantId(), roleId);
        Set<Long> desired = permissionIds == null ? Set.of() : Set.copyOf(permissionIds);
        var permissionCodes = permissionCodes(context.tenantId(), desired);
        if (permissionCodes.size() != desired.size()) throw badRequest("IAM_PERMISSION_INVALID", "包含不存在或已停用的权限");
        ManagementScopes.requireGrantable(context, new LinkedHashSet<>(permissionCodes.values()),
                "IAM_PERMISSION_ESCALATION_FORBIDDEN", "不能授予当前账号自身不具备的权限");
        int versionChanged = jdbc.update("""
                update RHN_SYS_ACC_ROLE set DT_UPDATED = ?, REVISION = REVISION + 1
                 where ID_TNT = ? and ID_ACC_ROLE = ? and REVISION = ?
                """, timestamp(Instant.now()), context.tenantId(), roleId, expectedVersion);
        if (versionChanged == 0) throw conflict("IAM_ROLE_VERSION_CONFLICT", "角色已被其他用户修改，请刷新后重试");

        Instant now = Instant.now();
        Set<Long> active = new LinkedHashSet<>(jdbc.query("""
                select ID_ACC_PERM as permission_id from RHN_SYS_ROLE_PERM_ASSIGN
                 where ID_TNT = ? and ID_ACC_ROLE = ? and DT_VALID_FROM <= ?
                   and (DT_VALID_TO is null or DT_VALID_TO > ?)
                """, (result, index) -> result.getLong(1), context.tenantId(), roleId,
                timestamp(now), timestamp(now)));
        for (Long permissionId : active) {
            if (!desired.contains(permissionId)) jdbc.update("""
                    update RHN_SYS_ROLE_PERM_ASSIGN set DT_VALID_TO = ?
                     where ID_TNT = ? and ID_ACC_ROLE = ? and ID_ACC_PERM = ?
                       and DT_VALID_FROM <= ? and (DT_VALID_TO is null or DT_VALID_TO > ?)
                    """, timestamp(now), context.tenantId(), roleId, permissionId,
                    timestamp(now), timestamp(now));
        }
        for (Long permissionId : desired) {
            if (!active.contains(permissionId)) jdbc.update("""
                    insert into RHN_SYS_ROLE_PERM_ASSIGN
                        (ID_ROLE_PERM_ASSIGN, ID_TNT, ID_ACC_ROLE, ID_ACC_PERM, DT_VALID_FROM, DT_VALID_TO, ID_USER_GRANTED, DT_CREATED)
                    values (?, ?, ?, ?, ?, null, ?, ?)
                    """, GlobalIds.next(), context.tenantId(), roleId, permissionId,
                    timestamp(now), context.subjectId(), timestamp(now));
        }
        grants.event(context, "ROLE_PERMISSIONS_REPLACED", "ROLE", roleId,
                permissionCodes.values().stream().sorted().toList().toString());
        return requireRole(context.tenantId(), roleId);
    }

    @Transactional
    public UserRoleAssignmentView assignRole(Long userId, Long roleId, Long organizationId, Long departmentId,
                                             String dataScopeType, Instant validFrom, Instant validTo) {
        ExecutionContext context = current();
        Scope scope = scopes.resolve(context);
        scopes.requireUser(context.tenantId(), scope, userId);
        RoleView role = requireRole(context.tenantId(), roleId);
        if (!"ACTIVE".equals(role.status())) throw badRequest("IAM_ROLE_INACTIVE", "不能分配已停用角色");
        String scopeType = enumValue(dataScopeType, DATA_SCOPES, "数据范围");
        validateScope(context, scope, scopeType, organizationId, departmentId);
        Instant from = validFrom == null ? Instant.now() : validFrom;
        if (validTo != null && !validTo.isAfter(from)) throw badRequest("IAM_VALIDITY_INVALID", "失效时间必须晚于生效时间");
        ManagementScopes.requireGrantable(context, new LinkedHashSet<>(role.permissionCodes()),
                "IAM_ROLE_ESCALATION_FORBIDDEN", "不能分配包含当前账号未具备权限的角色");
        if (grants.overlaps(context.tenantId(), userId, roleId, organizationId, departmentId, from, validTo)) {
            throw conflict("IAM_ASSIGNMENT_OVERLAP", "相同用户、角色和范围已经存在重叠授权");
        }
        Long id = grants.insert(context, userId, roleId, role.code(), organizationId, departmentId, scopeType,
                from, validTo, RoleGrantStore.MANUAL, null);
        return grants.require(context.tenantId(), id);
    }

    @Transactional
    public void revokeAssignment(Long assignmentId) {
        ExecutionContext context = current();
        List<UserRoleAssignmentView> targets = grants.find(context.tenantId(),
                " and grant_row.ID_USER_ROLE_ASSIGN = ?", List.of(assignmentId), "grant_row.ID_USER_ROLE_ASSIGN");
        if (targets.isEmpty()) throw notFound("IAM_ASSIGNMENT_NOT_FOUND", "未找到用户角色授权");
        UserRoleAssignmentView target = targets.getFirst();
        Scope scope = scopes.resolve(context);
        scopes.requireUser(context.tenantId(), scope, target.userId());
        if (!scope.covers(target.dataScopeType(), target.organizationId(), target.departmentId())) {
            throw forbidden("IAM_SCOPE_ESCALATION_FORBIDDEN", "当前工作上下文不能撤销其他范围的授权");
        }
        if (!grants.end(context, assignmentId, Instant.now(), "USER_ROLE_REVOKED")) {
            throw conflict("IAM_ASSIGNMENT_ALREADY_REVOKED", "授权已经失效");
        }
    }

    private PractitionerAccessView access(Long tenantId, Scope scope, Long practitionerId) {
        UserView account = account(tenantId, practitionerId);
        return new PractitionerAccessView(practitionerId, account,
                account == null ? List.of() : userGrants(tenantId, scope, account.id()), scopes.view(tenantId, scope));
    }

    private List<UserRoleAssignmentView> userGrants(Long tenantId, Scope scope, Long userId) {
        List<Object> parameters = new ArrayList<>(List.of(userId));
        String filter = " and grant_row.ID_USER = ?" + scope.grantFilter(parameters);
        return grants.find(tenantId, filter, parameters, GRANT_ORDER);
    }

    private UserView account(Long tenantId, Long practitionerId) {
        return jdbc.query("""
                select account.ID_USER as id, account.CD_USRNM as username, account.SD_STATUS as status,
                       account.REVISION as revision, practitioner.ID_PRACT as practitioner_id,
                       practitioner.CD_PRACT as practitioner_code, practitioner.NA_FULL as practitioner_name
                  from RHN_SYS_USER_ACCT account
                  join RHN_SYS_PRACT practitioner
                    on practitioner.ID_TNT = account.ID_TNT and practitioner.ID_PRACT = account.ID_PRACT
                 where account.ID_TNT = ? and account.ID_PRACT = ?
                 order by account.DT_CREATED, account.ID_USER
                """, this::user, tenantId, practitionerId).stream().findFirst().orElse(null);
    }

    private UserView requireRevision(Long tenantId, Long userId, long expectedRevision) {
        UserView account = requireAccount(tenantId, userId);
        if (account.revision() != expectedRevision) throw accountVersionConflict();
        return account;
    }

    private static RuntimeException accountVersionConflict() {
        return conflict("IAM_ACCOUNT_VERSION_CONFLICT", "账号已被其他用户修改，请刷新后重试");
    }

    private UserView requireAccount(Long tenantId, Long userId) {
        return jdbc.query("""
                select account.ID_USER as id, account.CD_USRNM as username, account.SD_STATUS as status,
                       account.REVISION as revision, practitioner.ID_PRACT as practitioner_id,
                       practitioner.CD_PRACT as practitioner_code, practitioner.NA_FULL as practitioner_name
                  from RHN_SYS_USER_ACCT account
                  left join RHN_SYS_PRACT practitioner
                    on practitioner.ID_TNT = account.ID_TNT and practitioner.ID_PRACT = account.ID_PRACT
                 where account.ID_TNT = ? and account.ID_USER = ?
                """, this::user, tenantId, userId).stream().findFirst()
                .orElseThrow(() -> notFound("IAM_USER_NOT_FOUND", "未找到用户账号"));
    }

    private void terminateSessionsAfterCommit(ExecutionContext context, Long userId, String reason) {
        Runnable terminate = () -> presence.terminateAccountSessions(context.tenantId(), userId, reason, context.subjectId());
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            terminate.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                terminate.run();
            }
        });
    }

    private static void requireStrongPassword(String password, String label) {
        if (password == null || password.length() < 8 || password.length() > 64
                || password.chars().noneMatch(Character::isLetter)
                || password.chars().noneMatch(Character::isDigit)) {
            throw badRequest("IAM_PASSWORD_WEAK", label + "须为 8–64 位，且同时包含字母和数字");
        }
    }

    private UserView user(java.sql.ResultSet result, int index) throws java.sql.SQLException {
        return new UserView(result.getLong("id"), result.getString("username"), result.getString("status"),
                result.getLong("revision"), result.getObject("practitioner_id", Long.class),
                result.getString("practitioner_code"), result.getString("practitioner_name"));
    }

    private RoleView role(Long id, String code, String name, String roleType, String status,
                          long version, Long tenantId) {
        Instant now = Instant.now();
        List<String> permissions = jdbc.query("""
                select permission.CD_ACC_PERM as code from RHN_SYS_ROLE_PERM_ASSIGN assignment
                  join RHN_SYS_ACC_PERM permission
                    on permission.ID_TNT = assignment.ID_TNT and permission.ID_ACC_PERM = assignment.ID_ACC_PERM
                 where assignment.ID_TNT = ? and assignment.ID_ACC_ROLE = ?
                   and permission.SD_STATUS = 'ACTIVE' and assignment.DT_VALID_FROM <= ?
                   and (assignment.DT_VALID_TO is null or assignment.DT_VALID_TO > ?)
                 order by permission.CD_ACC_PERM
                """, (result, index) -> result.getString(1), tenantId, id,
                timestamp(now), timestamp(now));
        return new RoleView(id, code, name, roleType, status, version, permissions);
    }

    RoleView requireRole(Long tenantId, Long roleId) {
        List<BaseRole> values = jdbc.query("""
                select ID_ACC_ROLE as id, CD_ACC_ROLE as code, NA_ACC_ROLE as name, SD_ROLE_TYPE as role_type, SD_STATUS as status, REVISION as version from RHN_SYS_ACC_ROLE where ID_TNT = ? and ID_ACC_ROLE = ?
                """, (result, index) -> new BaseRole(result.getLong("id"), result.getString("code"),
                result.getString("name"), result.getString("role_type"), result.getString("status"),
                result.getLong("version")), tenantId, roleId);
        if (values.isEmpty()) throw notFound("IAM_ROLE_NOT_FOUND", "未找到角色");
        return role(values.getFirst(), tenantId);
    }

    private RoleView role(BaseRole value, Long tenantId) {
        return role(value.id(), value.code(), value.name(), value.roleType(), value.status(), value.version(), tenantId);
    }

    private java.util.Map<Long, String> permissionCodes(Long tenantId, Set<Long> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        List<Object> parameters = new ArrayList<>();
        parameters.add(tenantId);
        parameters.addAll(ids);
        java.util.LinkedHashMap<Long, String> result = new java.util.LinkedHashMap<>();
        jdbc.query("select ID_ACC_PERM as id, CD_ACC_PERM as code from RHN_SYS_ACC_PERM where ID_TNT = ? and SD_STATUS = 'ACTIVE' and ID_ACC_PERM in ("
                        + placeholders + ")", (org.springframework.jdbc.core.RowCallbackHandler)
                        values -> result.put(values.getLong(1), values.getString(2)), parameters.toArray());
        return result;
    }

    private void validateScope(ExecutionContext context, Scope scope, String scopeType, Long organizationId,
                               Long departmentId) {
        boolean shapeValid = switch (scopeType) {
            case "TENANT" -> organizationId == null && departmentId == null;
            case "ORGANIZATION" -> organizationId != null && departmentId == null;
            case "DEPARTMENT" -> organizationId != null && departmentId != null;
            default -> false;
        };
        if (!shapeValid) throw badRequest("IAM_SCOPE_INVALID", "数据范围与机构、科室选择不匹配");
        if (organizationId != null) {
            Integer organization = jdbc.queryForObject("""
                    select count(*) from RHN_SYS_ORG where ID_TNT = ? and ID_ORG = ?
                    """, Integer.class, context.tenantId(), organizationId);
            if (organization == null || organization == 0) throw badRequest("IAM_ORGANIZATION_INVALID", "授权机构不存在");
        }
        if (departmentId != null) {
            Integer department = jdbc.queryForObject("""
                    select count(*) from RHN_SYS_DEPT where ID_TNT = ? and ID_DEPT = ? and ID_ORG = ?
                    """, Integer.class, context.tenantId(), departmentId, organizationId);
            if (department == null || department == 0) throw badRequest("IAM_DEPARTMENT_INVALID", "授权科室不属于所选机构");
        }
        if (!scope.covers(scopeType, organizationId, departmentId)) {
            throw forbidden("IAM_SCOPE_ESCALATION_FORBIDDEN", "授权范围超出当前账号可管理的机构、科室");
        }
    }

    private ExecutionContext current() {
        return contextProvider.requireCurrent();
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
}
