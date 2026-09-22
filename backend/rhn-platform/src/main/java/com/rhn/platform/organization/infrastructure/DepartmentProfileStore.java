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
                        select ID_DEPT_CONTACT as id, SD_CONTACT_TYPE as contact_type, CONTACT_VALUE, CONTACT_USE, FG_PRIMARY_CONTACT as primary_contact,
                               SN_SORT as sort_order, DA_VALID_FROM as valid_from, DA_VALID_TO as valid_to, SD_STATUS as status from RHN_SYS_DEPT_CONTACT
                        where ID_TNT = :tenantId and ID_DEPT = :departmentId
                        order by FG_PRIMARY_CONTACT desc, SN_SORT, ID_DEPT_CONTACT
                        """).param("tenantId", tenantId).param("departmentId", departmentId)
                        .query((rs, row) -> new DepartmentProfileView.DepartmentContact(
                                rs.getLong("id"), rs.getString("contact_type"), rs.getString("contact_value"),
                                rs.getString("contact_use"), rs.getBoolean("primary_contact"),
                                rs.getInt("sort_order"), rs.getObject("valid_from", LocalDate.class),
                                rs.getObject("valid_to", LocalDate.class), rs.getString("status"))).list(),
                jdbc.sql("""
                        select r.ID_DEPT_REL as id, r.ID_DEPT_TARGET as target_department_id, d.NA_DEPT target_name, r.SD_REL_TYPE as relation_type,
                               r.FG_PRIMARY_REL as primary_relation, r.DES_DEPT_REL as description, r.DA_VALID_FROM as valid_from, r.DA_VALID_TO as valid_to, r.SD_STATUS as status from RHN_SYS_DEPT_REL r
                        join RHN_SYS_DEPT d on d.ID_TNT = r.ID_TNT and d.ID_DEPT = r.ID_DEPT_TARGET
                        where r.ID_TNT = :tenantId and r.ID_DEPT_SRC = :departmentId
                        order by r.FG_PRIMARY_REL desc, r.SD_REL_TYPE, d.NA_DEPT
                        """).param("tenantId", tenantId).param("departmentId", departmentId)
                        .query((rs, row) -> new DepartmentProfileView.DepartmentRelation(
                                rs.getLong("id"), rs.getLong("target_department_id"),
                                rs.getString("target_name"), rs.getString("relation_type"),
                                rs.getBoolean("primary_relation"), rs.getString("description"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("status"))).list(),
                jdbc.sql("""
                        select ID_DEPT_CAP as id, SD_CAP_TYPE as capability_type, CD_QUALIF_BASIS as qualification_basis_code, SD_CAP_SCOPE as capability_scope,
                               DA_VALID_FROM as valid_from, DA_VALID_TO as valid_to, SD_VERIFY_STATUS as verify_status, SD_STATUS as status from RHN_SYS_DEPT_CAP
                        where ID_TNT = :tenantId and ID_DEPT = :departmentId
                        order by SD_CAP_TYPE, DA_VALID_FROM desc
                        """).param("tenantId", tenantId).param("departmentId", departmentId)
                        .query((rs, row) -> new DepartmentProfileView.DepartmentCapability(
                                rs.getLong("id"), rs.getString("capability_type"),
                                rs.getString("qualification_basis_code"), rs.getString("capability_scope"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("verify_status"), rs.getString("status"))).list(),
                jdbc.sql("""
                        select r.ID_DEPT_RESP as id, r.ID_STAFF_ASSIGN as assignment_id,
                               case when r.ID_STAFF_ASSIGN is null then r.NA_EXT_RSPNSBL else p.NA_FULL end responsible_name,
                               r.SD_RESP_TYPE as responsibility_type, r.FG_PRIMARY_RESP as primary_responsibility, r.DA_VALID_FROM as valid_from, r.DA_VALID_TO as valid_to, r.SD_STATUS as status from RHN_SYS_DEPT_RESP r
                        left join RHN_SYS_STAFF_ASSIGN a on a.ID_TNT = r.ID_TNT and a.ID_STAFF_ASSIGN = r.ID_STAFF_ASSIGN
                        left join RHN_SYS_EMPL e on e.ID_TNT = a.ID_TNT and e.ID_EMPL = a.ID_EMPL
                        left join RHN_SYS_PRACT p on p.ID_TNT = e.ID_TNT and p.ID_PRACT = e.ID_PRACT
                        where r.ID_TNT = :tenantId and r.ID_DEPT = :departmentId
                        order by r.FG_PRIMARY_RESP desc, r.SD_RESP_TYPE, responsible_name
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
                insert into RHN_SYS_DEPT_CONTACT
                    (ID_DEPT_CONTACT, ID_TNT, ID_DEPT, SD_CONTACT_TYPE, CONTACT_VALUE, CONTACT_USE,
                     FG_PRIMARY_CONTACT, SN_SORT, DA_VALID_FROM, DA_VALID_TO, SD_STATUS)
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
                insert into RHN_SYS_DEPT_REL
                    (ID_DEPT_REL, ID_TNT, ID_DEPT_SRC, ID_DEPT_TARGET, SD_REL_TYPE,
                     FG_PRIMARY_REL, DES_DEPT_REL, DA_VALID_FROM, DA_VALID_TO, SD_STATUS)
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
                insert into RHN_SYS_DEPT_CAP
                    (ID_DEPT_CAP, ID_TNT, ID_DEPT, SD_CAP_TYPE, CD_QUALIF_BASIS,
                     SD_CAP_SCOPE, DA_VALID_FROM, DA_VALID_TO, SD_VERIFY_STATUS, SD_STATUS)
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
                insert into RHN_SYS_DEPT_RESP
                    (ID_DEPT_RESP, ID_TNT, ID_DEPT, ID_STAFF_ASSIGN, NA_EXT_RSPNSBL,
                     SD_RESP_TYPE, FG_PRIMARY_RESP, DA_VALID_FROM, DA_VALID_TO, SD_STATUS)
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
