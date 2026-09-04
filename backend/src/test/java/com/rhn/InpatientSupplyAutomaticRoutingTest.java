package com.rhn;

import com.rhn.pharmacy.application.WardMedicationSupplyGenerationScheduler;
import com.rhn.platform.configuration.infrastructure.ConfigurationValueCache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contract tests for demand-first automatic inpatient supply routing.
 *
 * <p>The scheduler must discover planned medication occurrences before resolving a pharmacy. This is
 * deliberately different from discovering active generic routes: a missing or unusable route is itself
 * an operational fact and must not make clinical demand disappear.</p>
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class InpatientSupplyAutomaticRoutingTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898514";
    private static final String WARD_DEPARTMENT = "362387869898501";
    private static final String WESTERN_PRODUCT = "362387869795111";
    private static final String HERBAL_PRODUCT = "362387869795112";
    private static final String HERBAL_MEDICATION = "362387869795202";
    private static final String GENERAL_INPATIENT_SITE = "362387869799503";
    private static final String HERBAL_SITE = "362387869799504";
    private static final LocalDate BUSINESS_DATE = LocalDate.of(2026, 9, 5);
    private static final Instant DISCOVERY_TIME = Instant.parse("2026-09-04T22:00:00Z");

    @Autowired WardMedicationSupplyGenerationScheduler scheduler;
    @Autowired ConfigurationValueCache configurationCache;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void enableAutomaticSupplyAndPrepareHerbalFixture() {
        jdbc.update("""
                update RHN_SYS_PARAM_DEF set JSON_DEFAULT_VAL = 'true'
                 where CD_PARAM_KEY = 'pharmacy.inpatient-supply.auto-generation.enabled'
                """);
        configurationCache.invalidateAll();

        // Reuse an otherwise complete medication product fixture so the test remains focused on routing.
        // Clinical order creation still goes through the real API and freezes HERBAL into its request snapshot.
        jdbc.update("update RHN_BD_MED set SD_MED_TYPE = 'HERBAL' where ID_MED = ?",
                Long.valueOf(HERBAL_MEDICATION));
    }

    @Test
    void same_ward_and_shift_split_western_and_herbal_demand_into_isolated_routed_batches() throws Exception {
        JsonNode herbalRoute = createHerbalRoute("IP-HERBAL-SPECIALIZED");
        String episodeId = admit("IP-ROUTING-SPLIT-ADMIT");

        String westernRequestId = createPlannedMedication(episodeId, WESTERN_PRODUCT,
                "2026-09-05T01:00:00Z", "IP-ROUTING-SPLIT-WESTERN");
        String herbalRequestId = createPlannedMedication(episodeId, HERBAL_PRODUCT,
                "2026-09-05T02:00:00Z", "IP-ROUTING-SPLIT-HERBAL");

        scheduler.pollAt(DISCOVERY_TIME);

        List<Map<String, Object>> batches = jdbc.queryForList("""
                select ID_INP_MED_SUPPLY_BATCH as id, ID_STOCK_SITE as stock_site_id from RHN_SUP_INP_MED_SUPPLY_BATCH
                 where ID_TNT = ? and ID_DEPT_NURS_UNIT = ?
                   and DT_WINDOW_START = ? and SD_GEN_TRIGGER = 'AUTO'
                 order by ID_STOCK_SITE
                """, Long.valueOf(TENANT), Long.valueOf(WARD_DEPARTMENT),
                Instant.parse("2026-09-05T00:00:00Z"));
        assertEquals(2, batches.size(), "同一病区班次应按西药房和中药房形成两个独立自动批次");
        assertEquals(1, count("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_BATCH
                 where ID_DEPT_NURS_UNIT = ? and DT_WINDOW_START = ? and ID_STOCK_SITE = ?
                """, WARD_DEPARTMENT, "2026-09-05T00:00:00Z", GENERAL_INPATIENT_SITE));
        assertEquals(1, count("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_BATCH
                 where ID_DEPT_NURS_UNIT = ? and DT_WINDOW_START = ? and ID_STOCK_SITE = ?
                """, WARD_DEPARTMENT, "2026-09-05T00:00:00Z", HERBAL_SITE));

        assertEquals(1, routedLineCount(GENERAL_INPATIENT_SITE, westernRequestId, "WESTERN"));
        assertEquals(1, routedLineCount(HERBAL_SITE, herbalRequestId, "HERBAL"));
        assertEquals(0, routedMedicationTypeCount(GENERAL_INPATIENT_SITE, "HERBAL"),
                "专项中药剂次不得泄漏到通用住院药房批次");
        assertEquals(0, routedMedicationTypeCount(HERBAL_SITE, "WESTERN"),
                "西药剂次不得泄漏到中药专项批次");

        assertEquals(2, count("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where ID_DEPT_NURS_UNIT = ? and DA_BUSINESS = ? and CD_SHIFT = 'DAY'
                   and SD_STATUS = 'SUCCEEDED'
                """, WARD_DEPARTMENT, BUSINESS_DATE));
        assertEquals(1, count("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where ID_DEPT_NURS_UNIT = ? and DA_BUSINESS = ? and CD_SHIFT = 'DAY'
                   and SD_MED_TYPE_SNAP = 'WESTERN' and ID_STOCK_SITE = ? and SD_STATUS = 'SUCCEEDED'
                """, WARD_DEPARTMENT, BUSINESS_DATE, GENERAL_INPATIENT_SITE));
        assertEquals(1, count("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where ID_DEPT_NURS_UNIT = ? and DA_BUSINESS = ? and CD_SHIFT = 'DAY'
                   and SD_MED_TYPE_SNAP = 'HERBAL'
                   and ID_DISP_ROUTE = ? and ID_STOCK_SITE = ? and SD_STATUS = 'SUCCEEDED'
                """, WARD_DEPARTMENT, BUSINESS_DATE, herbalRoute.get("id").asText(), HERBAL_SITE));
    }

    @Test
    void missing_route_persists_one_blocked_run_and_same_job_recovers_once_route_is_reenabled() throws Exception {
        JsonNode disabledRoute = setRouteActive(route("INPATIENT-GENERAL-WARD"), false);
        String episodeId = admit("IP-ROUTING-RECOVERY-ADMIT");
        createPlannedMedication(episodeId, WESTERN_PRODUCT, "2026-09-05T01:00:00Z",
                "IP-ROUTING-RECOVERY-WESTERN");

        scheduler.pollAt(DISCOVERY_TIME);

        List<Map<String, Object>> blocked = jdbc.queryForList("""
                select ID_INP_MED_SUPPLY_GEN_RUN as id, CD_JOB_KEY as job_key,
                       SD_MED_TYPE_SNAP as medication_type_snapshot, SD_STATUS as status,
                       CD_LAST_ERROR as last_error_code from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where ID_TNT = ? and ID_ORG = ? and ID_DEPT_NURS_UNIT = ?
                   and DA_BUSINESS = ? and CD_SHIFT = 'DAY'
                """, Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(WARD_DEPARTMENT), BUSINESS_DATE);
        assertEquals(1, blocked.size(), "缺路由的真实计划剂次必须形成一条且仅一条可治理运行事实");
        assertEquals("WESTERN", blocked.getFirst().get("medication_type_snapshot"));
        assertEquals("ROUTING_BLOCKED", blocked.getFirst().get("status"));
        assertEquals("ROUTE_NOT_CONFIGURED", blocked.getFirst().get("last_error_code"),
                "阻断事实必须保留可检索的 ROUTE_NOT_CONFIGURED 原因码");
        assertEquals(0, count("select count(*) from RHN_SUP_INP_MED_SUPPLY_BATCH"),
                "路由未配置时不得生成无归属或错误归属的供药批次");

        String runId = String.valueOf(blocked.getFirst().get("id"));
        String jobKey = String.valueOf(blocked.getFirst().get("job_key"));
        assertEquals(ORGANIZATION + ":" + WARD_DEPARTMENT + ":WESTERN:" + BUSINESS_DATE + ":DAY", jobKey,
                "作业键必须锚定临床需求范围，不能包含尚未配置的目标药房");
        setRouteActive(disabledRoute, true);
        scheduler.pollAt(DISCOVERY_TIME);

        Map<String, Object> recovered = jdbc.queryForMap("""
                select ID_INP_MED_SUPPLY_GEN_RUN as id, CD_JOB_KEY as job_key,
                       SD_STATUS as status, ID_INP_MED_SUPPLY_BATCH as batch_id from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where ID_TNT = ? and ID_ORG = ? and ID_DEPT_NURS_UNIT = ?
                   and DA_BUSINESS = ? and CD_SHIFT = 'DAY'
                """, Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(WARD_DEPARTMENT), BUSINESS_DATE);
        assertEquals(runId, String.valueOf(recovered.get("id")),
                "补齐路由后必须恢复原运行事实而不是制造第二条作业");
        assertEquals(jobKey, String.valueOf(recovered.get("job_key")));
        assertEquals("SUCCEEDED", recovered.get("status"));
        assertNotNull(recovered.get("batch_id"));
        assertEquals(1, count("select count(*) from RHN_SUP_INP_MED_SUPPLY_GEN_RUN"));
        assertEquals(1, count("select count(*) from RHN_SUP_INP_MED_SUPPLY_BATCH"),
                "同一 job_key 恢复和再次轮询都只能得到一个批次");

        scheduler.pollAt(DISCOVERY_TIME);
        assertEquals(1, count("select count(*) from RHN_SUP_INP_MED_SUPPLY_GEN_RUN"));
        assertEquals(1, count("select count(*) from RHN_SUP_INP_MED_SUPPLY_BATCH"));
    }

    @Test
    void unavailable_specialized_target_blocks_herbal_demand_without_falling_back_to_general_pharmacy()
            throws Exception {
        createHerbalRoute("IP-HERBAL-UNAVAILABLE");
        String episodeId = admit("IP-ROUTING-UNAVAILABLE-ADMIT");
        String herbalRequestId = createPlannedMedication(episodeId, HERBAL_PRODUCT,
                "2026-09-05T01:00:00Z", "IP-ROUTING-UNAVAILABLE-HERBAL");

        // The route was valid when configured, then its authoritative target became unavailable.
        jdbc.update("update RHN_SUP_STOCK_SITE set FG_ACTIVE = false, REVISION = REVISION + 1 where ID_STOCK_SITE = ?",
                Long.valueOf(HERBAL_SITE));
        scheduler.pollAt(DISCOVERY_TIME);

        assertEquals(0, count("select count(*) from RHN_SUP_INP_MED_SUPPLY_BATCH"),
                "命中的专项药房不可用时必须整体阻断，不能静默回退到通用药房");
        assertEquals(0, routedLineCount(GENERAL_INPATIENT_SITE, herbalRequestId, "HERBAL"));
        List<Map<String, Object>> blocked = jdbc.queryForList("""
                select SD_MED_TYPE_SNAP as medication_type_snapshot, SD_STATUS as status, CD_LAST_ERROR as last_error_code from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where ID_DEPT_NURS_UNIT = ? and DA_BUSINESS = ? and CD_SHIFT = 'DAY'
                """, Long.valueOf(WARD_DEPARTMENT), BUSINESS_DATE);
        assertEquals(1, blocked.size());
        assertEquals("HERBAL", blocked.getFirst().get("medication_type_snapshot"));
        assertEquals("ROUTING_BLOCKED", blocked.getFirst().get("status"));
        assertEquals("ROUTE_TARGET_UNAVAILABLE", blocked.getFirst().get("last_error_code"));
    }

    private String admit(String commandCode) throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s",
                 "admissionTypeCode":"GENERAL","admissionSourceCode":"DIRECT",
                 "admissionReason":"住院供药自动路由专项测试","commandCode":"%s"}
                """.formatted(RESIDENT, BED, commandCode));
        recordInpatientNoKnownDrugAllergy(RESIDENT, admission.get("encounterId").asText());
        return admission.get("id").asText();
    }

    private String createPlannedMedication(String episodeId, String productId, String plannedAt,
                                           String commandPrefix) throws Exception {
        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"%s","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"QD","instructions":"自动路由专项验证",
                 "commandCode":"%s-ORDER"}
                """.formatted(episodeId, productId, commandPrefix));
        String requestId = order.get("id").asText();
        postJson("/api/inpatient/orders/" + requestId + "/sign", """
                {"expectedRevision":0,"allergyReviewConfirmed":true,"commandCode":"%s-SIGN"}
                """.formatted(commandPrefix));
        postJson("/api/inpatient/orders/" + requestId + "/verify", """
                {"expectedRevision":1,"commandCode":"%s-VERIFY"}
                """.formatted(commandPrefix));
        postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s"],"commandCode":"%s-PLAN"}
                """.formatted(plannedAt, commandPrefix));
        return requestId;
    }

    private JsonNode createHerbalRoute(String code) throws Exception {
        return postJson("/api/pharmacy/dispense-routes", """
                {"organizationId":"%s","code":"%s","name":"住院中药饮片专项药房",
                 "careSetting":"INPATIENT","sourceDepartmentId":"%s","medicationType":"HERBAL",
                 "targetStockSiteId":"%s","active":true,"validFrom":"2026-01-01",
                 "description":"中药饮片不得进入住院通用西药供药批次"}
                """.formatted(ORGANIZATION, code, WARD_DEPARTMENT, HERBAL_SITE));
    }

    private JsonNode route(String code) throws Exception {
        JsonNode response = json(mockMvc.perform(get("/api/pharmacy/dispense-routes")
                        .with(rhnWorkContext()).queryParam("organizationId", ORGANIZATION))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return StreamSupport.stream(response.spliterator(), false)
                .filter(value -> code.equals(value.get("code").asText()))
                .findFirst().orElseThrow();
    }

    private JsonNode setRouteActive(JsonNode route, boolean active) throws Exception {
        String medicationType = route.get("medicationType").isNull()
                ? "null" : "\"" + route.get("medicationType").asText() + "\"";
        String response = mockMvc.perform(put("/api/pharmacy/dispense-routes/{id}", route.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"organizationId":"%s","code":"%s","name":"%s",
                                 "careSetting":"%s","sourceDepartmentId":"%s","medicationType":%s,
                                 "targetStockSiteId":"%s","active":%s,"validFrom":"%s",
                                 "description":"%s"}
                                """.formatted(route.get("revision").asLong(), ORGANIZATION,
                                route.get("code").asText(), route.get("name").asText(),
                                route.get("careSetting").asText(), route.get("sourceDepartmentId").asText(),
                                medicationType, route.get("targetStockSiteId").asText(), active,
                                route.get("validFrom").asText(), route.get("description").asText())))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json(response);
    }

    private int routedLineCount(String stockSiteId, String requestId, String medicationType) {
        return count("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_LINE line
                  join RHN_SUP_INP_MED_SUPPLY_BATCH batch
                    on batch.ID_TNT = line.ID_TNT and batch.ID_INP_MED_SUPPLY_BATCH = line.ID_INP_MED_SUPPLY_BATCH
                  join RHN_EX_MED_REQ medication
                    on medication.ID_TNT = line.ID_TNT and medication.ID_CARE_REQ = line.ID_CARE_REQ
                 where batch.ID_STOCK_SITE = ? and line.ID_CARE_REQ = ?
                   and medication.SD_MED_TYPE_SNAP = ?
                """, stockSiteId, requestId, medicationType);
    }

    private int routedMedicationTypeCount(String stockSiteId, String medicationType) {
        return count("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_LINE line
                  join RHN_SUP_INP_MED_SUPPLY_BATCH batch
                    on batch.ID_TNT = line.ID_TNT and batch.ID_INP_MED_SUPPLY_BATCH = line.ID_INP_MED_SUPPLY_BATCH
                  join RHN_EX_MED_REQ medication
                    on medication.ID_TNT = line.ID_TNT and medication.ID_CARE_REQ = line.ID_CARE_REQ
                 where batch.ID_STOCK_SITE = ? and medication.SD_MED_TYPE_SNAP = ?
                """, stockSiteId, medicationType);
    }

    private int count(String sql, Object... arguments) {
        Object[] normalized = java.util.Arrays.stream(arguments).map(this::databaseValue).toArray();
        return jdbc.queryForObject(sql, Integer.class, normalized);
    }

    private Object databaseValue(Object value) {
        if (!(value instanceof String text)) return value;
        if (text.matches("\\d{15,19}")) return Long.valueOf(text);
        if (text.matches("\\d{4}-\\d{2}-\\d{2}T.*Z")) return Instant.parse(text);
        return text;
    }

    private JsonNode postJson(String path, String body) throws Exception {
        String response = mockMvc.perform(post(path).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString();
        return json(response);
    }
}
