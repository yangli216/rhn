package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OrganizationPersonnelFoundationTest extends RhnIntegrationTestSupport {

    @Test
    void organization_personnel_main_flow_uses_unified_tree_and_effective_assignments() throws Exception {
        String suffix = Long.toString(GlobalIds.next());
        String organizationId = createOrganization(suffix);
        String departmentId = createDepartment(suffix, organizationId);
        addOrganizationProfile(suffix, organizationId);
        addDepartmentProfile(suffix, departmentId);
        String practitionerId = createPractitioner(suffix);
        String positionId = createPosition(suffix);
        String employmentId = createEmployment(suffix, practitionerId, organizationId);

        mockMvc.perform(post("/api/platform/employments")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "practitionerId":"%s",
                                  "organizationId":"%s",
                                  "code":"EMP2_%s",
                                  "sdEmploymentType":"CONTRACT",
                                  "primaryEmployment":true,
                                  "hireDate":"2026-06-01"
                                }
                                """.formatted(practitionerId, organizationId, suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRIMARY_EMPLOYMENT_OVERLAP"));

        mockMvc.perform(post("/api/platform/assignments")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "employmentId":"%s",
                                  "organizationId":"%s",
                                  "departmentId":"%s",
                                  "positionId":"%s",
                                  "code":"ASN_%s",
                                  "sdAssignmentType":"PRIMARY",
                                  "specialtyCode":"GENERAL_MEDICINE",
                                  "primaryAssignment":true,
                                  "workloadPercent":100,
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(employmentId, organizationId, departmentId, positionId, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.organizationId").value(organizationId))
                .andExpect(jsonPath("$.departmentId").value(departmentId))
                .andExpect(jsonPath("$.departmentName").value("全科医学科" + suffix))
                .andExpect(jsonPath("$.sdAssignmentType").value("PRIMARY"))
                .andExpect(jsonPath("$.sdAssignmentTypeText").value("主任职"));

        mockMvc.perform(post("/api/platform/assignments")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "employmentId":"%s",
                                  "organizationId":"%s",
                                  "departmentId":"%s",
                                  "positionId":"%s",
                                  "code":"ASN2_%s",
                                  "sdAssignmentType":"PRIMARY",
                                  "primaryAssignment":true,
                                  "validFrom":"2026-07-01"
                                }
                                """.formatted(employmentId, organizationId, departmentId, positionId, suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRIMARY_ASSIGNMENT_OVERLAP"));

        mockMvc.perform(get("/api/platform/practitioners/{id}", practitionerId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.practitioner.fullName").value("测试医生" + suffix))
                .andExpect(jsonPath("$.practitioner.sdPractGenderText").value("男"))
                .andExpect(jsonPath("$.employments[0].organizationId").value(organizationId))
                .andExpect(jsonPath("$.employments[0].sdEmploymentTypeText").value("正式聘用"))
                .andExpect(jsonPath("$.assignments[0].organizationId").value(organizationId))
                .andExpect(jsonPath("$.assignments[0].departmentId").value(departmentId))
                .andExpect(jsonPath("$.assignments[0].positionName").value("全科医生" + suffix));

        mockMvc.perform(get("/api/platform/departments")
                        .with(rhn())
                        .queryParam("organizationId", organizationId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '%s')].name".formatted(departmentId))
                        .value("全科医学科" + suffix));

        mockMvc.perform(get("/api/platform/organization-units/{id}", organizationId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.organization.shortName").value("规范机构" + suffix))
                .andExpect(jsonPath("$.organization.sdOrgPropertyText").value("公立非营利"))
                .andExpect(jsonPath("$.identifiers[0].sdIdentifierTypeText").value("医疗机构执业许可证号"))
                .andExpect(jsonPath("$.contacts[0].sdContactTypeText").value("固定电话"))
                .andExpect(jsonPath("$.addresses[0].sdAddressTypeText").value("执业地址"))
                .andExpect(jsonPath("$.capabilities[0].sdCapabilityTypeText").value("门诊"))
                .andExpect(jsonPath("$.responsibilities[0].responsibleName").value("测试法定代表人" + suffix));

        mockMvc.perform(get("/api/platform/departments/{id}", departmentId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.department.organizationId").value(organizationId))
                .andExpect(jsonPath("$.department.sdDepartmentTypeText").value("全科医疗科"))
                .andExpect(jsonPath("$.contacts[0].sdContactTypeText").value("固定电话"))
                .andExpect(jsonPath("$.capabilities[0].sdCapabilityTypeText").value("门诊"))
                .andExpect(jsonPath("$.responsibilities[0].sdResponsibilityTypeText").value("科主任"));
    }

    private String createOrganization(String suffix) throws Exception {
        String response = mockMvc.perform(post("/api/platform/organization-units")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"ORG_%s",
                                  "name":"新规范医疗机构%s",
                                  "shortName":"规范机构%s",
                                  "description":"用于验证扩展组织档案",
                                  "sdOrgKind":"LEGAL_ORGANIZATION",
                                  "sdOrgType":"HOSPITAL",
                                  "sdOrgProperty":"PUBLIC_NON_PROFIT",
                                  "virtual":false,
                                  "sortOrder":0,
                                  "timezoneCode":"Asia/Shanghai",
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(suffix, suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sdOrgKindText").value("法定机构"))
                .andExpect(jsonPath("$.sdOrgTypeText").value("医院"))
                .andReturn().getResponse().getContentAsString();
        return json(response).get("id").asText();
    }

    private String createDepartment(String suffix, String organizationId) throws Exception {
        String response = mockMvc.perform(post("/api/platform/organization-units")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "parentId":"%s",
                                  "code":"DEPT_%s",
                                  "name":"全科医学科%s",
                                  "shortName":"全科%s",
                                  "sdOrgKind":"ORG_UNIT",
                                  "sdOrgType":"CLINICAL_DEPARTMENT",
                                  "sdDepartmentType":"02",
                                  "virtual":false,
                                  "sortOrder":10,
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(organizationId, suffix, suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.parentId").value(organizationId))
                .andExpect(jsonPath("$.sdOrgKind").value("ORG_UNIT"))
                .andExpect(jsonPath("$.sdDepartmentTypeText").value("全科医疗科"))
                .andExpect(jsonPath("$.sdOrgStatusText").value("已启用"))
                .andReturn().getResponse().getContentAsString();
        return json(response).get("id").asText();
    }

    private void addOrganizationProfile(String suffix, String organizationId) throws Exception {
        mockMvc.perform(post("/api/platform/organization-units/{id}/identifiers", organizationId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "identifierSystem":"urn:nhc:medical-institution-license",
                                  "identifierCode":"LICENSE-%s",
                                  "sdIdentifierType":"MEDICAL_INSTITUTION_LICENSE",
                                  "primaryIdentifier":true,
                                  "validFrom":"2026-01-01",
                                  "sdVerifyStatus":"VERIFIED"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.identifiers[0].sdVerifyStatusText").value("已核验"));

        mockMvc.perform(post("/api/platform/organization-units/{id}/contacts", organizationId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sdContactType":"PHONE",
                                  "contactValue":"0571-%s",
                                  "sdContactUse":"PUBLIC",
                                  "primaryContact":true,
                                  "sortOrder":10,
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(suffix.substring(Math.max(0, suffix.length() - 8)))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.contacts[0].sdContactUseText").value("公众服务"));

        mockMvc.perform(post("/api/platform/organization-units/{id}/addresses", organizationId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sdAddressType":"PRACTICE",
                                  "countryCode":"CN",
                                  "provinceCode":"330000",
                                  "cityCode":"330100",
                                  "districtCode":"330110",
                                  "streetAddress":"测试健康路1号",
                                  "postalCode":"310000",
                                  "validFrom":"2026-01-01"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.addresses[0].cityCode").value("330100"));

        mockMvc.perform(post("/api/platform/organization-units/{id}/capabilities", organizationId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sdCapabilityType":"OUTPATIENT",
                                  "qualificationBasisCode":"LICENSE-%s",
                                  "capabilityScope":"综合门诊服务",
                                  "validFrom":"2026-01-01",
                                  "sdVerifyStatus":"VERIFIED"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.capabilities[0].sdVerifyStatusText").value("已核验"));

        mockMvc.perform(post("/api/platform/organization-units/{id}/responsibilities", organizationId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "externalResponsibleName":"测试法定代表人%s",
                                  "sdResponsibilityType":"LEGAL_REPRESENTATIVE",
                                  "primaryResponsibility":true,
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.responsibilities[0].sdResponsibilityTypeText").value("法定代表人"));
    }

    private void addDepartmentProfile(String suffix, String departmentId) throws Exception {
        mockMvc.perform(post("/api/platform/departments/{id}/contacts", departmentId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sdContactType":"PHONE",
                                  "contactValue":"0571-8%s",
                                  "sdContactUse":"BUSINESS",
                                  "primaryContact":true,
                                  "sortOrder":10,
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(suffix.substring(Math.max(0, suffix.length() - 7)))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/platform/departments/{id}/capabilities", departmentId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sdCapabilityType":"OUTPATIENT",
                                  "capabilityScope":"全科门诊",
                                  "validFrom":"2026-01-01",
                                  "sdVerifyStatus":"VERIFIED"
                                }
                                """))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/platform/departments/{id}/responsibilities", departmentId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "externalResponsibleName":"测试科主任%s",
                                  "sdResponsibilityType":"DIRECTOR",
                                  "primaryResponsibility":true,
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated());
    }

    private String createPractitioner(String suffix) throws Exception {
        String response = mockMvc.perform(post("/api/platform/practitioners")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"PRACT_%s",
                                  "fullName":"测试医生%s",
                                  "sdPractGender":"MALE"
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sdPersonnelStatusText").value("已启用"))
                .andReturn().getResponse().getContentAsString();
        return json(response).get("id").asText();
    }

    private String createPosition(String suffix) throws Exception {
        String response = mockMvc.perform(post("/api/platform/positions")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"POS_%s",
                                  "name":"全科医生%s",
                                  "sdPositionType":"CLINICAL",
                                  "dutyDescription":"承担全科门诊诊疗"
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sdPositionTypeText").value("临床"))
                .andReturn().getResponse().getContentAsString();
        return json(response).get("id").asText();
    }

    private String createEmployment(String suffix, String practitionerId, String organizationId) throws Exception {
        String response = mockMvc.perform(post("/api/platform/employments")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "practitionerId":"%s",
                                  "organizationId":"%s",
                                  "code":"EMP_%s",
                                  "sdEmploymentType":"PERMANENT",
                                  "primaryEmployment":true,
                                  "hireDate":"2026-01-01"
                                }
                                """.formatted(practitionerId, organizationId, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json(response).get("id").asText();
    }
}
