package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.api.OrganizationProfileView;
import com.rhn.platform.organization.domain.Organization;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;

@Repository
public class OrganizationProfileStore {
    private static final String ACTIVE = "ACTIVE";
    private final JdbcClient jdbc;

    public OrganizationProfileStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public OrganizationProfileView load(Organization organization) {
        Long tenantId = organization.tenantId();
        Long organizationId = organization.id();
        return new OrganizationProfileView(organization.toView(),
                jdbc.sql("""
                        select ID_ORG_IDENT as id, CD_IDENT_SYS as identifier_system, CD_IDENT as identifier_code, SD_IDENT_TYPE as identifier_type,
                               ID_ORG_ISSUER as issuer_organization_id, FG_PRIMARY_IDENT as primary_identifier, DA_VALID_FROM as valid_from, DA_VALID_TO as valid_to,
                               SD_VERIFY_STATUS as verify_status, DT_VRFD as verified_at, ID_USER_VRFD as verified_by, SD_STATUS as status from RHN_SYS_ORG_IDENT
                        where ID_TNT = :tenantId and ID_ORG = :organizationId
                        order by FG_PRIMARY_IDENT desc, SD_IDENT_TYPE, CD_IDENT
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Identifier(
                                rs.getLong("id"), rs.getString("identifier_system"),
                                rs.getString("identifier_code"), rs.getString("identifier_type"),
                                nullableLong(rs, "issuer_organization_id"), rs.getBoolean("primary_identifier"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("verify_status"), rs.getTimestamp("verified_at") == null ? null
                                        : rs.getTimestamp("verified_at").toInstant(),
                                nullableLong(rs, "verified_by"), rs.getString("status"))).list(),
                jdbc.sql("""
                        select ID_ORG_CONTACT as id, SD_CONTACT_TYPE as contact_type, CONTACT_VALUE, CONTACT_USE, FG_PRIMARY_CONTACT as primary_contact,
                               SN_SORT as sort_order, DA_VALID_FROM as valid_from, DA_VALID_TO as valid_to, SD_STATUS as status from RHN_SYS_ORG_CONTACT
                        where ID_TNT = :tenantId and ID_ORG = :organizationId
                        order by FG_PRIMARY_CONTACT desc, SN_SORT, ID_ORG_CONTACT
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Contact(
                                rs.getLong("id"), rs.getString("contact_type"), rs.getString("contact_value"),
                                rs.getString("contact_use"), rs.getBoolean("primary_contact"),
                                rs.getInt("sort_order"), rs.getObject("valid_from", LocalDate.class),
                                rs.getObject("valid_to", LocalDate.class), rs.getString("status"))).list(),
                jdbc.sql("""
                        select ID_ORG_ADDR as id, SD_ADDR_TYPE as address_type, CD_COUNTRY as country_code, CD_PROV as province_code, CD_CITY as city_code, CD_DIST as district_code,
                               DES_STREET_ADDR as street_address, CD_POSTAL as postal_code, DA_VALID_FROM as valid_from, DA_VALID_TO as valid_to, SD_STATUS as status from RHN_SYS_ORG_ADDR
                        where ID_TNT = :tenantId and ID_ORG = :organizationId
                        order by SD_ADDR_TYPE, DA_VALID_FROM desc
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Address(
                                rs.getLong("id"), rs.getString("address_type"), rs.getString("country_code"),
                                rs.getString("province_code"), rs.getString("city_code"),
                                rs.getString("district_code"), rs.getString("street_address"),
                                rs.getString("postal_code"), rs.getObject("valid_from", LocalDate.class),
                                rs.getObject("valid_to", LocalDate.class), rs.getString("status"))).list(),
                jdbc.sql("""
                        select r.ID_ORG_REL as id, r.ID_ORG_TARGET as target_organization_id, o.NA_ORG target_name, r.SD_REL_TYPE as relation_type,
                               r.FG_PRIMARY_REL as primary_relation, r.DES_ORG_REL as description, r.DA_VALID_FROM as valid_from, r.DA_VALID_TO as valid_to, r.SD_STATUS as status from RHN_SYS_ORG_REL r
                        join RHN_SYS_ORG o on o.ID_TNT = r.ID_TNT and o.ID_ORG = r.ID_ORG_TARGET
                        where r.ID_TNT = :tenantId and r.ID_ORG_SRC = :organizationId
                        order by r.FG_PRIMARY_REL desc, r.SD_REL_TYPE, o.NA_ORG
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Relation(
                                rs.getLong("id"), rs.getLong("target_organization_id"),
                                rs.getString("target_name"), rs.getString("relation_type"),
                                rs.getBoolean("primary_relation"), rs.getString("description"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("status"))).list(),
                jdbc.sql("""
                        select ID_ORG_CAP as id, SD_CAP_TYPE as capability_type, CD_QUALIF_BASIS as qualification_basis_code, SD_CAP_SCOPE as capability_scope,
                               DA_VALID_FROM as valid_from, DA_VALID_TO as valid_to, SD_VERIFY_STATUS as verify_status, SD_STATUS as status from RHN_SYS_ORG_CAP
                        where ID_TNT = :tenantId and ID_ORG = :organizationId
                        order by SD_CAP_TYPE, DA_VALID_FROM desc
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Capability(
                                rs.getLong("id"), rs.getString("capability_type"),
                                rs.getString("qualification_basis_code"), rs.getString("capability_scope"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("verify_status"), rs.getString("status"))).list(),
                jdbc.sql("""
                        select r.ID_ORG_RESP as id, r.ID_STAFF_ASSIGN as assignment_id,
                               case when r.ID_STAFF_ASSIGN is null then r.NA_EXT_RSPNSBL else p.NA_FULL end responsible_name,
                               r.SD_RESP_TYPE as responsibility_type, r.FG_PRIMARY_RESP as primary_responsibility, r.DA_VALID_FROM as valid_from, r.DA_VALID_TO as valid_to, r.SD_STATUS as status from RHN_SYS_ORG_RESP r
                        left join RHN_SYS_STAFF_ASSIGN a on a.ID_TNT = r.ID_TNT and a.ID_STAFF_ASSIGN = r.ID_STAFF_ASSIGN
                        left join RHN_SYS_EMPL e on e.ID_TNT = a.ID_TNT and e.ID_EMPL = a.ID_EMPL
                        left join RHN_SYS_PRACT p on p.ID_TNT = e.ID_TNT and p.ID_PRACT = e.ID_PRACT
                        where r.ID_TNT = :tenantId and r.ID_ORG = :organizationId
                        order by r.FG_PRIMARY_RESP desc, r.SD_RESP_TYPE, responsible_name
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Responsibility(
                                rs.getLong("id"), nullableLong(rs, "assignment_id"),
                                rs.getString("responsible_name"), rs.getString("responsibility_type"),
                                rs.getBoolean("primary_responsibility"), rs.getObject("valid_from", LocalDate.class),
                                rs.getObject("valid_to", LocalDate.class), rs.getString("status"))).list());
    }

    public void addIdentifier(Long tenantId, Long organizationId, String system, String code, String type,
                              Long issuerId, boolean primary, LocalDate from, LocalDate to, String verifyStatus) {
        jdbc.sql("""
                insert into RHN_SYS_ORG_IDENT
                    (ID_ORG_IDENT, ID_TNT, ID_ORG, CD_IDENT_SYS, CD_IDENT, SD_IDENT_TYPE,
                     ID_ORG_ISSUER, FG_PRIMARY_IDENT, DA_VALID_FROM, DA_VALID_TO, SD_VERIFY_STATUS,
                     DT_VRFD, ID_USER_VRFD, SD_STATUS)
                values (:id, :tenantId, :organizationId, :system, :code, :type,
                        :issuerId, :primary, :validFrom, :validTo, :verifyStatus, null, null, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId)
                .param("organizationId", organizationId).param("system", system).param("code", code)
                .param("type", type).param("issuerId", issuerId).param("primary", primary)
                .param("validFrom", from).param("validTo", to).param("verifyStatus", verifyStatus)
                .param("status", ACTIVE).update();
    }

    public void addContact(Long tenantId, Long organizationId, String type, String value, String use,
                           boolean primary, int sortOrder, LocalDate from, LocalDate to) {
        jdbc.sql("""
                insert into RHN_SYS_ORG_CONTACT
                    (ID_ORG_CONTACT, ID_TNT, ID_ORG, SD_CONTACT_TYPE, CONTACT_VALUE, CONTACT_USE,
                     FG_PRIMARY_CONTACT, SN_SORT, DA_VALID_FROM, DA_VALID_TO, SD_STATUS)
                values (:id, :tenantId, :organizationId, :type, :value, :use,
                        :primary, :sortOrder, :validFrom, :validTo, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId)
                .param("organizationId", organizationId).param("type", type).param("value", value)
                .param("use", use).param("primary", primary).param("sortOrder", sortOrder)
                .param("validFrom", from).param("validTo", to).param("status", ACTIVE).update();
    }

    public void addAddress(Long tenantId, Long organizationId, String type, String country,
                           String province, String city, String district, String street, String postal,
                           LocalDate from, LocalDate to) {
        jdbc.sql("""
                insert into RHN_SYS_ORG_ADDR
                    (ID_ORG_ADDR, ID_TNT, ID_ORG, SD_ADDR_TYPE, CD_COUNTRY, CD_PROV,
                     CD_CITY, CD_DIST, DES_STREET_ADDR, CD_POSTAL, DA_VALID_FROM, DA_VALID_TO, SD_STATUS)
                values (:id, :tenantId, :organizationId, :type, :country, :province,
                        :city, :district, :street, :postal, :validFrom, :validTo, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId)
                .param("organizationId", organizationId).param("type", type).param("country", country)
                .param("province", province).param("city", city).param("district", district)
                .param("street", street).param("postal", postal).param("validFrom", from)
                .param("validTo", to).param("status", ACTIVE).update();
    }

    public void addRelation(Long tenantId, Long sourceId, Long targetId, String type, boolean primary,
                            String description, LocalDate from, LocalDate to) {
        jdbc.sql("""
                insert into RHN_SYS_ORG_REL
                    (ID_ORG_REL, ID_TNT, ID_ORG_SRC, ID_ORG_TARGET, SD_REL_TYPE,
                     FG_PRIMARY_REL, DES_ORG_REL, DA_VALID_FROM, DA_VALID_TO, SD_STATUS)
                values (:id, :tenantId, :sourceId, :targetId, :type,
                        :primary, :description, :validFrom, :validTo, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId).param("sourceId", sourceId)
                .param("targetId", targetId).param("type", type).param("primary", primary)
                .param("description", description).param("validFrom", from).param("validTo", to)
                .param("status", ACTIVE).update();
    }

    public void addCapability(Long tenantId, Long organizationId, String type, String qualification,
                              String scope, LocalDate from, LocalDate to, String verifyStatus) {
        jdbc.sql("""
                insert into RHN_SYS_ORG_CAP
                    (ID_ORG_CAP, ID_TNT, ID_ORG, SD_CAP_TYPE, CD_QUALIF_BASIS,
                     SD_CAP_SCOPE, DA_VALID_FROM, DA_VALID_TO, SD_VERIFY_STATUS, SD_STATUS)
                values (:id, :tenantId, :organizationId, :type, :qualification,
                        :scope, :validFrom, :validTo, :verifyStatus, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId)
                .param("organizationId", organizationId).param("type", type)
                .param("qualification", qualification).param("scope", scope).param("validFrom", from)
                .param("validTo", to).param("verifyStatus", verifyStatus).param("status", ACTIVE).update();
    }

    public void addResponsibility(Long tenantId, Long organizationId, Long assignmentId, String externalName,
                                  String type, boolean primary, LocalDate from, LocalDate to) {
        jdbc.sql("""
                insert into RHN_SYS_ORG_RESP
                    (ID_ORG_RESP, ID_TNT, ID_ORG, ID_STAFF_ASSIGN, NA_EXT_RSPNSBL,
                     SD_RESP_TYPE, FG_PRIMARY_RESP, DA_VALID_FROM, DA_VALID_TO, SD_STATUS)
                values (:id, :tenantId, :organizationId, :assignmentId, :externalName,
                        :type, :primary, :validFrom, :validTo, :status)
                """).param("id", GlobalIds.next()).param("tenantId", tenantId)
                .param("organizationId", organizationId).param("assignmentId", assignmentId)
                .param("externalName", externalName).param("type", type).param("primary", primary)
                .param("validFrom", from).param("validTo", to).param("status", ACTIVE).update();
    }

    private static Long nullableLong(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        long value = resultSet.getLong(column);
        return resultSet.wasNull() ? null : value;
    }
}
