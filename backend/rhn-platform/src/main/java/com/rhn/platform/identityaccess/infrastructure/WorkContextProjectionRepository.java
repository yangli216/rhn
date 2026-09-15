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
                select assignment.ID_ORG as organization_id, organization.NA_ORG as organization_name,
                       assignment.ID_DEPT as department_id, department.NA_DEPT as department_name,
                       department.SD_DEPT_TYPE as department_type,
                       department.SD_DEPT_PROPERTY as department_property,
                       assignment.SD_DATA_SCOPE_TYPE as data_scope_type, role.CD_ACC_ROLE as role_code from RHN_SYS_USER_ROLE_ASSIGN assignment
                  join RHN_SYS_ACC_ROLE role
                    on role.ID_TNT = assignment.ID_TNT and role.ID_ACC_ROLE = assignment.ID_ACC_ROLE
                  left join RHN_SYS_ORG organization
                    on organization.ID_TNT = assignment.ID_TNT and organization.ID_ORG = assignment.ID_ORG
                  left join RHN_SYS_DEPT department
                    on department.ID_TNT = assignment.ID_TNT and department.ID_DEPT = assignment.ID_DEPT
                 where assignment.ID_TNT = ? and assignment.ID_USER = ?
                   and role.SD_STATUS = 'ACTIVE'
                   and assignment.DT_VALID_FROM <= current_timestamp
                   and (assignment.DT_VALID_TO is null or assignment.DT_VALID_TO > current_timestamp)
                 order by case
                              when department.SD_DEPT_PROPERTY = 'CLINICAL' then 0
                              when department.SD_DEPT_TYPE = 'MED_PHARMACY_OUTPATIENT' then 10
                              when department.SD_DEPT_TYPE = 'MED_PHARMACY_WAREHOUSE' then 20
                              when department.SD_DEPT_TYPE like 'MED_PHARMACY%' then 30
                              else 40
                          end,
                          assignment.DT_CREATED, assignment.ID_USER_ROLE_ASSIGN, organization.NA_ORG, department.NA_DEPT, role.CD_ACC_ROLE
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
