package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PersonnelManagementTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test void registers_and_revises_qualification_with_prescribing_rules() throws Exception {
        String id = onboard("QUALIF");
        mockMvc.perform(get("/api/platform/practitioners/{id}/qualification", id).with(rhn()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.registered").value(false)).andExpect(jsonPath("$.revision").isEmpty());

        var command = qualification(null);
        JsonNode saved = json(mockMvc.perform(put("/api/platform/practitioners/{id}/qualification", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(command)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(saved.path("registered").asBoolean()).isTrue();
        assertThat(saved.path("sdProfessionalTitleText").asString()).isEqualTo("主治医师");
        assertThat(saved.path("sdAntimicrobialLevelText").asString()).isEqualTo("限制使用级");
        long revision = saved.path("revision").asLong();

        mockMvc.perform(put("/api/platform/practitioners/{id}/qualification", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(command)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("QUALIFICATION_REVISION_CONFLICT"));
        mockMvc.perform(put("/api/platform/practitioners/{id}/qualification", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(qualification(revision + 5))))
                .andExpect(status().isConflict());

        var withoutRx = qualification(revision); withoutRx.put("prescribing", false);
        mockMvc.perform(put("/api/platform/practitioners/{id}/qualification", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(withoutRx)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PRESCRIBING_RIGHT_REQUIRED"));
        var invalidTitle = qualification(revision); invalidTitle.put("sdProfessionalTitle", "NOT_A_TITLE");
        mockMvc.perform(put("/api/platform/practitioners/{id}/qualification", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(invalidTitle)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DICTIONARY_ITEM_INVALID"));

        var revoke = qualification(revision);
        revoke.put("prescribing", false); revoke.put("narcoticPrescribing", false); revoke.put("sdAntimicrobialLevel", null);
        mockMvc.perform(put("/api/platform/practitioners/{id}/qualification", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(revoke)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.prescribing").value(false))
                .andExpect(jsonPath("$.revision").value(revision + 1));
        mockMvc.perform(get("/api/platform/practitioners/{id}/changes", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].action").value("UPDATE_QUALIFICATION"));
        mockMvc.perform(put("/api/platform/practitioners/{id}/qualification", "999999999999999999").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(qualification(null))))
                .andExpect(status().isNotFound());
    }

    @Test void lists_personnel_with_current_assignment_and_qualification_filters() throws Exception {
        String id = onboard("LIST");
        String code = jdbc.queryForObject("SELECT CD_PRACT FROM RHN_SYS_PRACT WHERE ID_PRACT = ?", String.class, Long.valueOf(id));
        mockMvc.perform(get("/api/platform/personnel").param("keyword", code.toLowerCase()).with(rhn()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].practitionerId").value(id))
                .andExpect(jsonPath("$.content[0].primaryAssignment.departmentId").value(DEPARTMENT))
                .andExpect(jsonPath("$.content[0].currentAssignmentCount").value(1))
                .andExpect(jsonPath("$.content[0].qualificationRegistered").value(false));
        mockMvc.perform(get("/api/platform/personnel").param("keyword", code).param("prescribing", "UNREGISTERED").with(rhn()))
                .andExpect(jsonPath("$.totalElements").value(1));
        mockMvc.perform(get("/api/platform/personnel").param("keyword", code).param("prescribing", "PRESCRIBING").with(rhn()))
                .andExpect(jsonPath("$.totalElements").value(0));

        mockMvc.perform(put("/api/platform/practitioners/{id}/qualification", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(qualification(null))))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/platform/personnel").param("keyword", code).param("prescribing", "ANTIMICROBIAL")
                        .param("professionalTitle", "ATTENDING_PHYSICIAN").param("departmentId", DEPARTMENT)
                        .param("organizationId", ORGANIZATION).param("status", "ACTIVE").with(rhn()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].sdProfessionalTitleText").value("主治医师"));
        mockMvc.perform(get("/api/platform/personnel").param("keyword", code).param("departmentId", "999999999999999999").with(rhn()))
                .andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/api/platform/personnel").param("size", "0").with(rhn())).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/platform/personnel").param("size", "1").param("page", "0").with(rhn()))
                .andExpect(jsonPath("$.content.length()").value(1)).andExpect(jsonPath("$.first").value(true));
    }

    @Test void assigns_within_an_existing_employment_and_creates_one_for_a_new_organization() throws Exception {
        String id = onboard("ASSIGN");
        Long otherDepartment = jdbc.queryForObject("SELECT MIN(ID_DEPT) FROM RHN_SYS_DEPT WHERE ID_ORG = ? AND ID_DEPT <> ? AND SD_STATUS = 'ACTIVE'",
                Long.class, Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT));
        int employments = employmentCount(id);
        mockMvc.perform(post("/api/platform/practitioners/{id}/assignments", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(assignment(ORGANIZATION,
                                otherDepartment.toString(), "2026-10-10"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.departmentId").value(otherDepartment.toString()))
                .andExpect(jsonPath("$.primaryAssignment").value(false));
        assertThat(employmentCount(id)).isEqualTo(employments);

        mockMvc.perform(post("/api/platform/practitioners/{id}/assignments", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(assignment(ORGANIZATION,
                                otherDepartment.toString(), "2026-09-01"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ASSIGNMENT_PERIOD_OUTSIDE_EMPLOYMENT"));

        String organization = createOrganization();
        String department = createDepartment(organization);
        mockMvc.perform(post("/api/platform/practitioners/{id}/assignments", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(assignment(organization, department, "2026-10-10"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.organizationId").value(organization));
        assertThat(employmentCount(id)).isEqualTo(employments + 1);
        assertThat(jdbc.queryForObject("SELECT FG_PRIMARY_EMPL FROM RHN_SYS_EMPL WHERE ID_PRACT = ? AND ID_ORG = ?", Boolean.class,
                Long.valueOf(id), Long.valueOf(organization))).isFalse();
        mockMvc.perform(get("/api/platform/practitioners/{id}/changes", id).with(rhnWorkContext()))
                .andExpect(jsonPath("$[0].action").value("ASSIGN_PRACTITIONER"));
    }

    @Test void publishes_the_personnel_contracts() throws Exception {
        JsonNode document = json(mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(document.path("paths").path("/api/platform/personnel").has("get")).isTrue();
        assertThat(document.path("paths").path("/api/platform/practitioners/{id}/qualification").has("put")).isTrue();
        assertThat(document.path("paths").path("/api/platform/practitioners/{id}/assignments").has("post")).isTrue();
    }

    private String onboard(String prefix) throws Exception {
        var input = new LinkedHashMap<String, Object>();
        input.put("code", prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase());
        input.put("fullName", "人员管理测试"); input.put("sdPractGender", "0");
        input.put("organizationId", ORGANIZATION); input.put("departmentId", DEPARTMENT);
        input.put("positionId", position());
        input.put("hireDate", "2026-10-03");
        return json(mockMvc.perform(post("/api/platform/practitioners/onboarding").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("practitioner").path("id").asString();
    }

    private Map<String, Object> qualification(Long expectedRevision) {
        var command = new LinkedHashMap<String, Object>();
        command.put("expectedRevision", expectedRevision);
        command.put("sdProfessionalTitle", "ATTENDING_PHYSICIAN"); command.put("sdPracticeCategory", "CLINICAL");
        command.put("practiceCertificateCode", " 110000000001 "); command.put("insurancePractitionerCode", "D110000000001");
        command.put("prescribing", true); command.put("narcoticPrescribing", true); command.put("sdAntimicrobialLevel", "RESTRICTED");
        return command;
    }

    private Map<String, Object> assignment(String organization, String department, String validFrom) {
        var input = new LinkedHashMap<String, Object>();
        input.put("organizationId", organization); input.put("departmentId", department); input.put("positionId", position());
        input.put("primaryAssignment", false); input.put("validFrom", validFrom);
        return input;
    }

    private String createOrganization() throws Exception {
        var input = new LinkedHashMap<String, Object>();
        input.put("code", "ORG_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase());
        input.put("name", "人员管理测试机构"); input.put("sdOrgKind", "LEGAL_ORGANIZATION"); input.put("sdOrgType", "CLINIC");
        input.put("timezoneCode", "Asia/Shanghai"); input.put("validFrom", "2026-01-01");
        return json(mockMvc.perform(post("/api/platform/organization-units").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
    }

    private String createDepartment(String organization) throws Exception {
        Map<String, Object> seed = jdbc.queryForMap("SELECT SD_DEPT_TYPE, SD_DEPT_PROP FROM RHN_SYS_DEPT WHERE ID_DEPT = ?", Long.valueOf(DEPARTMENT));
        var input = new LinkedHashMap<String, Object>();
        input.put("organizationId", organization); input.put("parentId", organization);
        input.put("code", "DEPT_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase());
        input.put("name", "人员管理测试科室"); input.put("sdOrgKind", "ORG_UNIT"); input.put("sdOrgType", "CLINICAL_DEPARTMENT");
        input.put("sdDepartmentType", seed.get("SD_DEPT_TYPE")); input.put("sdDepartmentProperty", seed.get("SD_DEPT_PROP"));
        input.put("validFrom", "2026-01-01");
        return json(mockMvc.perform(post("/api/platform/organization-units").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
    }

    private String position() {
        return jdbc.queryForObject("SELECT MIN(ID_POS) FROM RHN_SYS_POS WHERE ID_TNT = ? AND SD_STATUS = 'ACTIVE'", Long.class, Long.valueOf(TENANT)).toString();
    }

    private int employmentCount(String practitionerId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM RHN_SYS_EMPL WHERE ID_PRACT = ?", Integer.class, Long.valueOf(practitionerId));
    }
}
