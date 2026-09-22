package com.rhn;

import com.rhn.pharmacy.application.WardMedicationSupplyGenerationScheduler;
import com.rhn.platform.configuration.infrastructure.ConfigurationValueCache;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class InpatientSupplyAutoGenerationTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898514";
    private static final String PRODUCT = "362387869795111";
    private static final String DAY_JOB =
            "362387869790211:362387869898501:WESTERN:2026-09-05:DAY";

    @Autowired WardMedicationSupplyGenerationScheduler scheduler;
    @Autowired ConfigurationValueCache configurationCache;
    @Autowired JdbcTemplate jdbc;

    @Test
    void enabled_department_route_generates_one_durable_batch_without_impersonating_a_user() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s",
                 "admissionTypeCode":"GENERAL","admissionSourceCode":"DIRECT",
                 "admissionReason":"住院供药自动生成测试","commandCode":"IP-AUTO-SUPPLY-ADMIT"}
                """.formatted(RESIDENT, BED));
        String episodeId = admission.get("id").asString();
        recordInpatientNoKnownDrugAllergy(RESIDENT, admission.get("encounterId").asString());

        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"%s","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"BID","instructions":"自动生成供药批次",
                 "commandCode":"IP-AUTO-SUPPLY-ORDER"}
                """.formatted(episodeId, PRODUCT));
        String requestId = order.get("id").asString();
        postJson("/api/inpatient/orders/" + requestId + "/sign", """
                {"expectedRevision":0,"allergyReviewConfirmed":true,"commandCode":"IP-AUTO-SUPPLY-SIGN"}
                """);
        postJson("/api/inpatient/orders/" + requestId + "/verify", """
                {"expectedRevision":1,"commandCode":"IP-AUTO-SUPPLY-VERIFY"}
                """);
        postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,
                 "plannedTimes":["2026-09-05T01:00:00Z","2026-09-05T05:00:00Z"],
                 "commandCode":"IP-AUTO-SUPPLY-PLAN"}
                """);

        jdbc.update("""
                update RHN_SYS_PARAM_DEF set JSON_DEFAULT_VAL = 'true'
                 where CD_PARAM_KEY = 'pharmacy.inpatient-supply.auto-generation.enabled'
                """);
        configurationCache.invalidateAll();

        Instant discoveryTime = Instant.parse("2026-09-04T22:00:00Z");
        scheduler.pollAt(discoveryTime);

        assertEquals("SUCCEEDED", jdbc.queryForObject("""
                select SD_STATUS as status from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where CD_JOB_KEY = ?
                """, String.class, DAY_JOB));
        assertEquals(discoveryTime, jdbc.queryForObject("""
                select DT_CMPLD as completed_at from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where CD_JOB_KEY = ?
                """, OffsetDateTime.class, DAY_JOB).toInstant());
        Long batchId = jdbc.queryForObject("""
                select ID_INP_MED_SUPPLY_BATCH as batch_id from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where CD_JOB_KEY = ?
                """, Long.class, DAY_JOB);
        assertNotNull(batchId);
        assertEquals("AUTO", jdbc.queryForObject(
                "select SD_GEN_TRIGGER from RHN_SUP_INP_MED_SUPPLY_BATCH where ID_INP_MED_SUPPLY_BATCH = ?",
                String.class, batchId));
        assertNull(jdbc.queryForObject(
                "select ID_USER_CREATED as created_by from RHN_SUP_INP_MED_SUPPLY_BATCH where ID_INP_MED_SUPPLY_BATCH = ?",
                Long.class, batchId));
        assertEquals("WESTERN", jdbc.queryForObject(
                "select SD_MED_TYPE_SNAP as medication_type_snapshot from RHN_SUP_INP_MED_SUPPLY_BATCH where ID_INP_MED_SUPPLY_BATCH = ?",
                String.class, batchId));
        assertNotNull(jdbc.queryForObject(
                "select ID_DISP_ROUTE as dispense_route_id from RHN_SUP_INP_MED_SUPPLY_BATCH where ID_INP_MED_SUPPLY_BATCH = ?",
                Long.class, batchId));
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from RHN_SUP_INP_MED_SUPPLY_LINE where ID_INP_MED_SUPPLY_BATCH = ?",
                Integer.class, batchId));
        assertEquals(2, jdbc.queryForObject("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_TASK t
                 join RHN_SUP_INP_MED_SUPPLY_LINE l on l.ID_TNT = t.ID_TNT and l.ID_INP_MED_SUPPLY_LINE = t.ID_INP_MED_SUPPLY_LINE
                 where l.ID_INP_MED_SUPPLY_BATCH = ?
                """, Integer.class, batchId));

        scheduler.pollAt(discoveryTime);
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where CD_JOB_KEY = ?
                """, Integer.class, DAY_JOB));
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from RHN_SUP_INP_MED_SUPPLY_BATCH where ID_INP_MED_SUPPLY_BATCH = ?", Integer.class, batchId));

        Instant noDemandTime = Instant.parse("2026-09-05T22:00:00Z");
        scheduler.pollAt(noDemandTime);
        assertEquals(0, jdbc.queryForObject("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_GEN_RUN
                 where DA_BIZ = date '2026-09-06'
                """, Integer.class));
        assertEquals(1, jdbc.queryForObject(
                "select count(*) from RHN_SUP_INP_MED_SUPPLY_BATCH", Integer.class));
    }

    private JsonNode postJson(String path, String body) throws Exception {
        String response = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post(path).with(rhnWorkContext())
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString();
        return json(response);
    }
}
