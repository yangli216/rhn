package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
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
class WardMedicationReturnFlowTest extends RhnIntegrationTestSupport {
    private static final String INPATIENT_PHARMACY_DEPARTMENT = "362387869799104";
    private static final String WARD_DEPARTMENT = "362387869898501";
    private static final String INPATIENT_STOCK_SITE = "362387869799503";
    private static final String INPATIENT_STOCK_ITEM = "362387869898703";
    private static final String PHARMACIST = "362387869799301";
    private static final String PHARMACIST_ASSIGNMENT = "362387869898701";
    private static final ZoneId ORGANIZATION_ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired JdbcTemplate jdbc;

    @Test
    void ward_returns_only_received_unconsumed_medication_and_replay_does_not_duplicate_ledger_or_charge()
            throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"362387869790213","bedId":"362387869898514",
                 "admissionTypeCode":"GENERAL","admissionSourceCode":"DIRECT",
                 "admissionReason":"病区余药反向交接测试","commandCode":"WMR-ADMIT"}
                """, rhnWorkContext(), 201);
        String episodeId = admission.get("id").asText();
        String encounterId = admission.get("encounterId").asText();
        recordInpatientNoKnownDrugAllergy("362387869790213", encounterId);

        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"362387869795111","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"TID","instructions":"饭后口服",
                 "commandCode":"WMR-ORDER"}
                """.formatted(episodeId), rhnWorkContext(), 201);
        String requestId = order.get("id").asText();
        postJson("/api/inpatient/orders/" + requestId + "/sign",
                medicationSign(0, "WMR-SIGN"), rhnWorkContext(), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                revision(1, "WMR-VERIFY"), rhnWorkContext(), 200);
        LocalDate supplyDate = LocalDate.now(ORGANIZATION_ZONE).plusDays(1);
        JsonNode plan = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s","%s"],"commandCode":"WMR-PLAN"}
                """.formatted(atSupplyTime(supplyDate, 9), atSupplyTime(supplyDate, 13)),
                rhnWorkContext(), 200);
        String firstTaskId = plan.at("/tasks/0/id").asText();
        String secondTaskId = plan.at("/tasks/1/id").asText();

        JsonNode supplyBatch = postJson("/api/pharmacy/ward-supply-batches", """
                {"stockSiteId":"%s","nursingUnitDepartmentId":"%s","businessDate":"%s",
                 "shiftCode":"DAY","commandCode":"WMR-SUPPLY"}
                """.formatted(INPATIENT_STOCK_SITE, order.get("departmentId").asText(), supplyDate),
                pharmacyContext(), 201);
        JsonNode supplyLine = postJson("/api/pharmacy/ward-supply-lines/"
                + supplyBatch.at("/lines/0/id").asText() + "/intake", """
                {"stockItemId":"%s","description":"两剂摆药"}
                """.formatted(INPATIENT_STOCK_ITEM), pharmacyContext(), 201);
        String dispenseTaskId = supplyLine.get("dispenseTaskId").asText();
        postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/reviews", """
                {"result":"PASS","pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
        postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/reservations",
                "{\"expiryMinutes\":30}", pharmacyContext(), 200);
        postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/picking/complete", """
                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
        JsonNode dispense = postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/dispenses", """
                {"requestCode":"WMR-DISPENSE","operationQuantity":2,
                 "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s","description":"送病区"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 201);
        String dispenseId = dispense.get("id").asText();
        String dispenseLineId = dispense.at("/lines/0/id").asText();

        JsonNode delivery = postJson("/api/pharmacy/ward-deliveries", """
                {"deliveryNo":"WMR-DELIVERY","dispenseIds":["%s"]}
                """.formatted(dispenseId), pharmacyContext(), 201);
        String deliveryId = delivery.get("id").asText();
        String deliveryLineId = delivery.at("/lines/0/id").asText();
        postJson("/api/pharmacy/ward-deliveries/" + deliveryId + "/dispatch", """
                {"expectedRevision":0,"commandCode":"WMR-DISPATCH"}
                """, pharmacyContext(), 200);

        mockMvc.perform(get("/api/pharmacy/ward-medication-returns/returnable")
                        .with(wardContext()).queryParam("encounterId", encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(post("/api/pharmacy/ward-medication-returns").with(wardContext())
                        .contentType(MediaType.APPLICATION_JSON).content(createBody(
                                encounterId, dispenseLineId, "WMR-CREATE-BEFORE-RECEIPT")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WARD_MED_RETURN_DELIVERY_NOT_RECEIVED"));

        postJson("/api/pharmacy/ward-deliveries/" + deliveryId + "/receive", """
                {"expectedRevision":1,"commandCode":"WMR-FORWARD-RECEIVE",
                 "lines":[{"lineId":"%s","receivedQuantity":2}]}
                """.formatted(deliveryLineId), wardContext(), 200);
        postJson("/api/inpatient/order-tasks/" + firstTaskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"WMR-EXECUTE-1"}
                """, rhnWorkContext(), 200);

        mockMvc.perform(get("/api/pharmacy/ward-medication-returns/returnable")
                        .with(wardContext()).queryParam("encounterId", encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].issuedQuantity").value(2))
                .andExpect(jsonPath("$[0].consumedQuantity").value(1))
                .andExpect(jsonPath("$[0].returnableQuantity").value(1));

        mockMvc.perform(post("/api/pharmacy/ward-medication-returns").with(otherWardContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(encounterId, dispenseLineId, "WMR-CREATE-OTHER-WARD")))
                .andExpect(status().isForbidden());

        String createBody = createBody(encounterId, dispenseLineId, "WMR-CREATE");
        JsonNode request = postJson("/api/pharmacy/ward-medication-returns", createBody,
                wardContext(), 201);
        JsonNode createReplay = postJson("/api/pharmacy/ward-medication-returns", createBody,
                wardContext(), 201);
        assertEquals(request.get("id").asText(), createReplay.get("id").asText());
        String returnRequestId = request.get("id").asText();
        String returnRequestLineId = request.at("/lines/0/id").asText();
        assertEquals(1, countId("select count(*) from RHN_SUP_WARD_MED_RETURN_REQ where ID_WARD_MED_RETURN_REQ = ?", returnRequestId));

        mockMvc.perform(get("/api/pharmacy/ward-medication-returns/returnable")
                        .with(wardContext()).queryParam("encounterId", encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(post("/api/inpatient/order-tasks/{taskId}/execute", secondTaskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"outcomeCode":"COMPLETED",
                                 "commandCode":"WMR-EXECUTE-RESERVED-RETURN"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_MEDICATION_DISPENSE_QUANTITY_INSUFFICIENT"));

        String handoverBody = """
                {"expectedRevision":0,"commandCode":"WMR-HANDOVER","note":"护士与配送员当面交接"}
                """;
        JsonNode inTransit = postJson("/api/pharmacy/ward-medication-returns/" + returnRequestId + "/handover",
                handoverBody, wardContext(), 200);
        JsonNode handoverReplay = postJson("/api/pharmacy/ward-medication-returns/" + returnRequestId + "/handover",
                handoverBody, wardContext(), 200);
        assertEquals("IN_TRANSIT", inTransit.get("status").asText());
        assertEquals(1, handoverReplay.get("revision").asInt());
        mockMvc.perform(post("/api/pharmacy/ward-medication-returns/{id}/handover", returnRequestId)
                        .with(wardContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"commandCode":"WMR-HANDOVER-STALE"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WARD_MED_RETURN_REVISION_CONFLICT"));

        String receiveBody = """
                {"expectedRevision":1,"commandCode":"WMR-PHARMACY-RECEIVE",
                 "processorPractitionerId":"%s","processorAssignmentId":"%s",
                 "note":"未用一粒验收后重新入库",
                 "lines":[{"returnRequestLineId":"%s","disposition":"RESTOCK"}]}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT, returnRequestLineId);
        JsonNode received = postJson("/api/pharmacy/ward-medication-returns/" + returnRequestId + "/receive",
                receiveBody, pharmacyContext(), 200);
        int stockReturnCount = countText("select count(*) from RHN_SUP_STOCK_RETURN where CD_RETURN_NO like ?", "WMR%");
        int inventoryTransactionCount = countText(
                "select count(*) from RHN_SUP_INV_TXN where CD_REQ like ?", "WMR%");
        int returnChargeCount = countId("select count(*) from RHN_BIL_CHARGE_ITEM where ID_CARE_REQ = ? "
                + "and SD_SRC_TYPE = 'MEDICATION_RETURN'", requestId);
        JsonNode receiveReplay = postJson("/api/pharmacy/ward-medication-returns/" + returnRequestId + "/receive",
                receiveBody, pharmacyContext(), 200);
        assertEquals("RECEIVED", received.get("status").asText());
        assertEquals(received.at("/lines/0/stockReturnId").asText(),
                receiveReplay.at("/lines/0/stockReturnId").asText());
        assertEquals(1, stockReturnCount);
        assertEquals(stockReturnCount,
                countText("select count(*) from RHN_SUP_STOCK_RETURN where CD_RETURN_NO like ?", "WMR%"));
        assertEquals(2, inventoryTransactionCount);
        assertEquals(inventoryTransactionCount,
                countText("select count(*) from RHN_SUP_INV_TXN where CD_REQ like ?", "WMR%"));
        assertEquals(1, returnChargeCount);
        assertEquals(returnChargeCount, countId("select count(*) from RHN_BIL_CHARGE_ITEM where ID_CARE_REQ = ? "
                + "and SD_SRC_TYPE = 'MEDICATION_RETURN'", requestId));
        assertDecimal("1", jdbc.queryForObject("select QTY_ACCEPTED as quantity_accepted from RHN_SUP_STOCK_RETURN_LINE "
                + "where ID_STOCK_RETURN = ?", BigDecimal.class,
                received.at("/lines/0/stockReturnId").asLong()));
        assertEquals(1, countId("select count(*) from RHN_SUP_WARD_MED_RETURN_EVT where ID_WARD_MED_RETURN_REQ = ? "
                + "and SD_EVT_TYPE = 'RECEIVED'", returnRequestId));
    }

    private String createBody(String encounterId, String dispenseLineId, String commandCode) {
        return """
                {"encounterId":"%s","commandCode":"%s","note":"患者未使用，申请退回",
                 "lines":[{"originalDispenseLineId":"%s","quantity":1}]}
                """.formatted(encounterId, commandCode, dispenseLineId);
    }

    private RequestPostProcessor pharmacyContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", INPATIENT_PHARMACY_DEPARTMENT);
            return request;
        };
    }

    private RequestPostProcessor otherWardContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", DEPARTMENT);
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

    private int countId(String sql, String value) {
        return jdbc.queryForObject(sql, Integer.class, Long.valueOf(value));
    }

    private int countText(String sql, String value) {
        return jdbc.queryForObject(sql, Integer.class, value);
    }

    private void assertDecimal(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual));
    }

    private static Instant atSupplyTime(LocalDate date, int hour) {
        return date.atTime(LocalTime.of(hour, 0)).atZone(ORGANIZATION_ZONE).toInstant();
    }
}
