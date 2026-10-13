package com.rhn;

import com.rhn.platform.numbering.api.BusinessNumberContext;
import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.test.context.support.WithMockUser;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BusinessNumberingAdministrationTest extends RhnIntegrationTestSupport {
    @Autowired BusinessNumberGenerator numbers;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test
    @WithMockUser(authorities = "CONFIGURATION.ACCESS")
    void rules_are_read_only_and_report_the_next_real_sequence() throws Exception {
        var owner = new BusinessNumberContext(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT));
        numbers.next("outpatient-encounter", owner);
        var before = numbers.inspect("outpatient-encounter", owner);
        for (int i = 0; i < 2; i++) {
            var rows = json(mockMvc.perform(get("/api/platform/business-numbering/rules").with(rhnWorkContext()).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("doctor").authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("CONFIGURATION.ACCESS"))))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            assertThat(rows.size()).isEqualTo(36);
            var row = java.util.stream.StreamSupport.stream(rows.spliterator(), false)
                    .filter(value -> "outpatient-encounter".equals(value.path("businessCode").asString())).findFirst().orElseThrow();
            assertThat(row.path("sequence").path("nextNumber").asString()).isEqualTo(before.nextNumber());
            assertThat(row.path("status").asString()).isEqualTo("AVAILABLE");
        }
        assertThat(numbers.next("outpatient-encounter", owner)).isEqualTo(before.nextNumber());
    }

    @Test
    @WithMockUser(authorities = "PORTAL.ACCESS")
    void rule_queries_require_configuration_permission() throws Exception {
        mockMvc.perform(get("/api/platform/business-numbering/rules").header("X-Tenant-Id", TENANT).header("X-Client-Session-Id", "test-numbering-session").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("viewer").authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("PORTAL.ACCESS"))))
                .andExpect(status().isForbidden());
    }

    @Test
    @org.springframework.transaction.annotation.Transactional
    void same_document_number_is_allowed_across_institutions_but_rejected_within_one() {
        long secondOrg = com.rhn.shared.id.GlobalIds.next();
        long secondResource = com.rhn.shared.id.GlobalIds.next();
        var organization = new org.springframework.util.LinkedCaseInsensitiveMap<Object>();
        organization.putAll(jdbc.queryForMap(
                "select * from RHN_SYS_ORG where ID_ORG = ?", Long.valueOf(ORGANIZATION)));
        organization.put("ID_ORG", secondOrg); organization.put("CD_ORG", "NUMBERING-" + secondOrg);
        insert("RHN_SYS_ORG", organization);
        var resource = new org.springframework.util.LinkedCaseInsensitiveMap<Object>();
        resource.putAll(jdbc.queryForMap(
                "select * from RHN_SYS_SVC_RSRC where ID_SVC_RSRC = ?", 362387869899081L));
        String number = (String) resource.get("CD_RSRC");
        resource.put("ID_SVC_RSRC", secondResource); resource.put("ID_ORG", secondOrg);
        insert("RHN_SYS_SVC_RSRC", resource);
        assertThat(jdbc.queryForObject("select count(*) from RHN_SYS_SVC_RSRC where ID_TNT = ? and CD_RSRC = ?",
                Long.class, Long.valueOf(TENANT), number)).isEqualTo(2L);
        // Change natural resource identity too, so only the document number constraint can reject this row.
        resource.put("ID_SVC_RSRC", com.rhn.shared.id.GlobalIds.next());
        resource.put("ID_PRACT", null); resource.put("ID_STAFF_ASSIGN", null);
        resource.put("SD_RSRC_TYPE", "DEPARTMENT"); resource.put("CD_RSRC_KEY", "NUMBERING-DUPLICATE");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> insert("RHN_SYS_SVC_RSRC", resource))
                .isInstanceOf(org.springframework.dao.DuplicateKeyException.class).hasMessageContaining("ORG_NO");
    }

    private void insert(String table, java.util.Map<String, Object> row) {
        jdbc.update("insert into " + table + " (" + String.join(",", row.keySet()) + ") values ("
                + String.join(",", java.util.Collections.nCopies(row.size(), "?")) + ")", row.values().toArray());
    }

    @Test
    void publish_generated_contract_from_isolated_application() throws Exception {
        String document = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(json(document).path("paths").has("/api/platform/business-numbering/rules")).isTrue();
        Files.createDirectories(Path.of("target"));
        Files.writeString(Path.of("target/business-numbering-openapi.json"), document);
    }
}
