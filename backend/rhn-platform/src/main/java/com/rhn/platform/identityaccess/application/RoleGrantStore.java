package com.rhn.platform.identityaccess.application;

import com.rhn.platform.identityaccess.api.IdentityAccessAdminViews.UserRoleAssignmentView;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** User-role grant rows and their audit events, shared by manual grants and department-default grants. */
@Component
class RoleGrantStore {
    static final String MANUAL = "MANUAL";
    static final String DEPT_DEFAULT = "DEPT_DEFAULT";

    private static final String GRANT_SELECT = """
            select grant_row.ID_USER_ROLE_ASSIGN as id, grant_row.ID_USER as user_id, account.CD_USRNM as username,
                   grant_row.ID_ACC_ROLE as role_id, role.CD_ACC_ROLE as role_code, role.NA_ACC_ROLE as role_name,
                   grant_row.ID_ORG as organization_id, organization.NA_ORG as organization_name,
                   grant_row.ID_DEPT as department_id, department.NA_DEPT as department_name,
                   grant_row.SD_DATA_SCOPE_TYPE as data_scope_type, grant_row.DT_VALID_FROM as valid_from,
                   grant_row.DT_VALID_TO as valid_to, grant_row.ID_USER_GRANTED as granted_by,
                   grant_row.DT_CREATED as created_at, grant_row.SD_GRANT_SRC as grant_source,
                   grant_row.ID_STAFF_ASSIGN as staff_assignment_id, practitioner.ID_PRACT as practitioner_id,
                   practitioner.CD_PRACT as practitioner_code, practitioner.NA_FULL as practitioner_name
              from RHN_SYS_USER_ROLE_ASSIGN grant_row
              join RHN_SYS_USER_ACCT account
                on account.ID_TNT = grant_row.ID_TNT and account.ID_USER = grant_row.ID_USER
              join RHN_SYS_ACC_ROLE role
                on role.ID_TNT = grant_row.ID_TNT and role.ID_ACC_ROLE = grant_row.ID_ACC_ROLE
              left join RHN_SYS_ORG organization
                on organization.ID_TNT = grant_row.ID_TNT and organization.ID_ORG = grant_row.ID_ORG
              left join RHN_SYS_DEPT department
                on department.ID_TNT = grant_row.ID_TNT and department.ID_DEPT = grant_row.ID_DEPT
              left join RHN_SYS_PRACT practitioner
                on practitioner.ID_TNT = account.ID_TNT and practitioner.ID_PRACT = account.ID_PRACT
             where grant_row.ID_TNT = ?
            """;

    private final JdbcTemplate jdbc;

    RoleGrantStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Grants matching an extra where-fragment over alias {@code grant_row}; parameters follow the tenant id. */
    List<UserRoleAssignmentView> find(Long tenantId, String filter, List<Object> parameters, String orderBy) {
        Instant now = Instant.now();
        List<Object> values = new ArrayList<>();
        values.add(tenantId);
        values.addAll(parameters);
        return jdbc.query(GRANT_SELECT + filter + " order by " + orderBy, (result, index) -> {
            Instant from = result.getTimestamp("valid_from").toInstant();
            Timestamp toValue = result.getTimestamp("valid_to");
            Instant to = toValue == null ? null : toValue.toInstant();
            return new UserRoleAssignmentView(result.getLong("id"), result.getLong("user_id"),
                    result.getString("username"), result.getLong("role_id"), result.getString("role_code"),
                    result.getString("role_name"), result.getObject("organization_id", Long.class),
                    result.getString("organization_name"), result.getObject("department_id", Long.class),
                    result.getString("department_name"), result.getString("data_scope_type"), from, to,
                    result.getObject("granted_by", Long.class), result.getTimestamp("created_at").toInstant(),
                    !from.isAfter(now) && (to == null || to.isAfter(now)), result.getString("grant_source"),
                    result.getObject("staff_assignment_id", Long.class),
                    result.getObject("practitioner_id", Long.class), result.getString("practitioner_code"),
                    result.getString("practitioner_name"));
        }, values.toArray());
    }

