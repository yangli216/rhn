package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PractitionerOnboardingTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test void creates_all_three_records_and_returns_their_actual_links() throws Exception {
        var input = input();
        input.put("code", "P" + "X".repeat(63));
        List<Integer> before = counts();
        JsonNode saved = json(mockMvc.perform(post("/api/platform/practitioners/onboarding").with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String practitionerId = saved.path("practitioner").path("id").asString();
        JsonNode employment = saved.path("employments").get(0), assignment = saved.path("assignments").get(0);
        assertThat(saved.path("practitioner").path("code").asString()).isEqualTo(input.get("code"));
        assertThat(saved.path("employments").size()).isEqualTo(1);
        assertThat(saved.path("assignments").size()).isEqualTo(1);
        assertThat(employment.path("practitionerId").asString()).isEqualTo(practitionerId);
        assertThat(assignment.path("employmentId").asString()).isEqualTo(employment.path("id").asString());
        assertThat(assignment.path("practitionerId").asString()).isEqualTo(practitionerId);
        assertThat(assignment.path("departmentId").asString()).isEqualTo(DEPARTMENT);
        assertThat(assignment.path("workloadPercent").asInt()).isEqualTo(100);
        assertThat(employment.path("code").asString()).isEqualTo("EMP_" + practitionerId);
        assertThat(assignment.path("code").asString()).isEqualTo("ASN_" + practitionerId);
        assertThat(counts()).containsExactly(before.get(0) + 1, before.get(1) + 1, before.get(2) + 1);
        mockMvc.perform(get("/api/platform/practitioners/{id}", practitionerId).with(rhn()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.employments.length()").value(1))
                .andExpect(jsonPath("$.assignments.length()").value(1));
        mockMvc.perform(post("/api/platform/practitioners/onboarding").with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRACTITIONER_CODE_DUPLICATE"));
        assertThat(counts()).containsExactly(before.get(0) + 1, before.get(1) + 1, before.get(2) + 1);
    }

    @Test void rolls_back_practitioner_and_employment_when_any_relationship_stage_fails() throws Exception {
        for (String field : List.of("organizationId", "departmentId", "positionId")) {
            var input = input(); input.put(field, "999999999999999999");
            List<Integer> before = counts();
            mockMvc.perform(post("/api/platform/practitioners/onboarding").with(rhn())
                    .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                    .andExpect(status().isNotFound());
            assertThat(counts()).isEqualTo(before);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM RHN_SYS_PRACT WHERE CD_PRACT = ?", Integer.class, input.get("code"))).isZero();
        }
    }

    @Test void refuses_incomplete_or_unauthenticated_onboarding_without_creating_a_standalone_person() throws Exception {
        for (String field : List.of("organizationId", "departmentId", "positionId", "hireDate")) {
            var input = input(); input.remove(field);
            List<Integer> before = counts();
            mockMvc.perform(post("/api/platform/practitioners/onboarding").with(rhn())
                    .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                    .andExpect(status().isBadRequest());
            assertThat(counts()).isEqualTo(before);
        }
        List<Integer> before = counts();
        mockMvc.perform(post("/api/platform/practitioners/onboarding").header("X-Tenant-Id", TENANT)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(input()))).andExpect(status().isUnauthorized());
        assertThat(counts()).isEqualTo(before);
    }

    @Test void rejects_inactive_targets_and_rolls_back_all_new_records() throws Exception {
        for (String target : List.of("RHN_SYS_ORG:ID_ORG:" + ORGANIZATION, "RHN_SYS_DEPT:ID_DEPT:" + DEPARTMENT)) {
            String[] parts = target.split(":");
            jdbc.update("UPDATE " + parts[0] + " SET SD_STATUS = 'INACTIVE' WHERE " + parts[1] + " = ?", Long.valueOf(parts[2]));
            try {
                List<Integer> before = counts();
                mockMvc.perform(post("/api/platform/practitioners/onboarding").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input())))
                        .andExpect(status().isConflict());
                assertThat(counts()).isEqualTo(before);
            } finally {
                jdbc.update("UPDATE " + parts[0] + " SET SD_STATUS = 'ACTIVE' WHERE " + parts[1] + " = ?", Long.valueOf(parts[2]));
            }
        }
    }

    @Test void publishes_the_atomic_onboarding_contract() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode document = json(body);
        assertThat(document.path("paths").path("/api/platform/practitioners/onboarding").has("post")).isTrue();
        assertThat(document.path("components").path("schemas").path("OnboardStaffRequest").path("required").toString())
                .contains("code", "fullName", "sdPractGender", "organizationId", "departmentId", "positionId", "hireDate");
        String export = System.getProperty("rhn.test.openapi-export");
        if (export != null) Files.writeString(Path.of(export), body);
    }

    private Map<String, Object> input() {
        var input = new LinkedHashMap<String, Object>();
        input.put("code", "ONBOARD_" + UUID.randomUUID().toString().replace("-", ""));
        input.put("fullName", "入职测试人员"); input.put("sdPractGender", "UNKNOWN");
        input.put("organizationId", ORGANIZATION); input.put("departmentId", DEPARTMENT);
        input.put("positionId", jdbc.queryForObject("SELECT MIN(ID_POS) FROM RHN_SYS_POS WHERE ID_TNT = ? AND SD_STATUS = 'ACTIVE'", Long.class, Long.valueOf(TENANT)).toString());
        input.put("hireDate", "2026-10-03"); return input;
    }
    private List<Integer> counts() {
        return List.of("RHN_SYS_PRACT", "RHN_SYS_EMPL", "RHN_SYS_STAFF_ASSIGN").stream()
                .map(table -> jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class)).toList();
    }
}
