package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationAliasMasterDataTest extends RhnIntegrationTestSupport {
    private static final long TENANT = 362387869790209L;
    private static final String TWO = """
            {"aliases":[{"aliasType":"SYNONYM","aliasName":"盐酸二甲双胍","primaryAlias":true,"status":"ACTIVE"},
                        {"aliasType":"SYNONYM","aliasName":"格华止","primaryAlias":false,"status":"ACTIVE"}]}
            """;
    @Autowired JdbcTemplate jdbc;

    private String url() {
        return "/api/platform/master-data/medications/" + medicationId() + "/aliases";
    }

    private long medicationId() {
        return jdbc.queryForObject("select min(ID_MED) from RHN_BD_MED where ID_TNT = ?", Long.class, TENANT);
    }

    @Test void replacementStoresOneRowPerAliasAndProjectsEachToSearch() throws Exception {
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(put(url()).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(TWO))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        }
        assertEquals(2, aliasRows());
        assertEquals(2, projectionRows());
        // 每个别名单独生成拼音码，而不是整串一条
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY where ID_TARGET = ? and SD_TARGET_TYPE = 'MEDICATION'
                  and CD_SOURCE_KEY like 'MEDICATION_ALIAS:%' and CD_PINYIN = 'GHZ'
                """, Integer.class, medicationId()));
        mockMvc.perform(put(url()).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"aliases\":[]}")).andExpect(status().isOk());
        assertEquals(0, aliasRows());
        assertEquals(0, projectionRows());
    }

    @Test void invalidReplacementKeepsExistingAliases() throws Exception {
        mockMvc.perform(put(url()).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(TWO))
                .andExpect(status().isOk());
        for (String invalid : new String[]{"{}", "{\"aliases\":[null]}", TWO.replace("格华止", " "),
                TWO.replace("格华止", "盐酸二甲双胍")}) {
            mockMvc.perform(put(url()).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest());
        }
        assertEquals(2, aliasRows());
    }

    @Test void viewExposesAliasesAsOneSemicolonSeparatedString() throws Exception {
        mockMvc.perform(put(url()).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(TWO))
                .andExpect(status().isOk());
        String code = jdbc.queryForObject("select CD_MED from RHN_BD_MED where ID_MED = ?", String.class, medicationId());
        mockMvc.perform(get("/api/platform/master-data/medications").param("query", code).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].aliasName").value("格华止；盐酸二甲双胍"));
    }

    @Test void replacementRequiresMasterDataManageAuthority() throws Exception {
        mockMvc.perform(put(url()).with(rhn())
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                        .user("doctor").authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("MASTER_DATA.VIEW")))
                .contentType(MediaType.APPLICATION_JSON).content(TWO)).andExpect(status().isForbidden());
    }

    private int aliasRows() {
        return jdbc.queryForObject("select count(*) from RHN_BD_MED_ALIAS where ID_MED = ? and SD_STATUS = 'ACTIVE'",
                Integer.class, medicationId());
    }

    private int projectionRows() {
        return jdbc.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY where ID_TARGET = ? and SD_TARGET_TYPE = 'MEDICATION'
                  and CD_SOURCE_KEY like 'MEDICATION_ALIAS:%'
                """, Integer.class, medicationId());
    }
}
