package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class ItemAliasMasterDataTest extends RhnIntegrationTestSupport {
    private static final String URL = "/api/platform/master-data/services/362387890000297/aliases";
    private static final String EXISTING = """
            {"aliases":[{"aliasType":"SYNONYM","aliasName":"空腹血糖","primaryAlias":true,"status":"ACTIVE"}]}
            """;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.rhn.platform.organization.infrastructure.TenantRepository tenants;

    @Test void repeatedReplacementAndRemovalKeepSearchProjectionInSync() throws Exception {
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(put(URL).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(EXISTING))
                    .andExpect(status().isOk()).andExpect(jsonPath("$[0].aliasName").value("空腹血糖"))
                    .andExpect(jsonPath("$[0].aliasTypeText").value("同义词"));
        }
        assertEquals(1, aliasProjectionCount());
        mockMvc.perform(get(URL).with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(put(URL).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"aliases\":[]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        assertEquals(0, aliasProjectionCount());
    }

    @Test void invalidReplacementDoesNotDeleteExistingAliases() throws Exception {
        for (String invalid : new String[]{"{}", "{\"aliases\":[null]}",
                EXISTING.replace("\"ACTIVE\"", "null"),
                EXISTING.replace("空腹血糖", " ")}) {
            mockMvc.perform(put(URL).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest());
        }
        mockMvc.perform(get(URL).with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].aliasName").value("空腹血糖"))
                    .andExpect(jsonPath("$[0].aliasTypeText").value("同义词"));
    }

    @Test void foreignTenantCannotReadOrReplaceAliases() throws Exception {
        tenants.saveAndFlush(new com.rhn.platform.organization.domain.Tenant(999999999L, "ALIAS-OTHER", "别名隔离测试机构"));
        mockMvc.perform(get(URL).with(rhn("999999999"))).andExpect(status().isNotFound());
        mockMvc.perform(put(URL).with(rhn("999999999")).contentType(MediaType.APPLICATION_JSON).content(EXISTING))
                .andExpect(status().isForbidden());
    }

    @Test void replacementRequiresMasterDataManageAuthority() throws Exception {
        mockMvc.perform(put(URL).with(rhn())
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                        .user("doctor").authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("MASTER_DATA.VIEW")))
                .contentType(MediaType.APPLICATION_JSON).content(EXISTING))
                .andExpect(status().isForbidden());
        assertEquals(1, aliasProjectionCount());
    }

    private int aliasProjectionCount() {
        return jdbc.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY
                where ID_TNT = 362387869790209 and SD_TARGET_TYPE = 'CATALOG_ITEM'
                  and ID_TARGET = 362387890000297 and CD_SOURCE_KEY like 'ITEM_ALIAS:%'
                """, Integer.class);
    }
}
