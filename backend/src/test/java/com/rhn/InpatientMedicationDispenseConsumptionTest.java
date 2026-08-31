package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientMedicationDispenseConsumptionTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED = "362387869898514";
    private static final String PRODUCT = "362387869795111";
    private static final String PACKAGE = "362387869795401";
    private static final long ACTOR = 362387869790222L;

    @Autowired JdbcTemplate jdbc;

    @Test
    void long_term_tasks_consume_exact_net_dispense_lines_once() throws Exception {
        String episodeId = admit();
        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"MEDICATION","durationType":"LONG_TERM",
                 "catalogItemId":"%s","dosageAmount":0.25,"dosageUnit":"g",
                 "routeCode":"ORAL","frequencyCode":"TID","commandCode":"IP-CONS-CREATE"}
                """.formatted(episodeId, PRODUCT), 201);
        long requestId = order.get("id").asLong();
        String encounterId = order.get("encounterId").asText();
        recordInpatientNoKnownDrugAllergy(RESIDENT, encounterId);
        postJson("/api/inpatient/orders/" + requestId + "/sign",
                medicationSign(0, "IP-CONS-SIGN"), 200);
        postJson("/api/inpatient/orders/" + requestId + "/verify",
                revision(1, "IP-CONS-VERIFY"), 200);

        Instant now = Instant.now();
        JsonNode planned = postJson("/api/inpatient/orders/" + requestId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s","%s","%s"],"commandCode":"IP-CONS-PLAN"}
                """.formatted(now.minusSeconds(180), now.minusSeconds(120), now.minusSeconds(60)), 200);
        assertEquals(3, planned.get("tasks").size());
        // Medication request quantities are per occurrence. Rolling plans must not rewrite the
        // clinical request into a historical total, otherwise tomorrow's supply cannot append safely.
        assertDecimal("1", "select quantity from medication_requests where request_id = ?", requestId);
        assertDecimal("1", "select base_quantity from medication_requests where request_id = ?", requestId);
        BigDecimal unitPrice = jdbc.queryForObject(
                "select unit_price from care_requests where id = ?", BigDecimal.class, requestId);
        BigDecimal totalAmount = jdbc.queryForObject(
                "select total_amount from care_requests where id = ?", BigDecimal.class, requestId);
        if (unitPrice == null) assertNull(totalAmount);
        else assertEquals(0, unitPrice.compareTo(totalAmount));

        PharmacyFacts facts = seedPartialDispenseWithReturn(requestId, Long.parseLong(encounterId));
        String firstTask = planned.get("tasks").get(0).get("id").asText();
        String secondTask = planned.get("tasks").get(1).get("id").asText();
        String thirdTask = planned.get("tasks").get(2).get("id").asText();

        JsonNode executed = postJson("/api/inpatient/order-tasks/" + firstTask + "/execute", """
                {"expectedRevision":0,"outcomeCode":"GIVEN","commandCode":"IP-CONS-EXEC-1"}
                """, 200);
        assertEquals("EXECUTED", executed.get("status").asText());
        assertEquals(facts.dispenseId(), executed.get("medicationConsumptions").get(0).get("dispenseId").asLong());
        assertEquals(facts.dispenseLineId(),
                executed.get("medicationConsumptions").get(0).get("dispenseLineId").asLong());
        assertEquals(0, new BigDecimal("1").compareTo(new BigDecimal(
                executed.get("medicationConsumptions").get(0).get("consumedBaseQuantity").asText())));
        assertEquals(1, count("select count(*) from inpatient_med_consumptions where order_task_id = ?",
                Long.parseLong(firstTask)));

        JsonNode replay = postJson("/api/inpatient/order-tasks/" + firstTask + "/execute", """
                {"expectedRevision":0,"outcomeCode":"GIVEN","commandCode":"IP-CONS-EXEC-1"}
                """, 200);
        assertEquals("EXECUTED", replay.get("status").asText());
        assertEquals(1, count("select count(*) from inpatient_med_consumptions where order_task_id = ?",
                Long.parseLong(firstTask)));

        mockMvc.perform(post("/api/inpatient/order-tasks/{id}/execute", secondTask)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"outcomeCode":"GIVEN","commandCode":"IP-CONS-EXEC-2"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_MEDICATION_DISPENSE_QUANTITY_INSUFFICIENT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("可用 0 粒")));
        assertEquals("PLANNED", jdbc.queryForObject(
                "select status from inpatient_order_tasks where id = ?", String.class, Long.parseLong(secondTask)));

        postJson("/api/inpatient/order-tasks/" + secondTask + "/skip", """
                {"expectedRevision":0,"outcomeCode":"PATIENT_REFUSED","commandCode":"IP-CONS-SKIP-2"}
                """, 200);
        postJson("/api/inpatient/order-tasks/" + thirdTask + "/skip", """
                {"expectedRevision":0,"outcomeCode":"NOT_AVAILABLE","commandCode":"IP-CONS-SKIP-3"}
                """, 200);
        assertEquals(1, count("select count(*) from inpatient_med_consumptions where request_id = ?", requestId));
        assertDecimal("2", "select dispensed_quantity from dispense_task_lines where id = ?", facts.taskLineId());
        assertDecimal("1", "select returned_quantity from dispense_task_lines where id = ?", facts.taskLineId());
    }

    private PharmacyFacts seedPartialDispenseWithReturn(long requestId, long encounterId) throws Exception {
        JsonNode site = postJson("/api/pharmacy/stock-sites", """
                {"organizationId":"%s","departmentId":"%s","code":"IP-PHARM","name":"住院药房",
                 "siteType":"PHARMACY","serviceScope":"INPATIENT","validFrom":"2026-01-01"}
                """.formatted(ORGANIZATION, DEPARTMENT), 201);
        JsonNode items = postJson("/api/pharmacy/stock-sites/" + site.get("id").asText() + "/stock-items/batch", """
                {"items":[{"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                 "negativeAllowed":false,"lotRequired":true,"traceRequired":false,"splitAllowed":true,
                 "coldChain":false,"controlled":false,"highAlert":false}]}
                """.formatted(PRODUCT, PACKAGE), 201);
        long siteId = site.get("id").asLong();
        long stockItemId = items.get(0).get("id").asLong();
        long binId = 881060001L;
        long lotId = 881060002L;
        long periodId = 881060003L;
        long issueTransactionId = 881060004L;
        long issueTransactionLineId = 881060005L;
        long returnTransactionId = 881060006L;
        long returnTransactionLineId = 881060007L;
        long taskId = 881060008L;
        long taskLineId = 881060009L;
        long dispenseId = 881060010L;
        long dispenseLineId = 881060011L;
        long returnDispenseId = 881060012L;
        long returnDispenseLineId = 881060013L;
        long deliveryId = 881060014L;
        long deliveryLineId = 881060015L;
        Instant now = Instant.now();

        jdbc.update("""
                insert into stock_bins (id, revision, tenant_id, stock_site_id, parent_bin_id, code, name,
                    bin_type, stock_default, receive_allowed, pick_allowed, count_allowed, sort_order, active,
                    created_at, created_by)
                values (?,0,?,?,null,'IP-CONS-BIN','住院药品核销测试库位','BIN','AVAILABLE',true,true,true,1,true,?,?)
                """, binId, Long.parseLong(TENANT), siteId, now, ACTOR);
        jdbc.update("""
                insert into stock_lots (id, revision, tenant_id, catalog_item_id, package_id, lot_no,
                    production_date, expiry_date, approval_code_snapshot, manufacturer_name_snapshot,
                    quality_status, quality_at, quality_user_id, status, created_at, created_by)
                values (?,0,?,?,?,'IP-CONS-LOT',?,?,null,null,'QUALIFIED',?,?,'ACTIVE',?,?)
                """, lotId, Long.parseLong(TENANT), Long.parseLong(PRODUCT), Long.parseLong(PACKAGE),
                LocalDate.of(2026, 1, 1), LocalDate.of(2028, 1, 1), now, ACTOR, now, ACTOR);
        jdbc.update("""
                insert into inventory_periods (id, revision, tenant_id, stock_site_id, period_code,
                    period_from, period_to, status, closed_at, closed_by, description, created_at, created_by)
                values (?,0,?,?,'2026-IP-CONS',?,?,'OPEN',null,null,null,?,?)
                """, periodId, Long.parseLong(TENANT), siteId, LocalDate.of(2026, 1, 1),
                LocalDate.of(2026, 12, 31), now, ACTOR);
        insertTransaction(issueTransactionId, periodId, "IP-CONS-ISSUE", "DISPENSE", now);
        insertTransaction(returnTransactionId, periodId, "IP-CONS-RETURN", "RETURN", now.plusSeconds(1));
        insertTransactionLine(issueTransactionLineId, issueTransactionId, siteId, binId, stockItemId, lotId,
                new BigDecimal("2"), new BigDecimal("-2"));
        insertTransactionLine(returnTransactionLineId, returnTransactionId, siteId, binId, stockItemId, lotId,
                BigDecimal.ONE, BigDecimal.ONE);
        jdbc.update("""
                insert into dispense_tasks (id, revision, tenant_id, resident_id, encounter_id, stock_site_id,
                    latest_review_id, task_no, task_type, priority, status, created_at, due_at, picked_at,
                    assigned_practitioner_id, description)
                values (?,0,?,?,?,?,null,'IP-CONS-DT','INPATIENT','ROUTINE','PARTIALLY_RETURNED',?,null,?, ?,null)
                """, taskId, Long.parseLong(TENANT), Long.parseLong(RESIDENT), encounterId, siteId,
                now, now, ACTOR);
        jdbc.update("""
                insert into dispense_task_lines (id, tenant_id, task_id, request_id,
                    fulfillment_source_type, fulfillment_source_id, sort_order, stock_item_id,
                    package_id, requested_quantity, planned_quantity, dispensed_quantity, returned_quantity,
                    dispense_unit_code, base_quantity_factor, split, trace_required, status,
                    product_code_snapshot, product_name_snapshot, package_spec_snapshot,
                    item_attribute_snapshot, item_attribute_hash, created_at, created_by)
                values (?,?,?,?,'MEDICATION_REQUEST',?,1,?,?,3,3,2,1,'粒',1,true,false,'PARTIAL',
                    'MED-AMOX-025','阿莫西林胶囊 0.25g','24粒/盒','{}',?, ?,?)
                """, taskLineId, Long.parseLong(TENANT), taskId, requestId, requestId, stockItemId,
                Long.parseLong(PACKAGE), "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
                now, ACTOR);
        insertDispense(dispenseId, taskId, encounterId, siteId, null,
                "IP-CONS-DISPENSE", "DISPENSE", new BigDecimal("2"), now);
        insertDispense(returnDispenseId, taskId, encounterId, siteId, dispenseId,
                "IP-CONS-RETURN", "RETURN", BigDecimal.ONE, now.plusSeconds(1));
        insertDispenseLine(dispenseLineId, dispenseId, taskLineId, null, binId, stockItemId, lotId,
                issueTransactionLineId, new BigDecimal("2"));
        insertDispenseLine(returnDispenseLineId, returnDispenseId, taskLineId, dispenseLineId, binId,
                stockItemId, lotId, returnTransactionLineId, BigDecimal.ONE);
        jdbc.update("""
                insert into ward_deliveries (id, revision, tenant_id, organization_id, stock_site_id,
                    nursing_unit_department_id, delivery_no, status, stock_site_name_snapshot,
                    nursing_unit_name_snapshot, created_at, created_by, dispatched_at, dispatched_by,
                    dispatch_note, received_at, received_by, receipt_note, discrepancy_note,
                    resolved_at, resolved_by, resolution_code, resolution_note)
                values (?,0,?,?,?,?,'IP-CONS-DELIVERY','RECEIVED','住院药房','综合病区',?,?,?, ?,null,
                    ?,?,null,null,null,null,null,null)
                """, deliveryId, Long.parseLong(TENANT), Long.parseLong(ORGANIZATION), siteId,
                Long.parseLong(DEPARTMENT), now, ACTOR, now, ACTOR, now, ACTOR);
        jdbc.update("""
                insert into ward_delivery_lines (id, tenant_id, delivery_id, dispense_id, resident_id,
                    encounter_id, resident_name_snapshot, medication_name_snapshot, expected_quantity,
                    received_quantity, unit_code, status, discrepancy_code, discrepancy_note)
                values (?,?,?,?,?,?,'核销测试患者','阿莫西林胶囊 0.25g',2,2,'粒','MATCHED',null,null)
                """, deliveryLineId, Long.parseLong(TENANT), deliveryId, dispenseId,
                Long.parseLong(RESIDENT), encounterId);
        return new PharmacyFacts(taskLineId, dispenseId, dispenseLineId);
    }

    private void insertTransaction(long id, long periodId, String code, String type, Instant occurredAt) {
        jdbc.update("""
                insert into inventory_transactions (id, tenant_id, inventory_period_id, reverses_transaction_id,
                    transaction_no, request_code, transaction_type, source_type, source_code,
                    occurred_at, posted_at, posted_by, description)
                values (?,?,?,null,?,?,?,'TEST',?,?,?, ?,null)
                """, id, Long.parseLong(TENANT), periodId, code, code, type, code, occurredAt, occurredAt, ACTOR);
    }

    private void insertTransactionLine(long id, long transactionId, long siteId, long binId,
                                       long stockItemId, long lotId,
                                       BigDecimal operationQuantity, BigDecimal delta) {
        jdbc.update("""
                insert into inventory_transaction_lines (id, tenant_id, inventory_transaction_id, sort_order,
                    stock_site_id, stock_bin_id, stock_item_id, stock_lot_id, package_id, stock_status,
                    operation_quantity, operation_unit_code, base_quantity_factor, quantity_delta,
                    unit_cost, amount_delta)
                values (?,?,?,1,?,?,?,?,?,'AVAILABLE',?,'粒',1,?,1,?)
                """, id, Long.parseLong(TENANT), transactionId, siteId, binId, stockItemId, lotId,
                Long.parseLong(PACKAGE), operationQuantity, delta, delta);
    }

    private void insertDispense(long id, long taskId, long encounterId, long siteId, Long originalId,
                                String no, String type, BigDecimal quantity, Instant occurredAt) {
        jdbc.update("""
                insert into medication_dispenses (id, tenant_id, task_id, resident_id, encounter_id, stock_site_id,
                    original_dispense_id, dispense_no, dispense_type, occurred_at, dispenser_practitioner_id,
                    dispenser_user_id, dispenser_assignment_id, checker_practitioner_id, checker_user_id,
                    checker_assignment_id, checked_at, operation_quantity, operation_unit_code, description)
                values (?,?,?,?,?,?,?,?,?,?,?, ?,?,null,null,null,null,?,'粒',null)
                """, id, Long.parseLong(TENANT), taskId, Long.parseLong(RESIDENT), encounterId, siteId,
                originalId, no, type, occurredAt, ACTOR, ACTOR, ACTOR, quantity);
    }

    private void insertDispenseLine(long id, long dispenseId, long taskLineId, Long originalLineId,
                                    long binId, long stockItemId, long lotId, long transactionLineId,
                                    BigDecimal quantity) {
        jdbc.update("""
                insert into medication_dispense_lines (id, tenant_id, medication_dispense_id, task_line_id,
                    original_dispense_line_id, sort_order, stock_bin_id, stock_item_id, stock_lot_id,
                    inventory_transaction_line_id, quantity_dispensed, dispense_unit_code, base_quantity_factor)
                values (?,?,?,?,?,1,?,?,?,?,?,'粒',1)
                """, id, Long.parseLong(TENANT), dispenseId, taskLineId, originalLineId,
                binId, stockItemId, lotId, transactionLineId, quantity);
    }

    private String admit() throws Exception {
        return postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"OUTPATIENT","admissionReason":"住院药品核销测试",
                 "commandCode":"IP-CONS-ADMIT"}
                """.formatted(RESIDENT, BED), 201).get("id").asText();
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

    private void assertDecimal(String expected, String sql, long id) {
        BigDecimal actual = jdbc.queryForObject(sql, BigDecimal.class, id);
        assertEquals(0, new BigDecimal(expected).compareTo(actual));
    }

    private int count(String sql, long id) {
        return jdbc.queryForObject(sql, Integer.class, id);
    }

    private record PharmacyFacts(long taskLineId, long dispenseId, long dispenseLineId) {
    }
}
