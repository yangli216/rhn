package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DepartmentDefaultRoleTest extends RhnIntegrationTestSupport {
    private static final String PHARMACY_DEPARTMENT = "362387869799103";
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Shanghai"));

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void department_defaults_follow_account_opening_and_assignment_end_without_touching_manual_grants() throws Exception {
        String defaultRole = createRole("DEFAULT");
        String manualRole = createRole("MANUAL");

        mockMvc.perform(put("/api/platform/iam/departments/{id}/default-roles", DEPARTMENT).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roleIds":["%s"],"applyToCurrentStaff":false}
                                """.formatted(defaultRole)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.manageable").value(true))
                .andExpect(jsonPath("$.roles[0].roleId").value(defaultRole))
                .andExpect(jsonPath("$.grantedCount").value(0));
        mockMvc.perform(get("/api/platform/iam/departments/{id}/default-roles", PHARMACY_DEPARTMENT).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.manageable").value(false));
        mockMvc.perform(put("/api/platform/iam/departments/{id}/default-roles", PHARMACY_DEPARTMENT).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roleIds":["%s"],"applyToCurrentStaff":false}
                                """.formatted(defaultRole)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("IAM_SCOPE_ESCALATION_FORBIDDEN"));

        JsonNode onboarded = onboard();
        String practitionerId = onboarded.path("practitioner").path("id").asString();
        JsonNode assignment = onboarded.path("assignments").get(0);
        mockMvc.perform(get("/api/platform/iam/practitioners/{id}/access", practitionerId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account").isEmpty())
                .andExpect(jsonPath("$.scope.scopeType").value("DEPARTMENT"));

        String username = "dr" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        mockMvc.perform(post("/api/platform/iam/practitioners/{id}/account", practitionerId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","initialPassword":"short"}
                                """.formatted(username)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IAM_PASSWORD_WEAK"));
        JsonNode access = json(mockMvc.perform(post("/api/platform/iam/practitioners/{id}/account", practitionerId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","initialPassword":"Init2026pass"}
                                """.formatted(username.toUpperCase())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.account.username").value(username))
                .andReturn().getResponse().getContentAsString());
        String userId = access.path("account").path("id").asString();
        JsonNode defaultGrant = access.path("assignments").get(0);
        assertThat(access.path("assignments")).hasSize(1);
        assertThat(defaultGrant.path("roleId").asString()).isEqualTo(defaultRole);
        assertThat(defaultGrant.path("grantSource").asString()).isEqualTo("DEPT_DEFAULT");
        assertThat(defaultGrant.path("staffAssignmentId").asString()).isEqualTo(assignment.path("id").asString());
        assertThat(defaultGrant.path("effective").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("select HASH_PWD from RHN_SYS_USER_ACCT where ID_USER = ?", String.class,
                Long.valueOf(userId))).startsWith("{bcrypt}");
        mockMvc.perform(post("/api/platform/iam/practitioners/{id}/account", practitionerId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s2","initialPassword":"Init2026pass"}
                                """.formatted(username)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IAM_ACCOUNT_EXISTS"));

        mockMvc.perform(post("/api/platform/iam/users/{id}/role-assignments", userId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roleId":"%s","organizationId":"%s","departmentId":"%s","dataScopeType":"DEPARTMENT"}
                                """.formatted(manualRole, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.grantSource").value("MANUAL"))
                .andExpect(jsonPath("$.practitionerId").value(practitionerId));

        mockMvc.perform(get("/api/platform/iam/roles/{id}/members", defaultRole).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.practitionerId == '" + practitionerId + "')].practitionerName").value("默认角色测试"))
                .andExpect(jsonPath("$[?(@.practitionerId == '" + practitionerId + "')].departmentName").isNotEmpty());

        // Re-running the synchronizer (e.g. a later personnel action) must not duplicate grants.
        mockMvc.perform(put("/api/platform/iam/departments/{id}/default-roles", DEPARTMENT).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roleIds":["%s"],"applyToCurrentStaff":true}
                                """.formatted(defaultRole)))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_SYS_USER_ROLE_ASSIGN where ID_USER = ? and SD_GRANT_SRC = 'DEPT_DEFAULT'
                """, Integer.class, Long.valueOf(userId))).isEqualTo(1);

        mockMvc.perform(post("/api/platform/assignments/{id}/end", assignment.path("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("expectedRevision", assignment.path("revision").asLong(),
                                "lastDay", TODAY.minusDays(1).toString(), "reason", "测试结束任职"))))
                .andExpect(status().isOk());

        List<Map<String, Object>> grants = jdbc.queryForList("""
                select ID_ACC_ROLE, SD_GRANT_SRC, DT_VALID_TO from RHN_SYS_USER_ROLE_ASSIGN where ID_USER = ?
                """, Long.valueOf(userId));
        assertThat(grants).hasSize(2);
        for (Map<String, Object> grant : grants) {
            if ("DEPT_DEFAULT".equals(grant.get("SD_GRANT_SRC"))) assertThat(grant.get("DT_VALID_TO")).isNotNull();
            else assertThat(grant.get("DT_VALID_TO")).isNull();
        }
        String mine = "$[?(@.practitionerId == '" + practitionerId + "')]";
        mockMvc.perform(get("/api/platform/iam/roles/{id}/members", defaultRole).with(rhnWorkContext()))
                .andExpect(jsonPath(mine).doesNotExist());
        mockMvc.perform(get("/api/platform/iam/roles/{id}/members", defaultRole).param("includeExpired", "true")
                        .with(rhnWorkContext()))
                .andExpect(jsonPath(mine + ".effective").value(false));
    }

    @Test
    void new_assignment_of_a_practitioner_with_an_account_receives_the_department_defaults() throws Exception {
        String defaultRole = createRole("ONBOARD");
        mockMvc.perform(put("/api/platform/iam/departments/{id}/default-roles", DEPARTMENT).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roleIds":["%s"],"applyToCurrentStaff":false}
                                """.formatted(defaultRole)))
                .andExpect(status().isOk());
        String practitionerId = onboard().path("practitioner").path("id").asString();
        String username = "nr" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        mockMvc.perform(post("/api/platform/iam/practitioners/{id}/account", practitionerId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","initialPassword":"Init2026pass"}
                                """.formatted(username)))
                .andExpect(status().isCreated());
        Long otherDepartment = jdbc.queryForObject("""
                select min(ID_DEPT) from RHN_SYS_DEPT where ID_ORG = ? and ID_DEPT not in (?, ?) and SD_STATUS = 'ACTIVE'
                """, Long.class, Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), Long.valueOf(PHARMACY_DEPARTMENT));
        jdbc.update("""
                insert into RHN_SYS_DEPT_DFLT_ROLE (ID_DEPT_DFLT_ROLE, ID_TNT, ID_ORG, ID_DEPT, ID_ACC_ROLE, DT_CREATED)
                values (?, ?, ?, ?, ?, current_timestamp)
                """, com.rhn.shared.id.GlobalIds.next(), Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), otherDepartment,
                Long.valueOf(defaultRole));

        var input = new LinkedHashMap<String, Object>();
        input.put("organizationId", ORGANIZATION); input.put("departmentId", otherDepartment.toString());
        input.put("positionId", position()); input.put("primaryAssignment", false);
        input.put("validFrom", TODAY.toString());
        mockMvc.perform(post("/api/platform/practitioners/{id}/assignments", practitionerId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().isCreated());

        Integer grants = jdbc.queryForObject("""
                select count(*) from RHN_SYS_USER_ROLE_ASSIGN grant_row
                  join RHN_SYS_USER_ACCT account on account.ID_USER = grant_row.ID_USER
                 where account.ID_PRACT = ? and grant_row.SD_GRANT_SRC = 'DEPT_DEFAULT' and grant_row.ID_DEPT = ?
                """, Integer.class, Long.valueOf(practitionerId), otherDepartment);
        assertThat(grants).isEqualTo(1);
    }

    private String createRole(String suffix) throws Exception {
        String code = "TEST_" + suffix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        return json(mockMvc.perform(post("/api/platform/iam/roles").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"%s","name":"默认角色测试","roleType":"BUSINESS"}
                                """.formatted(code)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
    }

    private JsonNode onboard() throws Exception {
        var input = new LinkedHashMap<String, Object>();
        input.put("code", "DFLT_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase());
        input.put("fullName", "默认角色测试"); input.put("sdPractGender", "0");
        input.put("organizationId", ORGANIZATION); input.put("departmentId", DEPARTMENT);
        input.put("positionId", position());
        input.put("hireDate", TODAY.minusDays(10).toString());
        return json(mockMvc.perform(post("/api/platform/practitioners/onboarding").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String position() {
        return jdbc.queryForObject("SELECT MIN(ID_POS) FROM RHN_SYS_POS WHERE ID_TNT = ? AND SD_STATUS = 'ACTIVE'", Long.class,
                Long.valueOf(TENANT)).toString();
    }
}
