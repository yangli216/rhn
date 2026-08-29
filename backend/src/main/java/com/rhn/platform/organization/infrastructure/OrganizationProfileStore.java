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
                        select id, identifier_system, identifier_code, identifier_type,
                               issuer_organization_id, primary_identifier, valid_from, valid_to,
                               verify_status, verified_at, verified_by, status
                        from organization_identifiers
                        where tenant_id = :tenantId and organization_id = :organizationId
                        order by primary_identifier desc, identifier_type, identifier_code
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
                        select id, contact_type, contact_value, contact_use, primary_contact,
                               sort_order, valid_from, valid_to, status
                        from organization_contacts
                        where tenant_id = :tenantId and organization_id = :organizationId
                        order by primary_contact desc, sort_order, id
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Contact(
                                rs.getLong("id"), rs.getString("contact_type"), rs.getString("contact_value"),
                                rs.getString("contact_use"), rs.getBoolean("primary_contact"),
                                rs.getInt("sort_order"), rs.getObject("valid_from", LocalDate.class),
                                rs.getObject("valid_to", LocalDate.class), rs.getString("status"))).list(),
                jdbc.sql("""
                        select id, address_type, country_code, province_code, city_code, district_code,
                               street_address, postal_code, valid_from, valid_to, status
                        from organization_addresses
                        where tenant_id = :tenantId and organization_id = :organizationId
                        order by address_type, valid_from desc
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Address(
                                rs.getLong("id"), rs.getString("address_type"), rs.getString("country_code"),
                                rs.getString("province_code"), rs.getString("city_code"),
                                rs.getString("district_code"), rs.getString("street_address"),
                                rs.getString("postal_code"), rs.getObject("valid_from", LocalDate.class),
                                rs.getObject("valid_to", LocalDate.class), rs.getString("status"))).list(),
                jdbc.sql("""
                        select r.id, r.target_organization_id, o.name target_name, r.relation_type,
                               r.primary_relation, r.description, r.valid_from, r.valid_to, r.status
                        from organization_relations r
                        join organizations o on o.tenant_id = r.tenant_id and o.id = r.target_organization_id
                        where r.tenant_id = :tenantId and r.source_organization_id = :organizationId
                        order by r.primary_relation desc, r.relation_type, o.name
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Relation(
                                rs.getLong("id"), rs.getLong("target_organization_id"),
                                rs.getString("target_name"), rs.getString("relation_type"),
                                rs.getBoolean("primary_relation"), rs.getString("description"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("status"))).list(),
                jdbc.sql("""
                        select id, capability_type, qualification_basis_code, capability_scope,
                               valid_from, valid_to, verify_status, status
                        from organization_capabilities
                        where tenant_id = :tenantId and organization_id = :organizationId
                        order by capability_type, valid_from desc
                        """).param("tenantId", tenantId).param("organizationId", organizationId)
                        .query((rs, row) -> new OrganizationProfileView.Capability(
                                rs.getLong("id"), rs.getString("capability_type"),
                                rs.getString("qualification_basis_code"), rs.getString("capability_scope"),
                                rs.getObject("valid_from", LocalDate.class), rs.getObject("valid_to", LocalDate.class),
                                rs.getString("verify_status"), rs.getString("status"))).list(),
                jdbc.sql("""
                        select r.id, r.assignment_id,
                               case when r.assignment_id is null then r.external_responsible_name else p.full_name end responsible_name,
                               r.responsibility_type, r.primary_responsibility, r.valid_from, r.valid_to, r.status
                        from organization_responsibilities r
                        left join staff_assignments a on a.tenant_id = r.tenant_id and a.id = r.assignment_id
                        left join employments e on e.tenant_id = a.tenant_id and e.id = a.employment_id
                        left join practitioners p on p.tenant_id = e.tenant_id and p.id = e.practitioner_id
                        where r.tenant_id = :tenantId and r.organization_id = :organizationId
                        order by r.primary_responsibility desc, r.responsibility_type, responsible_name
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
                insert into organization_identifiers
                    (id, tenant_id, organization_id, identifier_system, identifier_code, identifier_type,
                     issuer_organization_id, primary_identifier, valid_from, valid_to, verify_status,
                     verified_at, verified_by, status)
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
                insert into organization_contacts
                    (id, tenant_id, organization_id, contact_type, contact_value, contact_use,
                     primary_contact, sort_order, valid_from, valid_to, status)
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
                insert into organization_addresses
                    (id, tenant_id, organization_id, address_type, country_code, province_code,
                     city_code, district_code, street_address, postal_code, valid_from, valid_to, status)
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
                insert into organization_relations
                    (id, tenant_id, source_organization_id, target_organization_id, relation_type,
                     primary_relation, description, valid_from, valid_to, status)
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
                insert into organization_capabilities
                    (id, tenant_id, organization_id, capability_type, qualification_basis_code,
                     capability_scope, valid_from, valid_to, verify_status, status)
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
                insert into organization_responsibilities
                    (id, tenant_id, organization_id, assignment_id, external_responsible_name,
                     responsibility_type, primary_responsibility, valid_from, valid_to, status)
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
