package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class WardMedicationDeliveryFlowTest extends RhnIntegrationTestSupport {
    private static final String INPATIENT_PHARMACY_DEPARTMENT = "362387869799104";
    private static final String INPATIENT_STOCK_SITE = "362387869799503";
    private static final String INPATIENT_STOCK_ITEM = "362387869898703";
    private static final String PHARMACIST = "362387869799301";
    private static final String PHARMACIST_ASSIGNMENT = "362387869898701";
    private static final String WARD_DEPARTMENT = "362387869898501";
    private static final ZoneId ORGANIZATION_ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired JdbcTemplate jdbc;

    @Test
    void inpatient_dispense_is_dispatched_received_and_discrepancy_resolved_as_separate_facts() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"362387869790213","bedId":"362387869898514",
                 "admissionTypeCode":"GENERAL","admissionSourceCode":"DIRECT",
                 "admissionReason":"病区配送交接测试","commandCode":"IP-WD-ADMIT"}
                """, rhnWorkContext(), 201);
        String episodeId = admission.get("id").asText();
        recordInpatientNoKnownDrugAllergy("362387869790213", admission.get("encounterId").asText());

        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"362387869795111","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"TID","instructions":"饭后口服",
                 "commandCode":"IP-WD-ORDER"}
                """.formatted(episodeId), rhnWorkContext(), 201);
        String requestId = order.get("id").asText();
        postJson("/api/inpatient/orders/" + requestId + "/sign", medicationSign(0, "IP-WD-SIGN"), rhnWorkContext(), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify", revision(1, "IP-WD-VERIFY"), rhnWorkContext(), 200);
        LocalDate supplyDate = LocalDate.now(ORGANIZATION_ZONE).plusDays(1);
        JsonNode planned = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s","%s","%s"],"commandCode":"IP-WD-PLAN"}
                """.formatted(atSupplyTime(supplyDate, 9), atSupplyTime(supplyDate, 11),
                atSupplyTime(supplyDate, 13)), rhnWorkContext(), 200);
        String firstOrderTaskId = planned.at("/tasks/0/id").asText();
        String secondOrderTaskId = planned.at("/tasks/1/id").asText();
        String thirdOrderTaskId = planned.at("/tasks/2/id").asText();

        JsonNode supplyBatch = postJson("/api/pharmacy/ward-supply-batches", """
                {"stockSiteId":"%s","nursingUnitDepartmentId":"%s","businessDate":"%s",
                 "shiftCode":"DAY","commandCode":"IP-WD-SUPPLY"}
                """.formatted(INPATIENT_STOCK_SITE, order.get("departmentId").asText(), supplyDate),
                pharmacyContext(), 201);
        JsonNode taskLine = postJson("/api/pharmacy/ward-supply-lines/"
                + supplyBatch.at("/lines/0/id").asText() + "/intake", """
                {"stockItemId":"%s","description":"三次给药摆药"}
                """.formatted(INPATIENT_STOCK_ITEM), pharmacyContext(), 201);
        String taskId = taskLine.get("dispenseTaskId").asText();
        postJson("/api/pharmacy/dispense-tasks/" + taskId + "/reviews", """
                {"result":"PASS","pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
        postJson("/api/pharmacy/dispense-tasks/" + taskId + "/reservations",
                "{\"expiryMinutes\":30}", pharmacyContext(), 200);
        postJson("/api/pharmacy/dispense-tasks/" + taskId + "/picking/complete", """
                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);

        JsonNode firstDispense = dispense(taskId, "IP-WD-DISPENSE-1");
        JsonNode secondDispense = dispense(taskId, "IP-WD-DISPENSE-2");
        JsonNode firstDelivery = postJson("/api/pharmacy/ward-deliveries", """
                {"deliveryNo":"IP-WD-DELIVERY-1","dispenseIds":["%s","%s"],"note":"送综合病区"}
                """.formatted(firstDispense.get("id").asText(), secondDispense.get("id").asText()),
                pharmacyContext(), 201);
        assertEquals("PENDING_DISPATCH", firstDelivery.get("status").asText());
        assertEquals("综合病区", firstDelivery.get("nursingUnitName").asText());
        assertEquals("阿莫西林胶囊 0.25g", firstDelivery.at("/lines/0/medicationName").asText());
        String firstDeliveryId = firstDelivery.get("id").asText();
        String firstLineId = firstDelivery.at("/lines/0/id").asText();
        String secondLineId = firstDelivery.at("/lines/1/id").asText();
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_MEDICATION_DELIVERY_PENDING_DISPATCH')].count")
                        .value(1));

        JsonNode dispatched = postJson("/api/pharmacy/ward-deliveries/" + firstDeliveryId + "/dispatch", """
                {"expectedRevision":0,"commandCode":"IP-WD-DISPATCH-1","note":"药师交出"}
                """, pharmacyContext(), 200);
        assertEquals("IN_TRANSIT", dispatched.get("status").asText());
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_MEDICATION_DELIVERY_IN_TRANSIT')].count")
                        .value(1));
        Instant shiftFrom = Instant.now().minusSeconds(60 * 60);
        Instant shiftTo = Instant.now().plusSeconds(8 * 60 * 60);
        mockMvc.perform(get("/api/inpatient/ward-board").with(wardContext())
                        .queryParam("from", shiftFrom.toString()).queryParam("to", shiftTo.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.awaitingReceiptPatientCount").value(1))
                .andExpect(jsonPath("$.metrics.awaitingReceiptBatchCount").value(1))
                .andExpect(jsonPath("$.patients[0].awaitingReceiptCount").value(1));
        mockMvc.perform(post("/api/inpatient/order-tasks/{taskId}/execute", firstOrderTaskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"outcomeCode":"COMPLETED",
                                 "commandCode":"IP-WD-EXECUTE-BEFORE-RECEIPT"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_MEDICATION_WARD_RECEIPT_REQUIRED"));
        assertEquals(0, jdbc.queryForObject("select count(*) from inpatient_med_consumptions", Integer.class));
        JsonNode received = postJson("/api/pharmacy/ward-deliveries/" + firstDeliveryId + "/receive", """
                {"expectedRevision":1,"commandCode":"IP-WD-RECEIVE-1","note":"数量无误",
                 "lines":[{"lineId":"%s","receivedQuantity":1},
                          {"lineId":"%s","receivedQuantity":1}]}
                """.formatted(firstLineId, secondLineId), rhnWorkContext(), 200);
        assertEquals("RECEIVED", received.get("status").asText());
        assertEquals("MATCHED", received.at("/lines/0/status").asText());
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_MEDICATION_DELIVERY_IN_TRANSIT')]").isEmpty());
        postJson("/api/inpatient/order-tasks/" + firstOrderTaskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"IP-WD-EXECUTE-AFTER-RECEIPT"}
                """, rhnWorkContext(), 200);
        postJson("/api/inpatient/order-tasks/" + secondOrderTaskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"IP-WD-EXECUTE-SECOND-RECEIPT"}
                """, rhnWorkContext(), 200);
        assertEquals(2, jdbc.queryForObject("select count(*) from inpatient_med_consumptions", Integer.class));

        JsonNode thirdDispense = dispense(taskId, "IP-WD-DISPENSE-3");
        JsonNode secondDelivery = postJson("/api/pharmacy/ward-deliveries", """
                {"deliveryNo":"IP-WD-DELIVERY-2","dispenseIds":["%s"]}
                """.formatted(thirdDispense.get("id").asText()), pharmacyContext(), 201);
        String secondDeliveryId = secondDelivery.get("id").asText();
        String thirdLineId = secondDelivery.at("/lines/0/id").asText();
        postJson("/api/pharmacy/ward-deliveries/" + secondDeliveryId + "/dispatch", """
                {"expectedRevision":0,"commandCode":"IP-WD-DISPATCH-2"}
                """, pharmacyContext(), 200);
        JsonNode discrepancy = postJson("/api/pharmacy/ward-deliveries/" + secondDeliveryId + "/receive", """
                {"expectedRevision":1,"commandCode":"IP-WD-RECEIVE-2","note":"现场逐项核对",
                 "lines":[{"lineId":"%s","receivedQuantity":0,"discrepancyCode":"SHORTAGE",
                            "discrepancyNote":"配送袋内短少 1 粒"}]}
                """.formatted(thirdLineId), rhnWorkContext(), 200);
        assertEquals("DISCREPANCY", discrepancy.get("status").asText());
        assertEquals("SHORTAGE", discrepancy.at("/lines/0/status").asText());
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_MEDICATION_DELIVERY_DISCREPANCY')].count")
                        .value(1));

        JsonNode resolved = postJson("/api/pharmacy/ward-deliveries/" + secondDeliveryId + "/resolve", """
                {"expectedRevision":2,"commandCode":"IP-WD-RESOLVE-2",
                 "resolutionCode":"ACCEPTED_VARIANCE","note":"病区确认按实际签收零粒处理"}
                """, pharmacyContext(), 200);
        assertEquals("RESOLVED", resolved.get("status").asText());
        assertEquals("ACCEPTED_VARIANCE", resolved.get("resolutionCode").asText());
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_MEDICATION_DELIVERY_DISCREPANCY')]").isEmpty());
        mockMvc.perform(post("/api/inpatient/order-tasks/{taskId}/execute", thirdOrderTaskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"outcomeCode":"COMPLETED",
                                 "commandCode":"IP-WD-EXECUTE-AFTER-ZERO-RECEIPT"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_MEDICATION_WARD_RECEIPT_REQUIRED"));
        assertEquals(2, jdbc.queryForObject("select count(*) from inpatient_med_consumptions", Integer.class));

        mockMvc.perform(get("/api/pharmacy/ward-deliveries").with(rhnWorkContext())
                        .queryParam("status", "ALL").queryParam("encounterId", admission.get("encounterId").asText()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(2)));
        assertEquals(7, jdbc.queryForObject("select count(*) from ward_delivery_events", Integer.class));
    }

    private JsonNode dispense(String taskId, String requestCode) throws Exception {
        return postJson("/api/pharmacy/dispense-tasks/" + taskId + "/dispenses", """
                {"requestCode":"%s","operationQuantity":1,
                 "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s"}
                """.formatted(requestCode, PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 201);
    }

    private RequestPostProcessor pharmacyContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", INPATIENT_PHARMACY_DEPARTMENT);
            return request;
        };
    }

    private RequestPostProcessor wardContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", WARD_DEPARTMENT);
            return request;
        };
    }

    private JsonNode postJson(String path, String body, RequestPostProcessor context, int expectedStatus)
            throws Exception {
        String response = mockMvc.perform(post(path).with(context).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString();
        return json(response);
    }

    private static String revision(long value, String commandCode) {
        return "{\"expectedRevision\":" + value + ",\"commandCode\":\"" + commandCode + "\"}";
    }

    private static String medicationSign(long value, String commandCode) {
        return "{\"expectedRevision\":" + value + ",\"allergyReviewConfirmed\":true,\"commandCode\":\""
                + commandCode + "\"}";
    }

    private static Instant atSupplyTime(LocalDate date, int hour) {
        return date.atTime(LocalTime.of(hour, 0)).atZone(ORGANIZATION_ZONE).toInstant();
    }
}
