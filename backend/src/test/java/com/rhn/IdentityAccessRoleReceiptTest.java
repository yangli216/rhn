package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class IdentityAccessRoleReceiptTest extends RhnIntegrationTestSupport {
    @Test
    void creation_and_status_receipts_preserve_identity_permissions_and_version_guards() throws Exception {
        String created = mockMvc.perform(post("/api/platform/iam/roles").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"receipt_role","name":" 回执角色 ","roleType":"BUSINESS"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("RECEIPT_ROLE"))
                .andExpect(jsonPath("$.name").value("回执角色"))
                .andExpect(jsonPath("$.roleType").value("BUSINESS"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.permissionCodes").isEmpty())
                .andReturn().getResponse().getContentAsString();
        String id = json(created).get("id").asString();
        String directory = mockMvc.perform(get("/api/platform/iam/permissions").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String permissionId = json(directory).valueStream().filter(value -> "TASK.READ".equals(value.get("code").asString()))
                .findFirst().orElseThrow().get("id").asString();
        mockMvc.perform(put("/api/platform/iam/roles/{id}/permissions", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedVersion":0,"permissionIds":["%s"]}
                                """.formatted(permissionId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mockMvc.perform(put("/api/platform/iam/roles/{id}", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedVersion":1,"name":"回执角色","status":"INACTIVE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.code").value("RECEIPT_ROLE"))
                .andExpect(jsonPath("$.roleType").value("BUSINESS"))
                .andExpect(jsonPath("$.status").value("INACTIVE"))
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.permissionCodes.length()").value(1))
                .andExpect(jsonPath("$.permissionCodes[0]").value("TASK.READ"));
        mockMvc.perform(put("/api/platform/iam/roles/{id}", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedVersion":1,"name":"回执角色","status":"ACTIVE"}
                                """))
                .andExpect(status().isConflict());
        String roles = mockMvc.perform(get("/api/platform/iam/roles").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var persisted = json(roles).valueStream().filter(value -> id.equals(value.get("id").asString())).findFirst().orElseThrow();
        assertThat(persisted.get("status").asString()).isEqualTo("INACTIVE");
        assertThat(persisted.get("version").asInt()).isEqualTo(2);
        mockMvc.perform(post("/api/platform/iam/roles").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"RECEIPT_ROLE","name":"重复角色","roleType":"BUSINESS"}
                                """))
                .andExpect(status().isConflict());
    }
}
