package com.rhn;

import com.rhn.pharmacy.api.MedicationFulfillmentDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientOrderExecutionFlowTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898514";
    private static final String MEDICATION_PRODUCT = "362387869795111";
    private static final String SERVICE_ITEM = "362387869795101";

    @Autowired JdbcTemplate jdbcTemplate;
    @MockitoBean MedicationFulfillmentDirectory medicationFulfillment;

    @Test
    void shared_care_request_orders_cover_sign_verify_plan_execution_stop_and_historical_read() throws Exception {
        when(medicationFulfillment.fulfillmentForRequest(anyLong(), anyLong()))
                .thenReturn(MedicationFulfillmentDirectory.FulfillmentSnapshot.pending());
        when(medicationFulfillment.consume(any(MedicationFulfillmentDirectory.ConsumptionCommand.class)))
                .thenThrow(conflict("INPATIENT_MEDICATION_DISPENSE_REQUIRED",
                        "住院用药尚未形成药房发药明细，不能登记给药"));
        String episodeId = admit();

        String medicationBody = """
                {
                  "episodeId":"%s",
                  "orderCategory":"MEDICATION",
                  "durationType":"LONG_TERM",
                  "catalogItemId":"%s",
                  "dosageAmount":0.25,
                  "dosageUnit":"g",
                  "routeCode":"ORAL",
                  "frequencyCode":"TID",
                  "instructions":"口服，服药后观察",
                  "commandCode":"IP-ORDER-CREATE-MED-01"
                }
                """.formatted(episodeId, MEDICATION_PRODUCT);
        JsonNode medication = postJson("/api/inpatient/orders", medicationBody, 201);
        String medicationId = medication.get("id").asText();
        assertEquals("DRAFT", medication.get("status").asText());
        assertEquals("MEDICATION", medication.get("orderCategory").asText());
        assertEquals("阿莫西林胶囊 0.25g", medication.get("itemName").asText());

        JsonNode replay = postJson("/api/inpatient/orders", medicationBody, 201);
        assertEquals(medicationId, replay.get("id").asText());
        assertEquals(1, count("select count(*) from RHN_EX_CARE_REQ where ID_CARE_REQ = ?", medicationId));
        assertEquals(1, count("select count(*) from RHN_EX_MED_REQ where ID_CARE_REQ = ?", medicationId));
        assertEquals(1, count("select count(*) from RHN_EX_INP_ORDER_WF where ID_CARE_REQ = ?", medicationId));
        assertFalse(tableExists("INPATIENT_ORDERS"));

        recordInpatientNoKnownDrugAllergy(RESIDENT, medication.get("encounterId").asText());
        postJson("/api/inpatient/orders/" + medicationId + "/sign",
                medicationSign(0, "IP-ORDER-SIGN-MED-01"), 200);
        JsonNode signedReplay = postJson("/api/inpatient/orders/" + medicationId + "/sign",
                medicationSign(0, "IP-ORDER-SIGN-MED-01"), 200);
        assertEquals(1, signedReplay.get("revision").asInt());
        postJson("/api/inpatient/orders/" + medicationId + "/verify",
                revision(1, "IP-ORDER-VERIFY-MED-01"), 200);

        Instant now = Instant.now();
        String medicationPlan = plan(2, "IP-ORDER-PLAN-MED-01",
                now.minusSeconds(120), now.minusSeconds(60), now.plusSeconds(3600));
        JsonNode plannedMedication = postJson("/api/inpatient/orders/" + medicationId + "/plans",
                medicationPlan, 200);
        assertEquals(3, plannedMedication.get("tasks").size());
        JsonNode planReplay = postJson("/api/inpatient/orders/" + medicationId + "/plans",
                medicationPlan, 200);
        assertEquals(3, planReplay.get("tasks").size());
        String executeTaskId = plannedMedication.get("tasks").get(0).get("id").asText();
        String skipTaskId = plannedMedication.get("tasks").get(1).get("id").asText();
        String returnedMedicationTaskId = plannedMedication.get("tasks").get(2).get("id").asText();

        mockMvc.perform(get("/api/inpatient/order-tasks/nurse-worklist")
                        .with(rhnWorkContext()).queryParam("episodeId", episodeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks.length()").value(3))
                .andExpect(jsonPath("$.tasks[0].orderCategory").value("MEDICATION"))
                .andExpect(jsonPath("$.tasks[0].pharmacyFulfillmentRequired").value(true))
                .andExpect(jsonPath("$.tasks[0].pharmacyFulfilled").value(false))
                .andExpect(jsonPath("$.tasks[0].pharmacyFulfillmentStatus").value("NOT_INTAKE"));

        mockMvc.perform(post("/api/inpatient/order-tasks/{id}/execute", executeTaskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"outcomeCode":"GIVEN","note":"患者已服药",
                                 "commandCode":"IP-TASK-EXEC-MED-BEFORE-DISPENSE"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_MEDICATION_DISPENSE_REQUIRED"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("发药明细")));
        assertEquals("PLANNED", jdbcTemplate.queryForObject(
                "select SD_STATUS as status from RHN_EX_INP_ORDER_TASK where ID_INP_ORDER_TASK = ?", String.class, Long.valueOf(executeTaskId)));

        when(medicationFulfillment.fulfillmentForRequest(Long.valueOf(TENANT), Long.valueOf(medicationId)))
                .thenReturn(new MedicationFulfillmentDirectory.FulfillmentSnapshot(
                        true, 998877L, BigDecimal.ONE, "COMPLETED"));
        MedicationFulfillmentDirectory.ConsumptionAllocation consumption =
                new MedicationFulfillmentDirectory.ConsumptionAllocation(
                        998876L, 998875L, 998877L, 998878L, BigDecimal.ONE, "粒",
                        BigDecimal.ONE, "粒", "IP-TASK-EXEC-MED-01", Instant.now());
        when(medicationFulfillment.consume(argThat(value -> value != null && executeTaskId.equals(
                value.consumerId().toString()))))
                .thenReturn(new MedicationFulfillmentDirectory.ConsumptionSnapshot(
                        BigDecimal.ONE, "粒", List.of(consumption)));
        when(medicationFulfillment.consumptionsFor(Long.valueOf(TENANT), "INPATIENT_ORDER_TASK",
                Long.valueOf(executeTaskId))).thenReturn(List.of(consumption));
        mockMvc.perform(get("/api/inpatient/order-tasks/nurse-worklist")
                        .with(rhnWorkContext()).queryParam("episodeId", episodeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[0].pharmacyFulfilled").value(true))
                .andExpect(jsonPath("$.tasks[0].dispenseId").value(998877L))
                .andExpect(jsonPath("$.tasks[0].netDispensedQuantity").value(1))
                .andExpect(jsonPath("$.tasks[0].pharmacyFulfillmentStatus").value("COMPLETED"));

        postJson("/api/inpatient/order-tasks/" + executeTaskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"GIVEN","note":"患者已服药", "commandCode":"IP-TASK-EXEC-MED-01"}
                """, 200);
        JsonNode taskReplay = postJson("/api/inpatient/order-tasks/" + executeTaskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"GIVEN","note":"患者已服药", "commandCode":"IP-TASK-EXEC-MED-01"}
                """, 200);
        assertEquals("EXECUTED", taskReplay.get("status").asText());
        assertEquals(998878L, taskReplay.get("medicationConsumptions").get(0).get("dispenseLineId").asLong());
        mockMvc.perform(post("/api/inpatient/order-tasks/{id}/execute", executeTaskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"commandCode":"IP-TASK-EXEC-MED-STALE"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_TASK_REVISION_CONFLICT"));

        when(medicationFulfillment.fulfillmentForRequest(Long.valueOf(TENANT), Long.valueOf(medicationId)))
                .thenReturn(MedicationFulfillmentDirectory.FulfillmentSnapshot.pending());
        postJson("/api/inpatient/order-tasks/" + skipTaskId + "/skip", """
                {"expectedRevision":0,"outcomeCode":"PATIENT_REFUSED","note":"患者拒绝本次给药", "commandCode":"IP-TASK-SKIP-MED-01"}
                """, 200);
        when(medicationFulfillment.fulfillmentForRequest(Long.valueOf(TENANT), Long.valueOf(medicationId)))
                .thenReturn(new MedicationFulfillmentDirectory.FulfillmentSnapshot(
                        false, 998877L, BigDecimal.ZERO, "RETURNED"));
        when(medicationFulfillment.consume(argThat(value -> value != null && returnedMedicationTaskId.equals(
                value.consumerId().toString()))))
                .thenThrow(conflict("INPATIENT_MEDICATION_DISPENSE_QUANTITY_INSUFFICIENT",
                        "住院用药可核销净发药数量不足；退药后可用 0 粒"));
        mockMvc.perform(post("/api/inpatient/order-tasks/{id}/execute", returnedMedicationTaskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"outcomeCode":"GIVEN",
                                 "commandCode":"IP-TASK-EXEC-MED-AFTER-RETURN"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_MEDICATION_DISPENSE_QUANTITY_INSUFFICIENT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("退药后")));
        JsonNode stoppedMedication = postJson("/api/inpatient/orders/" + medicationId + "/stop", """
                {"expectedRevision":3,"reason":"调整治疗方案","commandCode":"IP-ORDER-STOP-MED-01"}
                """, 200);
        assertEquals("STOPPED", stoppedMedication.get("status").asText());
        assertEquals("EXECUTED", stoppedMedication.get("tasks").get(0).get("status").asText());
        assertEquals("SKIPPED", stoppedMedication.get("tasks").get(1).get("status").asText());
        assertEquals("CANCELLED", stoppedMedication.get("tasks").get(2).get("status").asText());

        String serviceId = createAndCompleteService(episodeId, now.minusSeconds(30));
        String nursingId = createAndCompleteNursing(episodeId, now.minusSeconds(20));
        assertEquals(1, count("select count(*) from RHN_EX_SVC_REQ where ID_CARE_REQ = ?", serviceId));
        assertEquals(0, count("select count(*) from RHN_EX_MED_REQ where ID_CARE_REQ = ?", serviceId));
        assertEquals("CARE_ACTIVITY", jdbcTemplate.queryForObject(
                "select SD_REQ_KIND as request_kind from RHN_EX_CARE_REQ where ID_CARE_REQ = ?", String.class, Long.valueOf(nursingId)));
        assertEquals(3, count("select count(*) from RHN_EX_CARE_REQ where ID_ENC = (select ID_ENC as encounter_id from RHN_EX_CARE_REQ where ID_CARE_REQ = ?)", medicationId));
        assertEquals(17, count("select count(*) from RHN_EX_INP_ORDER_EVT", null));

        mockMvc.perform(get("/api/inpatient/orders/doctor-worklist")
                        .with(rhnWorkContext()).queryParam("episodeId", episodeId).queryParam("status", "ALL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orders.length()").value(3));

        String encounterId = medication.get("encounterId").asText();
        prepareSignedDischargeRecord(RESIDENT, encounterId, "ORDER-FLOW");
        recordPrimaryDischargeDiagnosis(episodeId, 0, "J18.900", "肺炎", "ORDER-FLOW-DIAGNOSIS");
        discharge(episodeId);
        mockMvc.perform(get("/api/inpatient/orders/doctor-worklist")
                        .with(rhnWorkContext()).queryParam("episodeId", episodeId).queryParam("status", "ALL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orders.length()").value(3));
        mockMvc.perform(get("/api/inpatient/order-tasks/nurse-worklist")
                        .with(rhnWorkContext()).queryParam("episodeId", episodeId).queryParam("status", "ALL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks.length()").value(5));
        mockMvc.perform(post("/api/inpatient/orders/{id}/plans", nursingId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(plan(4, "IP-ORDER-PLAN-AFTER-DISCHARGE", now.plusSeconds(7200))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_EPISODE_NOT_ADMITTED"));
    }

    private String createAndCompleteService(String episodeId, Instant plannedAt) throws Exception {
        JsonNode created = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"SERVICE","durationType":"TEMPORARY",
                 "catalogItemId":"%s","instructions":"采集静脉血完成血细胞分析", "commandCode":"IP-ORDER-CREATE-SRV-01"}
                """.formatted(episodeId, SERVICE_ITEM), 201);
        String id = created.get("id").asText();
        postJson("/api/inpatient/orders/" + id + "/sign", revision(0, "IP-ORDER-SIGN-SRV-01"), 200);
        postJson("/api/inpatient/orders/" + id + "/verify", revision(1, "IP-ORDER-VERIFY-SRV-01"), 200);
        JsonNode planned = postJson("/api/inpatient/orders/" + id + "/plans",
                plan(2, "IP-ORDER-PLAN-SRV-01", plannedAt), 200);
        String taskId = planned.get("tasks").get(0).get("id").asText();
        postJson("/api/inpatient/order-tasks/" + taskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"IP-TASK-EXEC-SRV-01"}
                """, 200);
        assertEquals("COMPLETED", jdbcTemplate.queryForObject(
                "select SD_STATUS as status from RHN_EX_CARE_REQ where ID_CARE_REQ = ?", String.class, Long.valueOf(id)));
        return id;
    }

    private String createAndCompleteNursing(String episodeId, Instant plannedAt) throws Exception {
        JsonNode created = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"NURSING","durationType":"TEMPORARY",
                 "itemCode":"NUR-FASTING","itemName":"检查前禁食","instructions":"午夜后禁食禁饮",
                 "commandCode":"IP-ORDER-CREATE-NUR-01"}
                """.formatted(episodeId), 201);
        String id = created.get("id").asText();
        postJson("/api/inpatient/orders/" + id + "/sign", revision(0, "IP-ORDER-SIGN-NUR-01"), 200);
        postJson("/api/inpatient/orders/" + id + "/verify", revision(1, "IP-ORDER-VERIFY-NUR-01"), 200);
        JsonNode planned = postJson("/api/inpatient/orders/" + id + "/plans",
                plan(2, "IP-ORDER-PLAN-NUR-01", plannedAt), 200);
        String taskId = planned.get("tasks").get(0).get("id").asText();
        postJson("/api/inpatient/order-tasks/" + taskId + "/skip", """
                {"expectedRevision":0,"outcomeCode":"NOT_APPLICABLE","note":"检查取消",
                 "commandCode":"IP-TASK-SKIP-NUR-01"}
                """, 200);
        return id;
    }

    private String admit() throws Exception {
        JsonNode response = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"OUTPATIENT","admissionReason":"住院医嘱流程测试",
                 "commandCode":"IP-ORDER-FLOW-ADMIT"}
                """.formatted(RESIDENT, BED), 201);
        return response.get("id").asText();
    }

    private void discharge(String episodeId) throws Exception {
        postJson("/api/inpatient/episodes/" + episodeId + "/discharge", """
                {"expectedRevision":0,"dispositionCode":"HOME","note":"测试出院",
                 "commandCode":"IP-ORDER-FLOW-DISCHARGE"}
                """, 200);
    }

    private JsonNode postJson(String path, String body, int expectedStatus) throws Exception {
        String response = mockMvc.perform(post(path).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        return json(response);
    }

    private static String revision(long revision, String commandCode) {
        return "{\"expectedRevision\":" + revision + ",\"commandCode\":\"" + commandCode + "\"}";
    }

    private static String medicationSign(long revision, String commandCode) {
        return "{\"expectedRevision\":" + revision + ",\"allergyReviewConfirmed\":true,\"commandCode\":\""
                + commandCode + "\"}";
    }

    private static String plan(long revision, String commandCode, Instant... times) {
        String values = java.util.Arrays.stream(times).map(value -> "\"" + value + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        return "{\"expectedRevision\":" + revision + ",\"plannedTimes\":[" + values
                + "],\"commandCode\":\"" + commandCode + "\"}";
    }

    private int count(String sql, String id) {
        if (id == null) return jdbcTemplate.queryForObject(sql, Integer.class);
        return jdbcTemplate.queryForObject(sql, Integer.class, Long.valueOf(id));
    }

    private boolean tableExists(String name) {
        Integer value = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables where upper(table_name) = ?", Integer.class, name);
        return value != null && value > 0;
    }
}
