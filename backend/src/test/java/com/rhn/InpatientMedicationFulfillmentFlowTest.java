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

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class InpatientMedicationFulfillmentFlowTest extends RhnIntegrationTestSupport {
    private static final String INPATIENT_PHARMACY_DEPARTMENT = "362387869799104";
    private static final String INPATIENT_STOCK_SITE = "362387869799503";
    private static final String INPATIENT_STOCK_ITEM = "362387869898703";
    private static final String PHARMACIST = "362387869799301";
    private static final String PHARMACIST_ASSIGNMENT = "362387869898701";
    private static final ZoneId ORGANIZATION_ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired JdbcTemplate jdbc;

    @Test
    void two_administrations_require_two_issued_units_and_only_unconsumed_unit_can_be_returned() throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"362387869790213","bedId":"362387869898514",
                 "admissionTypeCode":"GENERAL","admissionSourceCode":"DIRECT",
                 "admissionReason":"住院药品履约闭环测试","commandCode":"IP-MED-FLOW-ADMIT"}
                """, rhnWorkContext(), 201);
        String episodeId = admission.get("id").asText();
        recordInpatientNoKnownDrugAllergy("362387869790213", admission.get("encounterId").asText());

        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"362387869795111","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"TID","instructions":"饭后口服",
                 "commandCode":"IP-MED-FLOW-ORDER"}
                """.formatted(episodeId), rhnWorkContext(), 201);
        String requestId = order.get("id").asText();
        postJson("/api/inpatient/orders/" + requestId + "/sign",
                medicationSign(0, "IP-MED-FLOW-SIGN"), rhnWorkContext(), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                revision(1, "IP-MED-FLOW-VERIFY"), rhnWorkContext(), 200);
        LocalDate supplyDate = LocalDate.now(ORGANIZATION_ZONE).plusDays(1);
        JsonNode plan = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s","%s"],
                 "commandCode":"IP-MED-FLOW-PLAN"}
                """.formatted(atSupplyTime(supplyDate, 9, 0), atSupplyTime(supplyDate, 13, 0)),
                rhnWorkContext(), 200);
        String firstTaskId = plan.at("/tasks/0/id").asText();
        String secondTaskId = plan.at("/tasks/1/id").asText();

        assertMoney("1", jdbc.queryForObject("select quantity from medication_requests where request_id = ?",
                BigDecimal.class, Long.valueOf(requestId)));
        assertMoney("0.533333", jdbc.queryForObject("select total_amount from care_requests where id = ?",
                BigDecimal.class, Long.valueOf(requestId)));

        JsonNode supplyBatch = generateSupplyBatch(supplyDate, order.get("departmentId").asText(),
                "IP-MED-FLOW-SUPPLY");
        JsonNode supplyLine = supplyBatch.at("/lines/0");
        assertEquals(2, supplyLine.get("occurrenceCount").asInt());
        JsonNode intakenLine = postJson("/api/pharmacy/ward-supply-lines/" + supplyLine.get("id").asText()
                + "/intake", """
                {"stockItemId":"%s","description":"住院病区两剂摆药"}
                """.formatted(INPATIENT_STOCK_ITEM), pharmacyContext(), 201);
        String dispenseTaskId = intakenLine.get("dispenseTaskId").asText();
        JsonNode dispenseTask = getJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId, pharmacyContext());
        assertEquals("INPATIENT", dispenseTask.get("taskType").asText());
        assertMoney("2", dispenseTask.at("/lines/0/plannedQuantity").decimalValue());
        assertEquals("粒", dispenseTask.at("/lines/0/dispenseUnitCode").asText());

        postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/reviews", """
                {"result":"PASS","pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
        postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/reservations",
                "{\"expiryMinutes\":30}", pharmacyContext(), 200);
        postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/picking/complete", """
                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s","description":"两剂摆药完成"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
        JsonNode dispense = postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/dispenses", """
                {"requestCode":"IP-MED-FLOW-DISPENSE","operationQuantity":2,
                 "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s","description":"发往病区"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 201);
        String dispenseId = dispense.get("id").asText();
        String dispenseLineId = dispense.at("/lines/0/id").asText();

        JsonNode delivery = postJson("/api/pharmacy/ward-deliveries", """
                {"deliveryNo":"IP-MED-FLOW-DELIVERY","dispenseIds":["%s"]}
                """.formatted(dispenseId), pharmacyContext(), 201);
        String deliveryId = delivery.get("id").asText();
        String deliveryLineId = delivery.at("/lines/0/id").asText();
        postJson("/api/pharmacy/ward-deliveries/" + deliveryId + "/dispatch", """
                {"expectedRevision":0,"commandCode":"IP-MED-FLOW-DISPATCH"}
                """, pharmacyContext(), 200);
        postJson("/api/pharmacy/ward-deliveries/" + deliveryId + "/receive", """
                {"expectedRevision":1,"commandCode":"IP-MED-FLOW-RECEIVE",
                 "lines":[{"lineId":"%s","receivedQuantity":2}]}
                """.formatted(deliveryLineId), rhnWorkContext(), 200);

        JsonNode executed = postJson("/api/inpatient/order-tasks/" + firstTaskId + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","note":"患者已服药",
                 "commandCode":"IP-MED-FLOW-EXECUTE-1"}
                """, rhnWorkContext(), 200);
        assertEquals(1, executed.get("medicationConsumptions").size());
        assertEquals(dispenseLineId, executed.at("/medicationConsumptions/0/dispenseLineId").asText());
        assertMoney("1", executed.at("/medicationConsumptions/0/consumedBaseQuantity").decimalValue());

        JsonNode stopped = postJson("/api/inpatient/orders/" + requestId + "/stop", """
                {"expectedRevision":3,"reason":"患者停用","commandCode":"IP-MED-FLOW-STOP"}
                """, rhnWorkContext(), 200);
        assertEquals("RETURN_REQUIRED", stopped.at("/medicationClosure/status").asText());
        assertMoney("1", stopped.at("/medicationClosure/returnableQuantity").decimalValue());
        assertEquals("WARD_RETURN", stopped.at("/medicationClosure/action").asText());
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_MEDICATION_RETURN_PENDING')].count")
                        .value(1));
        mockMvc.perform(get("/api/pharmacy/inbox").with(pharmacyContext())
                        .queryParam("organizationId", ORGANIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.request.id == '%s' && @.closureStatus == 'RETURN_REQUIRED')]"
                        .formatted(requestId)).isNotEmpty());

        mockMvc.perform(post("/api/pharmacy/dispenses/{dispenseId}/returns", dispenseId)
                        .with(pharmacyContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"returnNo":"IP-MED-FLOW-RETURN-OVER","reasonCode":"ORDER_STOPPED",
                                 "processorPractitionerId":"%s","processorAssignmentId":"%s",
                                 "lines":[{"originalDispenseLineId":"%s","quantity":2,
                                            "disposition":"RESTOCK"}]}
                                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT, dispenseLineId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STOCK_RETURN_EXCEEDS_UNCONSUMED"));

        JsonNode returned = postJson("/api/pharmacy/dispenses/" + dispenseId + "/returns", """
                {"returnNo":"IP-MED-FLOW-RETURN","reasonCode":"ORDER_STOPPED",
                 "processorPractitionerId":"%s","processorAssignmentId":"%s",
                 "description":"未执行剂次退回药房",
                 "lines":[{"originalDispenseLineId":"%s","quantity":1,
                            "disposition":"RESTOCK"}]}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT, dispenseLineId), pharmacyContext(), 201);
        assertEquals("CONFIRMED", returned.get("status").asText());
        mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}", dispenseTaskId).with(pharmacyContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.closureStatus").value("STOPPED"));
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/discharge-readiness", episodeId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers[?(@.code == 'INPATIENT_MEDICATION_RETURN_PENDING')]").isEmpty());

        mockMvc.perform(post("/api/inpatient/order-tasks/{taskId}/execute", secondTaskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":1,"outcomeCode":"COMPLETED",
                                 "commandCode":"IP-MED-FLOW-EXECUTE-2"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_TASK_NOT_PLANNED"));

        assertEquals(1, count("select count(*) from inpatient_med_consumptions where request_id = ?", requestId));
        assertMoney("1.066666", scalar("select total_amount from charge_items where request_id = ? "
                + "and source_type = 'MEDICATION_DISPENSE'", requestId));
        assertMoney("-0.533333", scalar("select total_amount from charge_items where request_id = ? "
                + "and source_type = 'MEDICATION_RETURN'", requestId));
    }

    @Test
    void stopping_prepared_but_unissued_medication_cancels_task_releases_reservation_and_blocks_dispense()
            throws Exception {
        OrderFacts facts = createPlannedOrder("IP-MED-STOP-PREP", 2);
        JsonNode dispenseTask = intakeAndPrepare(facts, "IP-MED-STOP-PREP");
        String dispenseTaskId = dispenseTask.get("id").asText();
        assertEquals(1, count("select count(*) from inventory_reservations where request_id = ? and status = 'ACTIVE'",
                facts.requestId()));

        JsonNode stopped = postJson("/api/inpatient/orders/" + facts.requestId() + "/stop", """
                {"expectedRevision":3,"reason":"医师停嘱","commandCode":"IP-MED-STOP-PREP-STOP"}
                """, rhnWorkContext(), 200);
        assertEquals("CANCELLED", stopped.at("/medicationClosure/status").asText());
        assertEquals("AUTO_CANCELLED", stopped.at("/medicationClosure/action").asText());
        assertEquals("CANCELLED", jdbc.queryForObject(
                "select status from dispense_tasks where id = ?", String.class, Long.valueOf(dispenseTaskId)));
        assertEquals("CANCELLED", jdbc.queryForObject(
                "select status from dispense_task_lines where task_id = ?", String.class, Long.valueOf(dispenseTaskId)));
        assertEquals(0, count("select count(*) from inventory_reservations where request_id = ? "
                + "and status in ('ACTIVE','PARTIAL')", facts.requestId()));

        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/dispenses", dispenseTaskId)
                        .with(pharmacyContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"IP-MED-STOP-PREP-LATE-DISPENSE","operationQuantity":1,
                                 "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s"}
                                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MEDICATION_DISPENSE_RESERVATION_INSUFFICIENT"));
        assertEquals(0, count("select count(*) from medication_dispenses md join dispense_tasks dt on dt.id=md.task_id "
                + "where dt.id = ? and md.dispense_type in ('DISPENSE','REDISPENSE')", dispenseTaskId));
    }

    @Test
    void stopping_partially_issued_and_partially_administered_medication_returns_only_unused_quantity()
            throws Exception {
        OrderFacts facts = createPlannedOrder("IP-MED-STOP-PART", 3);
        JsonNode dispenseTask = intakeAndPrepare(facts, "IP-MED-STOP-PART");
        String dispenseTaskId = dispenseTask.get("id").asText();
        JsonNode dispense = postJson("/api/pharmacy/dispense-tasks/" + dispenseTaskId + "/dispenses", """
                {"requestCode":"IP-MED-STOP-PART-DISPENSE","operationQuantity":2,
                 "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s","description":"先发两剂"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 201);
        String dispenseId = dispense.get("id").asText();
        String dispenseLineId = dispense.at("/lines/0/id").asText();
        JsonNode delivery = postJson("/api/pharmacy/ward-deliveries", """
                {"deliveryNo":"IP-MED-STOP-PART-DELIVERY","dispenseIds":["%s"]}
                """.formatted(dispenseId), pharmacyContext(), 201);
        String deliveryId = delivery.get("id").asText();
        String deliveryLineId = delivery.at("/lines/0/id").asText();
        postJson("/api/pharmacy/ward-deliveries/" + deliveryId + "/dispatch", """
                {"expectedRevision":0,"commandCode":"IP-MED-STOP-PART-DISPATCH"}
                """, pharmacyContext(), 200);
        postJson("/api/pharmacy/ward-deliveries/" + deliveryId + "/receive", """
                {"expectedRevision":1,"commandCode":"IP-MED-STOP-PART-RECEIVE",
                 "lines":[{"lineId":"%s","receivedQuantity":2}]}
                """.formatted(deliveryLineId), rhnWorkContext(), 200);
        postJson("/api/inpatient/order-tasks/" + facts.taskIds()[0] + "/execute", """
                {"expectedRevision":0,"outcomeCode":"COMPLETED","commandCode":"IP-MED-STOP-PART-EXECUTE"}
                """, rhnWorkContext(), 200);

        JsonNode stopped = postJson("/api/inpatient/orders/" + facts.requestId() + "/stop", """
                {"expectedRevision":3,"reason":"发生不良反应","commandCode":"IP-MED-STOP-PART-STOP"}
                """, rhnWorkContext(), 200);
        assertEquals("RETURN_REQUIRED", stopped.at("/medicationClosure/status").asText());
        assertMoney("2", stopped.at("/medicationClosure/dispensedQuantity").decimalValue());
        assertMoney("1", stopped.at("/medicationClosure/consumedQuantity").decimalValue());
        assertMoney("1", stopped.at("/medicationClosure/returnableQuantity").decimalValue());
        assertEquals("WARD_RETURN", stopped.at("/medicationClosure/action").asText());
        assertEquals("CANCELLED", jdbc.queryForObject(
                "select status from dispense_tasks where id = ?", String.class, Long.valueOf(dispenseTaskId)));
        assertEquals(0, count("select count(*) from inventory_reservations where request_id = ? "
                + "and status in ('ACTIVE','PARTIAL')", facts.requestId()));
        mockMvc.perform(get("/api/pharmacy/inbox").with(pharmacyContext())
                        .queryParam("organizationId", ORGANIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.request.id == '" + facts.requestId()
                        + "' && @.request.status == 'CANCELLED' && @.closureStatus == 'RETURN_REQUIRED')]")
                        .isNotEmpty());

        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/dispenses", dispenseTaskId)
                        .with(pharmacyContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"IP-MED-STOP-PART-LATE-DISPENSE","operationQuantity":1,
                                 "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s"}
                                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MEDICATION_DISPENSE_RESERVATION_INSUFFICIENT"));

        postJson("/api/pharmacy/dispenses/" + dispenseId + "/returns", """
                {"returnNo":"IP-MED-STOP-PART-RETURN","reasonCode":"ORDER_STOPPED",
                 "processorPractitionerId":"%s","processorAssignmentId":"%s",
                 "lines":[{"originalDispenseLineId":"%s","quantity":1,"disposition":"RESTOCK"}]}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT, dispenseLineId), pharmacyContext(), 201);
        mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}", dispenseTaskId).with(pharmacyContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.closureStatus").value("STOPPED"));
    }

    private OrderFacts createPlannedOrder(String prefix, int occurrences) throws Exception {
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"362387869790213","bedId":"362387869898514",
                 "admissionTypeCode":"GENERAL","admissionSourceCode":"DIRECT",
                 "admissionReason":"停嘱药房收口测试","commandCode":"%s-ADMIT"}
                """.formatted(prefix), rhnWorkContext(), 201);
        recordInpatientNoKnownDrugAllergy("362387869790213", admission.get("encounterId").asText());
        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"362387869795111","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"TID","instructions":"饭后口服",
                 "commandCode":"%s-ORDER"}
                """.formatted(admission.get("id").asText(), prefix), rhnWorkContext(), 201);
        String requestId = order.get("id").asText();
        postJson("/api/inpatient/orders/" + requestId + "/sign", medicationSign(0, prefix + "-SIGN"), rhnWorkContext(), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify", revision(1, prefix + "-VERIFY"), rhnWorkContext(), 200);
        LocalDate supplyDate = LocalDate.now(ORGANIZATION_ZONE).plusDays(1);
        StringBuilder times = new StringBuilder();
        for (int index = 0; index < occurrences; index++) {
            if (index > 0) times.append(',');
            times.append('"').append(atSupplyTime(supplyDate, 9 + index, 0)).append('"');
        }
        JsonNode planned = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":[%s],"commandCode":"%s-PLAN"}
                """.formatted(times, prefix), rhnWorkContext(), 200);
        String[] taskIds = new String[occurrences];
        for (int index = 0; index < occurrences; index++) taskIds[index] = planned.at("/tasks/" + index + "/id").asText();
        JsonNode batch = generateSupplyBatch(supplyDate, order.get("departmentId").asText(), prefix + "-SUPPLY");
        return new OrderFacts(requestId, taskIds, batch.at("/lines/0/id").asText());
    }

    private JsonNode intakeAndPrepare(OrderFacts facts, String prefix) throws Exception {
        JsonNode line = postJson("/api/pharmacy/ward-supply-lines/" + facts.supplyLineId() + "/intake", """
                {"stockItemId":"%s","description":"停嘱收口摆药"}
                """.formatted(INPATIENT_STOCK_ITEM), pharmacyContext(), 201);
        String taskId = line.get("dispenseTaskId").asText();
        JsonNode task = getJson("/api/pharmacy/dispense-tasks/" + taskId, pharmacyContext());
        postJson("/api/pharmacy/dispense-tasks/" + taskId + "/reviews", """
                {"result":"PASS","pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
        postJson("/api/pharmacy/dispense-tasks/" + taskId + "/reservations",
                "{\"expiryMinutes\":30}", pharmacyContext(), 200);
        postJson("/api/pharmacy/dispense-tasks/" + taskId + "/picking/complete", """
                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s","description":"%s 配药完成"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT, prefix), pharmacyContext(), 200);
        return task;
    }

    private JsonNode generateSupplyBatch(LocalDate date, String nursingUnitDepartmentId, String commandCode)
            throws Exception {
        return postJson("/api/pharmacy/ward-supply-batches", """
                {"stockSiteId":"%s","nursingUnitDepartmentId":"%s","businessDate":"%s",
                 "shiftCode":"DAY","commandCode":"%s"}
                """.formatted(INPATIENT_STOCK_SITE, nursingUnitDepartmentId, date, commandCode),
                pharmacyContext(), 201);
    }

    private JsonNode getJson(String path, RequestPostProcessor context) throws Exception {
        String response = mockMvc.perform(get(path).with(context))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json(response);
    }

    private static Instant atSupplyTime(LocalDate date, int hour, int minute) {
        return date.atTime(LocalTime.of(hour, minute)).atZone(ORGANIZATION_ZONE).toInstant();
    }

    private record OrderFacts(String requestId, String[] taskIds, String supplyLineId) {}

    private RequestPostProcessor pharmacyContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", INPATIENT_PHARMACY_DEPARTMENT);
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

    private int count(String sql, String requestId) {
        return jdbc.queryForObject(sql, Integer.class, Long.valueOf(requestId));
    }

    private BigDecimal scalar(String sql, String requestId) {
        return jdbc.queryForObject(sql, BigDecimal.class, Long.valueOf(requestId));
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual));
    }
}
