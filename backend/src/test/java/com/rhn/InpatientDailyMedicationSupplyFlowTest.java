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
import java.util.List;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class InpatientDailyMedicationSupplyFlowTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898514";
    private static final String PRODUCT = "362387869795111";
    private static final String INPATIENT_PHARMACY_DEPARTMENT = "362387869799104";
    private static final String INPATIENT_STOCK_SITE = "362387869799503";
    private static final String INPATIENT_STOCK_ITEM = "362387869898703";
    private static final String PHARMACIST = "362387869799301";
    private static final String PHARMACIST_ASSIGNMENT = "362387869898701";
    private static final ZoneId ORGANIZATION_ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void long_term_order_can_roll_two_independent_daily_supply_batches_after_first_intake() throws Exception {
        LocalDate firstDate = LocalDate.now(ORGANIZATION_ZONE).plusDays(1);
        LocalDate secondDate = firstDate.plusDays(1);

        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s",
                 "admissionTypeCode":"GENERAL","admissionSourceCode":"DIRECT",
                 "admissionReason":"住院长期药品按日滚动供药测试",
                 "commandCode":"IP-DAILY-SUPPLY-ADMIT"}
                """.formatted(RESIDENT, BED), rhnWorkContext(), 201);
        String episodeId = admission.get("id").asText();
        recordInpatientNoKnownDrugAllergy(RESIDENT, admission.get("encounterId").asText());

        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"%s","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"BID","instructions":"早晚口服",
                 "commandCode":"IP-DAILY-SUPPLY-ORDER"}
                """.formatted(episodeId, PRODUCT), rhnWorkContext(), 201);
        String requestId = order.get("id").asText();
        String nursingUnitDepartmentId = order.get("departmentId").asText();
        postJson("/api/inpatient/orders/" + requestId + "/sign",
                medicationSign(0, "IP-DAILY-SUPPLY-SIGN"), rhnWorkContext(), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                revision(1, "IP-DAILY-SUPPLY-VERIFY"), rhnWorkContext(), 200);

        JsonNode firstPlan = plan(requestId, 2, firstDate, "IP-DAILY-SUPPLY-PLAN-1");
        String firstTaskId = firstPlan.at("/tasks/0/id").asText();
        String secondTaskId = firstPlan.at("/tasks/1/id").asText();

        JsonNode companionOrder = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"%s","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"BID","instructions":"同批另一长期医嘱",
                 "commandCode":"IP-DAILY-SUPPLY-ORDER-COMPANION"}
                """.formatted(episodeId, PRODUCT), rhnWorkContext(), 201);
        String companionRequestId = companionOrder.get("id").asText();
        postJson("/api/inpatient/orders/" + companionRequestId + "/sign",
                medicationSign(0, "IP-DAILY-SUPPLY-SIGN-COMPANION"), rhnWorkContext(), 200);
        postJson("/api/inpatient/orders/" + companionRequestId + "/verify",
                revision(1, "IP-DAILY-SUPPLY-VERIFY-COMPANION"), rhnWorkContext(), 200);
        plan(companionRequestId, 2, firstDate, "IP-DAILY-SUPPLY-PLAN-COMPANION");

        JsonNode firstBatch = generate(firstDate, nursingUnitDepartmentId, "IP-DAILY-SUPPLY-GENERATE-1");
        assertEquals(firstDate.toString(), firstBatch.get("businessDate").asText());
        assertEquals("DAY", firstBatch.get("shiftCode").asText());
        assertEquals(2, firstBatch.get("lines").size());
        JsonNode firstSupplyLine = findLine(firstBatch, requestId);
        JsonNode companionSupplyLine = findLine(firstBatch, companionRequestId);
        assertEquals(requestId, firstSupplyLine.get("requestId").asText());
        assertEquals(2, firstSupplyLine.get("occurrenceCount").asInt());
        assertEquals(2, firstSupplyLine.get("occurrences").size());
        assertEquals("SUBMITTED", jdbc.queryForObject("""
                select SD_STATUS as status from RHN_SUP_INP_MED_SUPPLY_BATCH where ID_INP_MED_SUPPLY_BATCH = ?
                """, String.class, firstBatch.get("id").asLong()));

        JsonNode commandReplay = generate(firstDate, nursingUnitDepartmentId, "IP-DAILY-SUPPLY-GENERATE-1");
        assertEquals(firstBatch.get("id").asText(), commandReplay.get("id").asText());
        JsonNode windowReplay = generate(firstDate, nursingUnitDepartmentId,
                "IP-DAILY-SUPPLY-GENERATE-1-RETRY");
        assertEquals(firstBatch.get("id").asText(), windowReplay.get("id").asText());
        assertSingleActiveSupply(firstTaskId);
        assertSingleActiveSupply(secondTaskId);

        JsonNode firstIntake = intakeBatch(firstBatch.get("id").asText(),
                List.of(firstSupplyLine.get("id").asText(), companionSupplyLine.get("id").asText()),
                "第一日整批接方");
        String firstDispenseTaskLineId = findLine(firstIntake, requestId)
                .get("dispenseTaskLineId").asText();
        String firstDispenseTaskId = findLine(firstIntake, requestId).get("dispenseTaskId").asText();
        String companionDispenseTaskId = findLine(firstIntake, companionRequestId).get("dispenseTaskId").asText();
        assertEquals("INPATIENT_SUPPLY_LINE", jdbc.queryForObject("""
                select SD_FULFILL_SRC_TYPE as fulfillment_source_type from RHN_SUP_DISP_TASK_LINE where ID_DISP_TASK_LINE = ?
                """, String.class, Long.valueOf(firstDispenseTaskLineId)));
        assertEquals(Long.valueOf(firstSupplyLine.get("id").asLong()), jdbc.queryForObject("""
                select ID_FULFILL_SRC as fulfillment_source_id from RHN_SUP_DISP_TASK_LINE where ID_DISP_TASK_LINE = ?
                """, Long.class, Long.valueOf(firstDispenseTaskLineId)));
        JsonNode firstIntakeReplay = intakeBatch(firstBatch.get("id").asText(),
                List.of(firstSupplyLine.get("id").asText(), companionSupplyLine.get("id").asText()),
                "第一日整批接方重放");
        assertEquals(firstDispenseTaskLineId,
                findLine(firstIntakeReplay, requestId).get("dispenseTaskLineId").asText());
        assertEquals(1, count("""
                select count(*) from RHN_SUP_DISP_TASK_LINE
                 where SD_FULFILL_SRC_TYPE = 'INPATIENT_SUPPLY_LINE' and ID_FULFILL_SRC = ?
                """, firstSupplyLine.get("id").asText()));

        // The whole action is one transaction: a shortage on the second task must roll back
        // the first task's review and reservation instead of leaving a half-prepared ward batch.
        jdbc.update("""
                update RHN_SUP_INV_BAL
                   set QTY_ON_HAND = 2, QTY_RESERVED = 0, QTY_FROZEN = 0,
                       QTY_AVAILABLE = 2, REVISION = REVISION + 1
                 where ID_TNT = ? and ID_STOCK_ITEM = ? and SD_STOCK_STATUS = 'AVAILABLE'
                """, Long.valueOf(TENANT), Long.valueOf(INPATIENT_STOCK_ITEM));
        mockMvc.perform(post("/api/pharmacy/ward-supply-batches/{batchId}/review-reserve",
                        firstBatch.get("id").asText()).with(pharmacyContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s",
                                 "expiryMinutes":30,"description":"库存不足事务回滚验证"}
                                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT)))
                .andExpect(status().isConflict());
        assertEquals(0, jdbc.queryForObject("""
                select count(*) from RHN_SUP_PHARM_REVIEW where ID_DISP_TASK in (?, ?)
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));
        assertEquals(0, jdbc.queryForObject("""
                select count(*) from RHN_SUP_INV_RESV r
                  join RHN_SUP_DISP_TASK_LINE l on l.ID_TNT = r.ID_TNT and l.ID_DISP_TASK_LINE = r.ID_DISP_TASK_LINE
                 where l.ID_DISP_TASK in (?, ?) and r.SD_STATUS in ('ACTIVE','PARTIAL')
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));
        assertEquals(2, jdbc.queryForObject("""
                select count(*) from RHN_SUP_DISP_TASK where ID_DISP_TASK in (?, ?) and SD_STATUS = 'PENDING_REVIEW'
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));

        jdbc.update("""
                update RHN_SUP_INV_BAL
                   set QTY_ON_HAND = 240, QTY_RESERVED = 0, QTY_FROZEN = 0,
                       QTY_AVAILABLE = 240, REVISION = REVISION + 1
                 where ID_TNT = ? and ID_STOCK_ITEM = ? and SD_STOCK_STATUS = 'AVAILABLE'
                """, Long.valueOf(TENANT), Long.valueOf(INPATIENT_STOCK_ITEM));
        JsonNode preparedBatch = reviewAndReserve(firstBatch.get("id").asText());
        assertEquals("PICKING", findLine(preparedBatch, requestId).get("dispenseTaskStatus").asText());
        assertEquals("PICKING", findLine(preparedBatch, companionRequestId).get("dispenseTaskStatus").asText());
        assertEquals(2, jdbc.queryForObject("""
                select count(*) from RHN_SUP_PHARM_REVIEW where ID_DISP_TASK in (?, ?)
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));
        assertEquals(2, jdbc.queryForObject("""
                select count(distinct r.ID_DISP_TASK_LINE) from RHN_SUP_INV_RESV r
                  join RHN_SUP_DISP_TASK_LINE l on l.ID_TNT = r.ID_TNT and l.ID_DISP_TASK_LINE = r.ID_DISP_TASK_LINE
                 where l.ID_DISP_TASK in (?, ?) and r.SD_STATUS in ('ACTIVE','PARTIAL')
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));

        JsonNode preparedReplay = reviewAndReserve(firstBatch.get("id").asText());
        assertEquals("PICKING", findLine(preparedReplay, requestId).get("dispenseTaskStatus").asText());
        assertEquals(2, jdbc.queryForObject("""
                select count(*) from RHN_SUP_PHARM_REVIEW where ID_DISP_TASK in (?, ?)
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));

        JsonNode pickingCompleted = completePicking(firstBatch.get("id").asText());
        assertEquals("READY_TO_DISPENSE", findLine(pickingCompleted, requestId).get("dispenseTaskStatus").asText());
        assertEquals("READY_TO_DISPENSE", findLine(pickingCompleted, companionRequestId)
                .get("dispenseTaskStatus").asText());
        JsonNode pickingReplay = completePicking(firstBatch.get("id").asText());
        assertEquals("READY_TO_DISPENSE", findLine(pickingReplay, requestId).get("dispenseTaskStatus").asText());
        mockMvc.perform(post("/api/pharmacy/ward-supply-batches/{batchId}/picking/complete",
                        firstBatch.get("id").asText()).with(pharmacyContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s",
                                 "description":"变更说明后重放"}
                                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT)))
                .andExpect(status().isConflict());

        // The batch issue and delivery creation share one transaction. Let the lower task issue first,
        // then fail the higher task with an expired reservation; the first issue must roll back as well.
        long expiredTaskId = Math.max(Long.parseLong(firstDispenseTaskId), Long.parseLong(companionDispenseTaskId));
        jdbc.update("""
                update RHN_SUP_INV_RESV set DT_EXPIRES = ?
                 where ID_DISP_TASK_LINE = (select ID_DISP_TASK_LINE from RHN_SUP_DISP_TASK_LINE where ID_DISP_TASK = ?)
                   and SD_STATUS in ('ACTIVE','PARTIAL')
                """, Instant.now().minusSeconds(60), expiredTaskId);
        mockMvc.perform(post("/api/pharmacy/ward-supply-batches/{batchId}/dispense-deliveries",
                        firstBatch.get("id").asText()).with(pharmacyContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"dispenserPractitionerId":"%s","dispenserAssignmentId":"%s",
                                 "description":"整批发药事务回滚验证"}
                                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT)))
                .andExpect(status().isConflict());
        assertEquals(0, jdbc.queryForObject("""
                select count(*) from RHN_SUP_MED_DISP where ID_DISP_TASK in (?, ?)
                  and SD_DISP_TYPE in ('DISPENSE','REDISPENSE')
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));
        assertEquals(2, jdbc.queryForObject("""
                select count(*) from RHN_SUP_DISP_TASK where ID_DISP_TASK in (?, ?) and SD_STATUS = 'READY_TO_DISPENSE'
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));

        jdbc.update("""
                update RHN_SUP_INV_RESV set DT_EXPIRES = ?
                 where ID_DISP_TASK_LINE in (select ID_DISP_TASK_LINE from RHN_SUP_DISP_TASK_LINE where ID_DISP_TASK in (?, ?))
                   and SD_STATUS in ('ACTIVE','PARTIAL')
                """, Instant.now().plusSeconds(1800), Long.valueOf(firstDispenseTaskId),
                Long.valueOf(companionDispenseTaskId));
        JsonNode fulfillment = dispenseAndDeliver(firstBatch.get("id").asText());
        assertEquals("PENDING_DISPATCH", fulfillment.at("/deliveries/0/status").asText());
        assertEquals(2, fulfillment.at("/deliveries/0/lines").size());
        assertEquals("COMPLETED", findLine(fulfillment.get("batch"), requestId)
                .get("dispenseTaskStatus").asText());
        assertEquals("ISSUED", findLine(fulfillment.get("batch"), requestId).get("status").asText());
        assertEquals(2, jdbc.queryForObject("""
                select count(*) from RHN_SUP_MED_DISP where ID_DISP_TASK in (?, ?)
                  and SD_DISP_TYPE = 'DISPENSE'
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SUP_WARD_DELIV", Integer.class));
        assertEquals(2, jdbc.queryForObject("select count(*) from RHN_SUP_WARD_DELIV_LINE", Integer.class));

        JsonNode fulfillmentReplay = dispenseAndDeliver(firstBatch.get("id").asText());
        assertEquals(fulfillment.at("/deliveries/0/id").asText(),
                fulfillmentReplay.at("/deliveries/0/id").asText());
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SUP_WARD_DELIV", Integer.class));
        assertEquals(2, jdbc.queryForObject("select count(*) from RHN_SUP_WARD_DELIV_LINE", Integer.class));
        mockMvc.perform(post("/api/pharmacy/ward-supply-batches/{batchId}/dispense-deliveries",
                        firstBatch.get("id").asText()).with(pharmacyContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"dispenserPractitionerId":"1","dispenserAssignmentId":"%s",
                                 "description":"住院滚动供药整批发药并建立配送交接"}
                                """.formatted(PHARMACIST_ASSIGNMENT)))
                .andExpect(status().isConflict());
        assertEquals(2, jdbc.queryForObject("""
                select count(*) from RHN_SUP_MED_DISP where ID_DISP_TASK in (?, ?)
                  and SD_DISP_TYPE = 'DISPENSE'
                """, Integer.class, Long.valueOf(firstDispenseTaskId), Long.valueOf(companionDispenseTaskId)));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SUP_WARD_DELIV", Integer.class));
        mockMvc.perform(post("/api/pharmacy/ward-supply-batches/{batchId}/intake",
                        firstBatch.get("id").asText()).with(pharmacyContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lines":[{"lineId":"%s","stockItemId":"1"}],
                                 "description":"变更药品后重放"}
                                """.formatted(firstSupplyLine.get("id").asText())))
                .andExpect(status().isConflict());
        assertEquals(1, count("""
                select count(*) from RHN_SUP_DISP_TASK_LINE
                 where SD_FULFILL_SRC_TYPE = 'INPATIENT_SUPPLY_LINE' and ID_FULFILL_SRC = ?
                """, firstSupplyLine.get("id").asText()));

        // The first daily line is already accepted by pharmacy. Appending the next clinical day must remain legal.
        JsonNode secondPlan = plan(requestId, 3, secondDate, "IP-DAILY-SUPPLY-PLAN-2");
        assertEquals(4, secondPlan.get("tasks").size());
        String thirdTaskId = secondPlan.at("/tasks/2/id").asText();
        String fourthTaskId = secondPlan.at("/tasks/3/id").asText();

        JsonNode secondBatch = generate(secondDate, nursingUnitDepartmentId,
                "IP-DAILY-SUPPLY-GENERATE-2");
        assertNotEquals(firstBatch.get("id").asText(), secondBatch.get("id").asText());
        assertEquals(secondDate.toString(), secondBatch.get("businessDate").asText());
        assertEquals(1, secondBatch.get("lines").size());
        JsonNode secondSupplyLine = secondBatch.at("/lines/0");
        assertNotEquals(firstSupplyLine.get("id").asText(), secondSupplyLine.get("id").asText());
        assertEquals(2, secondSupplyLine.get("occurrenceCount").asInt());

        mockMvc.perform(post("/api/pharmacy/ward-supply-batches/{batchId}/intake",
                        secondBatch.get("id").asText()).with(pharmacyContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lines":[
                                  {"lineId":"%s","stockItemId":"%s"},
                                  {"lineId":"%s","stockItemId":"%s"}
                                ],"description":"包含外批次明细"}
                                """.formatted(secondSupplyLine.get("id").asText(), INPATIENT_STOCK_ITEM,
                                firstSupplyLine.get("id").asText(), INPATIENT_STOCK_ITEM)))
                .andExpect(status().isBadRequest());
        assertEquals(0, count("""
                select count(*) from RHN_SUP_DISP_TASK_LINE
                 where SD_FULFILL_SRC_TYPE = 'INPATIENT_SUPPLY_LINE' and ID_FULFILL_SRC = ?
                """, secondSupplyLine.get("id").asText()));

        mockMvc.perform(post("/api/pharmacy/ward-supply-batches/{batchId}/intake",
                        secondBatch.get("id").asText()).with(pharmacyContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lines":[
                                  {"lineId":"%s","stockItemId":"%s"},
                                  {"lineId":"%s","stockItemId":"%s"}
                                ],"description":"重复明细"}
                                """.formatted(secondSupplyLine.get("id").asText(), INPATIENT_STOCK_ITEM,
                                secondSupplyLine.get("id").asText(), INPATIENT_STOCK_ITEM)))
                .andExpect(status().isBadRequest());
        assertEquals(0, count("""
                select count(*) from RHN_SUP_DISP_TASK_LINE
                 where SD_FULFILL_SRC_TYPE = 'INPATIENT_SUPPLY_LINE' and ID_FULFILL_SRC = ?
                """, secondSupplyLine.get("id").asText()));

        JsonNode secondIntake = intakeBatch(secondBatch.get("id").asText(),
                List.of(secondSupplyLine.get("id").asText()), "第二日整批接方");
        String secondDispenseTaskLineId = findLine(secondIntake, requestId)
                .get("dispenseTaskLineId").asText();
        assertNotEquals(firstDispenseTaskLineId, secondDispenseTaskLineId);
        assertEquals(2, count("""
                select count(*) from RHN_SUP_DISP_TASK_LINE
                 where ID_CARE_REQ = ? and SD_FULFILL_SRC_TYPE = 'INPATIENT_SUPPLY_LINE'
                """, requestId));
        assertSingleActiveSupply(thirdTaskId);
        assertSingleActiveSupply(fourthTaskId);
    }

    private JsonNode plan(String requestId, long expectedRevision, LocalDate date, String commandCode)
            throws Exception {
        Instant morning = date.atTime(LocalTime.of(9, 0)).atZone(ORGANIZATION_ZONE).toInstant();
        Instant afternoon = date.atTime(LocalTime.of(13, 0)).atZone(ORGANIZATION_ZONE).toInstant();
        return postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":%d,"plannedTimes":["%s","%s"],"commandCode":"%s"}
                """.formatted(expectedRevision, morning, afternoon, commandCode), rhnWorkContext(), 200);
    }

    private JsonNode generate(LocalDate date, String nursingUnitDepartmentId, String commandCode) throws Exception {
        return postJson("/api/pharmacy/ward-supply-batches", """
                {"stockSiteId":"%s","nursingUnitDepartmentId":"%s","businessDate":"%s",
                 "shiftCode":"DAY","commandCode":"%s"}
                """.formatted(INPATIENT_STOCK_SITE, nursingUnitDepartmentId, date, commandCode),
                pharmacyContext(), 201);
    }

    private JsonNode intakeBatch(String batchId, List<String> supplyLineIds, String description) throws Exception {
        String linePayload = supplyLineIds.stream()
                .map(lineId -> "{\"lineId\":\"" + lineId + "\",\"stockItemId\":\""
                        + INPATIENT_STOCK_ITEM + "\"}")
                .reduce((left, right) -> left + "," + right).orElseThrow();
        return postJson("/api/pharmacy/ward-supply-batches/" + batchId + "/intake", """
                {"lines":[%s],"description":"%s"}
                """.formatted(linePayload, description), pharmacyContext(), 200);
    }

    private JsonNode reviewAndReserve(String batchId) throws Exception {
        return postJson("/api/pharmacy/ward-supply-batches/" + batchId + "/review-reserve", """
                {"pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s",
                 "expiryMinutes":30,"description":"住院滚动供药批量审方并预留"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
    }

    private JsonNode completePicking(String batchId) throws Exception {
        return postJson("/api/pharmacy/ward-supply-batches/" + batchId + "/picking/complete", """
                {"pickerPractitionerId":"%s","pickerAssignmentId":"%s",
                 "description":"住院滚动供药整批配药复核"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
    }

    private JsonNode dispenseAndDeliver(String batchId) throws Exception {
        return postJson("/api/pharmacy/ward-supply-batches/" + batchId + "/dispense-deliveries", """
                {"dispenserPractitionerId":"%s","dispenserAssignmentId":"%s",
                 "description":"住院滚动供药整批发药并建立配送交接"}
                """.formatted(PHARMACIST, PHARMACIST_ASSIGNMENT), pharmacyContext(), 200);
    }

    private JsonNode findLine(JsonNode batch, String requestId) {
        return StreamSupport.stream(batch.get("lines").spliterator(), false)
                .filter(line -> requestId.equals(line.get("requestId").asText()))
                .findFirst().orElseThrow();
    }

    private void assertSingleActiveSupply(String taskId) {
        assertEquals(1, count("""
                select count(*) from RHN_SUP_INP_MED_SUPPLY_TASK
                 where ID_INP_ORDER_TASK = ? and SD_STATUS = 'ACTIVE'
                """, taskId));
    }

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
        return "{\"expectedRevision\":" + value
                + ",\"allergyReviewConfirmed\":true,\"commandCode\":\"" + commandCode + "\"}";
    }

    private int count(String sql, String value) {
        return jdbc.queryForObject(sql, Integer.class, Long.valueOf(value));
    }
}
