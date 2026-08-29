package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.api.DepartmentProfileView;
import com.rhn.platform.organization.domain.Department;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;

@Repository
public class DepartmentProfileStore {
    private static final String ACTIVE = "ACTIVE";
    private final JdbcClient jdbc;

    public DepartmentProfileStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public DepartmentProfileView load(Department department) {
        Long tenantId = department.tenantId();
        Long departmentId = department.id();
        return new DepartmentProfileView(department.toView(),
                jdbc.sql("""
                        select id, contact_type, contact_value, contact_use, primary_contact,
                               sort_order, valid_from, valid_to, status
                        from department_contacts
                        where tenant_id = :tenantId and department_id = :departmentId
                        order by primary_contact desc, sort_order, id
                        """).param("tenantId", tenantId).param("departmentId", departmentId)
                        .query((rs, row) -> new DepartmentProfileView.DepartmentContact(
                                rs.getLong("id"), rs.getString("contact_type"), rs.getString("contact_value"),
                                rs.getString("contact_use"), rs.getBoolean("primary_contact"),
                                rs.getInt("sort_order"), rs.getObject("valid_from", LocalDate.class),
                                rs.getObject("valid_to", LocalDate.class), rs.getString("status"))).list(),
                jdbc.sql("""
                        select r.id, r.target_department_id, d.name target_name, r.relation_type,
                               r.primary_relation, r.description, r.valid_from, r.valid_to, r.status
                        from department_relations r
                        join departments d on d.tenant_id = r.tenant_id and d.id = r.target_department_id
                        where r.tenant_id = :tenantId and r.source_department_id = :departmentId
                        order by r.primary_relation desc, r.relation_type, d.name
                        """).param("tenantId", tenantId).param("departmentId", departmentId)
                        .query((rs, row) -> new DepartmentProfileView.DepartmentRelation(
                                rs.getLong("id"), rs.getLong("target_department_id"),
                                rs.getString("target_name"), rs.getString("relation_type"),
                                rs.getBoolean("primary_relation"), rs.getString("description"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("status"))).list(),
                jdbc.sql("""
                        select id, capability_type, qualification_basis_code, capability_scope,
                               valid_from, valid_to, verify_status, status
                        from department_capabilities
                        where tenant_id = :tenantId and department_id = :departmentId
                        order by capability_type, valid_from desc
                        """).param("tenantId", tenantId).param("departmentId", departmentId)
                        .query((rs, row) -> new DepartmentProfileView.DepartmentCapability(
                                rs.getLong("id"), rs.getString("capability_type"),
                                rs.getString("qualification_basis_code"), rs.getString("capability_scope"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("verify_status"), rs.getString("status"))).list(),
                jdbc.sql("""
                        select r.id, r.assignment_id,
                               case when r.assignment_id is null then r.external_responsible_name else p.full_name end responsible_name,
                               r.responsibility_type, r.primary_responsibility, r.valid_from, r.valid_to, r.status
                        from department_responsibilities r
                        left join staff_assignments a on a.tenant_id = r.tenant_id and a.id = r.assignment_id
                        left join employments e on e.tenant_id = a.tenant_id and e.id = a.employment_id
                        left join practitioners p on p.tenant_id = e.tenant_id and p.id = e.practitioner_id
                        where r.tenant_id = :tenantId and r.department_id = :departmentId
                        order by r.primary_responsibility desc, r.responsibility_type, responsible_name
                        """).param("tenantId", tenantId).param("departmentId", departmentId)
                        .query((rs, row) -> new DepartmentProfileView.DepartmentResponsibility(
                                rs.getLong("id"), nullableLong(rs, "assignment_id"),
                                rs.getString("responsible_name"), rs.getString("responsibility_type"),
                                rs.getBoolean("primary_responsibility"), rs.getObject("valid_from", LocalDate.class),
                                rs.getObject("valid_to", LocalDate.class), rs.getString("status"))).list());
    }

    public void addContact(Long tenantId, Long departmentId, String type, String value, String use,
                           boolean primary, int sortOrder, LocalDate from, LocalDate to) {
        jdbc.sql("""
                insert into department_contacts
                    (id, tenant_id, department_id, contact_type, contact_value, contact_use,
                     primary_contact, sort_order, valid_from, valid_to, status)
                values (:id, :tenantId, :departmentId, :type, :value, :use,
                        :primary, :sortOrder, :validFrom, :validTo, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId)
                .param("departmentId", departmentId).param("type", type).param("value", value)
                .param("use", use).param("primary", primary).param("sortOrder", sortOrder)
                .param("validFrom", from).param("validTo", to).param("status", ACTIVE).update();
    }

    public void addRelation(Long tenantId, Long sourceId, Long targetId, String type, boolean primary,
                            String description, LocalDate from, LocalDate to) {
        jdbc.sql("""
                insert into department_relations
                    (id, tenant_id, source_department_id, target_department_id, relation_type,
                     primary_relation, description, valid_from, valid_to, status)
                values (:id, :tenantId, :sourceId, :targetId, :type,
                        :primary, :description, :validFrom, :validTo, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId).param("sourceId", sourceId)
                .param("targetId", targetId).param("type", type).param("primary", primary)
                .param("description", description).param("validFrom", from).param("validTo", to)
                .param("status", ACTIVE).update();
    }

    public void addCapability(Long tenantId, Long departmentId, String type, String qualification,
                              String scope, LocalDate from, LocalDate to, String verifyStatus) {
        jdbc.sql("""
                insert into department_capabilities
                    (id, tenant_id, department_id, capability_type, qualification_basis_code,
                     capability_scope, valid_from, valid_to, verify_status, status)
                values (:id, :tenantId, :departmentId, :type, :qualification,
                        :scope, :validFrom, :validTo, :verifyStatus, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId)
                .param("departmentId", departmentId).param("type", type)
                .param("qualification", qualification).param("scope", scope).param("validFrom", from)
                .param("validTo", to).param("verifyStatus", verifyStatus).param("status", ACTIVE).update();
    }

    public void addResponsibility(Long tenantId, Long departmentId, Long assignmentId, String externalName,
                                  String type, boolean primary, LocalDate from, LocalDate to) {
        jdbc.sql("""
                insert into department_responsibilities
                    (id, tenant_id, department_id, assignment_id, external_responsible_name,
                     responsibility_type, primary_responsibility, valid_from, valid_to, status)
                values (:id, :tenantId, :departmentId, :assignmentId, :externalName,
                        :type, :primary, :validFrom, :validTo, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId)
                .param("departmentId", departmentId).param("assignmentId", assignmentId)
                .param("externalName", externalName).param("type", type).param("primary", primary)
                .param("validFrom", from).param("validTo", to).param("status", ACTIVE).update();
    }

    private static Long nullableLong(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        long value = resultSet.getLong(column);
        return resultSet.wasNull() ? null : value;
    }
}
