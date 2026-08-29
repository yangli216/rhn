package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class IdentityAccessAuthorizationTest extends RhnIntegrationTestSupport {
    private static final String PHARMACY_DEPARTMENT = "362387869799103";

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void role_permission_and_scoped_user_assignment_form_an_audited_management_loop() throws Exception {
        String roleBody = mockMvc.perform(post("/api/platform/iam/roles").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"TEST_REVIEWER","name":"测试审核员","roleType":"BUSINESS"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("TEST_REVIEWER"))
                .andReturn().getResponse().getContentAsString();
        String roleId = json(roleBody).get("id").asText();

        String permissionsBody = mockMvc.perform(get("/api/platform/iam/permissions").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String taskReadId = json(permissionsBody).valueStream()
                .filter(value -> "TASK.READ".equals(value.get("code").asText()))
                .findFirst().orElseThrow().get("id").asText();

        mockMvc.perform(put("/api/platform/iam/roles/{roleId}/permissions", roleId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedVersion":0,"permissionIds":["%s"]}
                                """.formatted(taskReadId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.permissionCodes[0]").value("TASK.READ"));

        String assignmentBody = mockMvc.perform(post("/api/platform/iam/users/{userId}/role-assignments",
                                "362387869790222").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roleId":"%s","organizationId":"%s","departmentId":"%s",
                                 "dataScopeType":"DEPARTMENT"}
                                """.formatted(roleId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.effective").value(true))
                .andReturn().getResponse().getContentAsString();
        String assignmentId = json(assignmentBody).get("id").asText();

        mockMvc.perform(delete("/api/platform/iam/user-role-assignments/{id}", assignmentId).with(rhnWorkContext()))
                .andExpect(status().isNoContent());
        Integer events = jdbc.queryForObject("""
                select count(*) from iam_authorization_events where tenant_id = cast(? as bigint)
                  and target_id in (cast(? as bigint), cast(? as bigint))
                """, Integer.class, TENANT, roleId, assignmentId);
        assertThat(events).isEqualTo(4);
    }

    @Test
    void permissions_are_recalculated_for_each_selected_department() throws Exception {
        Long roleId = GlobalIds.next();
        Long permissionId = GlobalIds.next();
        Instant now = Instant.now();
        jdbc.update("""
                insert into access_roles
                    (id, tenant_id, code, name, role_type, status, created_at, updated_at, version)
                values (?, cast(? as bigint), 'CONTEXT_ONLY', '上下文专属角色', 'CUSTOM', 'ACTIVE', ?, ?, 0)
                """, roleId, TENANT, now, now);
        jdbc.update("""
                insert into access_permissions
                    (id, tenant_id, code, name, action_code, resource_code, status)
                values (?, cast(? as bigint), 'TEST_CONTEXT.ACCESS', '上下文专属权限', 'ACCESS', 'TEST_CONTEXT', 'ACTIVE')
                """, permissionId, TENANT);
        jdbc.update("""
                insert into role_permission_assignments
                    (id, tenant_id, role_id, permission_id, valid_from, created_at)
                values (?, cast(? as bigint), ?, ?, ?, ?)
                """, GlobalIds.next(), TENANT, roleId, permissionId, now.minusSeconds(10), now);
        jdbc.update("""
                insert into user_role_assignments
                    (id, tenant_id, user_id, role_id, organization_id, department_id,
                     data_scope_type, valid_from, created_at)
                values (?, cast(? as bigint), 362387869790222, ?, cast(? as bigint), cast(? as bigint),
                        'DEPARTMENT', ?, ?)
                """, GlobalIds.next(), TENANT, roleId, ORGANIZATION, DEPARTMENT, now.minusSeconds(10), now);

        mockMvc.perform(get("/api/session").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authorities[?(@ == 'TEST_CONTEXT.ACCESS')]").exists());

        mockMvc.perform(get("/api/session").with(request -> {
                    rhn().postProcessRequest(request);
                    request.addHeader("X-Organization-Id", ORGANIZATION);
                    request.addHeader("X-Department-Id", PHARMACY_DEPARTMENT);
                    return request;
                }))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authorities[?(@ == 'TEST_CONTEXT.ACCESS')]").doesNotExist());
    }

    @Test
    void forged_work_context_is_rejected_before_controller_authorization() throws Exception {
        mockMvc.perform(get("/api/platform/iam/roles").with(request -> {
                    rhn().postProcessRequest(request);
                    request.addHeader("X-Organization-Id", ORGANIZATION);
                    request.addHeader("X-Department-Id", "999999999999999999");
                    return request;
                }))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("WORK_CONTEXT_FORBIDDEN"));
    }
}
