package com.rhn.platform.identityaccess.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

@Repository
public class WorkContextProjectionRepository {
    private final JdbcTemplate jdbcTemplate;

    public WorkContextProjectionRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Row> findAvailable(Long tenantId, Long userId) {
        return jdbcTemplate.query("""
                select assignment.organization_id, organization.name as organization_name,
                       assignment.department_id, department.name as department_name,
                       department.department_type, department.department_property,
                       assignment.data_scope_type, role.code as role_code
                  from user_role_assignments assignment
                  join access_roles role
                    on role.tenant_id = assignment.tenant_id and role.id = assignment.role_id
                  left join organizations organization
                    on organization.tenant_id = assignment.tenant_id and organization.id = assignment.organization_id
                  left join departments department
                    on department.tenant_id = assignment.tenant_id and department.id = assignment.department_id
                 where assignment.tenant_id = ? and assignment.user_id = ?
                   and role.status = 'ACTIVE'
                   and assignment.valid_from <= current_timestamp
                   and (assignment.valid_to is null or assignment.valid_to > current_timestamp)
                 order by case
                              when department.department_property = 'CLINICAL' then 0
                              when department.department_type = 'MED_PHARMACY_OUTPATIENT' then 10
                              when department.department_type = 'MED_PHARMACY_WAREHOUSE' then 20
                              when department.department_type like 'MED_PHARMACY%' then 30
                              else 40
                          end,
                          assignment.created_at, assignment.id, organization.name, department.name, role.code
                """, this::row, tenantId, userId);
    }

    private Row row(ResultSet result, int index) throws SQLException {
        return new Row(result.getObject("organization_id", Long.class), result.getString("organization_name"),
                result.getObject("department_id", Long.class), result.getString("department_name"),
                result.getString("department_type"), result.getString("department_property"),
                result.getString("data_scope_type"), result.getString("role_code"));
    }

    public record Row(Long organizationId, String organizationName, Long departmentId,
                      String departmentName, String departmentType, String departmentProperty,
                      String dataScopeType, String roleCode) {
    }
}