    UserRoleAssignmentView require(Long tenantId, Long grantId) {
        return find(tenantId, " and grant_row.ID_USER_ROLE_ASSIGN = ?", List.of(grantId), "grant_row.ID_USER_ROLE_ASSIGN")
                .getFirst();
    }

    /** Whether the same user, role and organization/department already hold a grant overlapping the period. */
    boolean overlaps(Long tenantId, Long userId, Long roleId, Long organizationId, Long departmentId,
                     Instant validFrom, Instant validTo) {
        StringBuilder sql = new StringBuilder("""
                select count(*) from RHN_SYS_USER_ROLE_ASSIGN
                 where ID_TNT = ? and ID_USER = ? and ID_ACC_ROLE = ?
                   and (DT_VALID_TO is null or DT_VALID_TO > ?)
                """);
        List<Object> parameters = new ArrayList<>(List.of(tenantId, userId, roleId, timestamp(validFrom)));
        sql.append(organizationId == null ? " and ID_ORG is null" : " and ID_ORG = ?");
        if (organizationId != null) parameters.add(organizationId);
        sql.append(departmentId == null ? " and ID_DEPT is null" : " and ID_DEPT = ?");
        if (departmentId != null) parameters.add(departmentId);
        if (validTo != null) {
            sql.append(" and DT_VALID_FROM < ?");
            parameters.add(timestamp(validTo));
        }
        Integer count = jdbc.queryForObject(sql.toString(), Integer.class, parameters.toArray());
        return count != null && count > 0;
    }

    Long insert(ExecutionContext context, Long userId, Long roleId, String roleCode, Long organizationId,
                Long departmentId, String scopeType, Instant validFrom, Instant validTo, String source,
                Long staffAssignmentId) {
        Long id = GlobalIds.next();
        jdbc.update("""
                insert into RHN_SYS_USER_ROLE_ASSIGN
                    (ID_USER_ROLE_ASSIGN, ID_TNT, ID_USER, ID_ACC_ROLE, ID_ORG, ID_DEPT, SD_DATA_SCOPE_TYPE,
                     DT_VALID_FROM, DT_VALID_TO, ID_USER_GRANTED, DT_CREATED, SD_GRANT_SRC, ID_STAFF_ASSIGN)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, context.tenantId(), userId, roleId, organizationId, departmentId, scopeType,
                timestamp(validFrom), timestamp(validTo), context.subjectId(), timestamp(Instant.now()), source,
                staffAssignmentId);
        event(context, "USER_ROLE_ASSIGNED", "USER_ROLE_ASSIGNMENT", id,
                userId + ":" + roleCode + ":" + scopeType + ":" + source);
        return id;
    }

    /** Ends a grant at {@code end} (never before it started); returns false when it had already ended. */
    boolean end(ExecutionContext context, Long grantId, Instant end, String eventType) {
        int changed = jdbc.update("""
                update RHN_SYS_USER_ROLE_ASSIGN
                   set DT_VALID_TO = case when DT_VALID_FROM > ? then DT_VALID_FROM else ? end
                 where ID_TNT = ? and ID_USER_ROLE_ASSIGN = ? and (DT_VALID_TO is null or DT_VALID_TO > ?)
                """, timestamp(end), timestamp(end), context.tenantId(), grantId, timestamp(end));
        if (changed > 0) event(context, eventType, "USER_ROLE_ASSIGNMENT", grantId, end.toString());
        return changed > 0;
    }

    void event(ExecutionContext context, String eventType, String targetType, Long targetId, String details) {
        jdbc.update("""
                insert into RHN_AUD_IAM_AUTH_EVT
                    (ID_IAM_AUTH_EVT, ID_TNT, SD_EVT_TYPE, SD_TARGET_TYPE, ID_TARGET, ID_USER_ACTOR, JSON_DETAIL, DT_OCCRD)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """, GlobalIds.next(), context.tenantId(), eventType, targetType, targetId,
                context.subjectId(), details, timestamp(Instant.now()));
    }

    static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }
}
