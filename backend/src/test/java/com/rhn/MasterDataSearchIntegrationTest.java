package com.rhn;

import com.rhn.platform.search.application.SearchEntryProjectionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MasterDataSearchIntegrationTest extends RhnIntegrationTestSupport {
    private static final String USER_ID = "362387869790222";
    private static final String HUANGQI_MEDICATION_ID = "362387871000905";
    private static final String INPUT_MODE_DEFINITION_ID = "362387869795130";
    private static final long HISTORICAL_ADOPTION_ID = 362399999999901L;
    private static final long FUTURE_ADOPTION_ID = 362399999999902L;
    private static final long CURRENT_VITAMIN_B1_ADOPTION_ID = 362387869795514L;
    private static final long VITAMIN_B1_PRODUCT_ID = 362387869795114L;

    @Autowired SearchEntryProjectionService projections;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void searches_generated_pinyin_and_wubi_codes_with_scoped_projection_rules() throws Exception {
        jdbcTemplate.update("""
                insert into RHN_BD_ORG_CATALOG_ITEM (
                    ID_ORG_CATALOG_ITEM, REVISION, ID_TNT, ID_ORG, ID_CATALOG_ITEM, ID_DEPT_DEFAULT,
                    CD_LOCAL, NA_LOCAL, FG_ORDERABLE, FG_EXECUTABLE, FG_CHARGEABLE, FG_PURCHASABLE,
                    FG_STOCKED, FG_DISPENSABLE, FG_RETURNABLE, SD_STATUS, DA_VALID_FROM, DA_VALID_TO,
                    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED, ID_ORG_CATALOG_ITEM_REPLACED
                ) values (?, 0, ?, ?, ?, ?, 'OLD-VB1', '历史维生素B1', true, false, true, true,
                          true, true, true, 'REPLACED', date '2025-01-01', date '2025-12-31',
                          current_timestamp, ?, current_timestamp, ?, null)
                """, HISTORICAL_ADOPTION_ID, Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                VITAMIN_B1_PRODUCT_ID, Long.valueOf(DEPARTMENT), Long.valueOf(USER_ID), Long.valueOf(USER_ID));
        jdbcTemplate.update("""
                update RHN_BD_ORG_CATALOG_ITEM
                set SD_STATUS = 'REPLACED', DA_VALID_TO = date '2026-12-31'
                where ID_ORG_CATALOG_ITEM = ?
                """, CURRENT_VITAMIN_B1_ADOPTION_ID);
        jdbcTemplate.update("""
                insert into RHN_BD_ORG_CATALOG_ITEM (
                    ID_ORG_CATALOG_ITEM, REVISION, ID_TNT, ID_ORG, ID_CATALOG_ITEM, ID_DEPT_DEFAULT,
                    CD_LOCAL, NA_LOCAL, FG_ORDERABLE, FG_EXECUTABLE, FG_CHARGEABLE, FG_PURCHASABLE,
                    FG_STOCKED, FG_DISPENSABLE, FG_RETURNABLE, SD_STATUS, DA_VALID_FROM, DA_VALID_TO,
                    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED, ID_ORG_CATALOG_ITEM_REPLACED
                ) values (?, 0, ?, ?, ?, ?, 'NEW-VB1', '维生素B1注射液新版', true, false, true, true,
                          true, true, true, 'ACTIVE', date '2027-01-01', null,
                          current_timestamp, ?, current_timestamp, ?, ?)
                """, FUTURE_ADOPTION_ID, Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                VITAMIN_B1_PRODUCT_ID, Long.valueOf(DEPARTMENT), Long.valueOf(USER_ID), Long.valueOf(USER_ID),
                CURRENT_VITAMIN_B1_ADOPTION_ID);
        var rebuilt = projections.rebuildAll();
        assertTrue(rebuilt.desired() > 0);

        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", INPUT_MODE_DEFINITION_ID)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"scopeType":"USER","scopeId":"%s","valueMode":"OVERRIDE",
                                 "valueJson":"\\\"ALL\\\"","reason":"检索集成测试",
                                 "requestCode":"%s"}
                                """.formatted(USER_ID, UUID.randomUUID())))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/platform/configuration/values/master-data.search.input-mode")
                        .with(rhnWorkContext()).queryParam("userId", USER_ID)
                        .queryParam("organizationId", ORGANIZATION).queryParam("departmentId", DEPARTMENT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value("ALL"))
                .andExpect(jsonPath("$.resolvedScope").value("USER"));

        Set<String> hq = medicationIds("hq");
        Set<String> aa = medicationIds("aa");
        assertTrue(hq.contains(HUANGQI_MEDICATION_ID), () -> "hq results: " + hq);
        assertTrue(aa.contains(HUANGQI_MEDICATION_ID), () -> "aa results: " + aa);

        Integer huangqiCodes = jdbcTemplate.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY
                where SD_TARGET_TYPE = 'MEDICATION' and ID_TARGET = ?
                  and CD_PINYIN = 'HQ' and CD_WUBI = 'AA'
                """, Integer.class, Long.valueOf(HUANGQI_MEDICATION_ID));
        assertEquals(1, huangqiCodes);

        Integer invalidProductTenantRows = jdbcTemplate.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY
                where SD_SCOPE_TYPE = 'PRODUCT' and ID_TNT is not null
                """, Integer.class);
        Integer organizationLocalNames = jdbcTemplate.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY
                where SD_SCOPE_TYPE = 'ORGANIZATION' and SD_NAME_TYPE = 'LOCAL_NAME' and ID_TNT is not null
                """, Integer.class);
        Integer inactiveRows = jdbcTemplate.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY where SD_STATUS <> 'ACTIVE'
                """, Integer.class);
        Integer vitaminB1LocalNames = jdbcTemplate.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY
                where SD_SCOPE_TYPE = 'ORGANIZATION' and ID_SCOPE = ? and ID_TARGET = ?
                  and SD_NAME_TYPE = 'LOCAL_NAME' and CD_SOURCE_KEY = 'ORG_CATALOG_ITEM:CURRENT'
                  and NA_SEARCH = '维生素B1注射液'
                """, Integer.class, Long.valueOf(ORGANIZATION), VITAMIN_B1_PRODUCT_ID);
        Integer historicalLocalNames = jdbcTemplate.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY
                where SD_SCOPE_TYPE = 'ORGANIZATION' and ID_SCOPE = ? and ID_TARGET = ?
                  and (CD_SOURCE_KEY <> 'ORG_CATALOG_ITEM:CURRENT' or NA_SEARCH = '历史维生素B1')
                """, Integer.class, Long.valueOf(ORGANIZATION), VITAMIN_B1_PRODUCT_ID);
        assertTrue(invalidProductTenantRows != null && invalidProductTenantRows == 0);
        assertTrue(organizationLocalNames != null && organizationLocalNames > 0);
        assertEquals(0, inactiveRows);
        assertEquals(1, vitaminB1LocalNames);
        assertEquals(0, historicalLocalNames);

        projections.refreshEffectiveDateTransitions(LocalDate.of(2027, 1, 1));
        Integer futureVitaminB1LocalNames = jdbcTemplate.queryForObject("""
                select count(*) from RHN_BD_SEARCH_ENTRY
                where SD_SCOPE_TYPE = 'ORGANIZATION' and ID_SCOPE = ? and ID_TARGET = ?
                  and SD_NAME_TYPE = 'LOCAL_NAME' and CD_SOURCE_KEY = 'ORG_CATALOG_ITEM:CURRENT'
                  and NA_SEARCH = '维生素B1注射液新版'
                """, Integer.class, Long.valueOf(ORGANIZATION), VITAMIN_B1_PRODUCT_ID);
        assertEquals(1, futureVitaminB1LocalNames);

        assertFalse(hq.isEmpty());
    }

    private Set<String> medicationIds(String query) throws Exception {
        String response = mockMvc.perform(get("/api/platform/master-data/medications/search")
                        .with(rhnWorkContext()).queryParam("query", query).queryParam("status", "ACTIVE")
                        .queryParam("organizationId", ORGANIZATION).queryParam("page", "0").queryParam("size", "100"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode content = json(response).path("content");
        Set<String> ids = new HashSet<>();
        content.forEach(value -> ids.add(value.path("id").asString()));
        return ids;
    }
}
