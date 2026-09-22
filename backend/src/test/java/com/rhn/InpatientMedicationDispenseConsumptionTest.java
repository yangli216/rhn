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
        String encounterId = order.get("encounterId").asString();
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
        assertDecimal("1", "select QTY_ORDERED as quantity from RHN_EX_MED_REQ where ID_CARE_REQ = ?", requestId);
        assertDecimal("1", "select QTY_BASE as base_quantity from RHN_EX_MED_REQ where ID_CARE_REQ = ?", requestId);
        BigDecimal unitPrice = jdbc.queryForObject(
                "select PRICE_UNIT as unit_price from RHN_EX_CARE_REQ where ID_CARE_REQ = ?", BigDecimal.class, requestId);
        BigDecimal totalAmount = jdbc.queryForObject(
                "select AMT_TOTAL as total_amount from RHN_EX_CARE_REQ where ID_CARE_REQ = ?", BigDecimal.class, requestId);
        if (unitPrice == null) assertNull(totalAmount);
        else assertEquals(0, unitPrice.compareTo(totalAmount));

        PharmacyFacts facts = seedPartialDispenseWithReturn(requestId, Long.parseLong(encounterId));
        String firstTask = planned.get("tasks").get(0).get("id").asString();
        String secondTask = planned.get("tasks").get(1).get("id").asString();
        String thirdTask = planned.get("tasks").get(2).get("id").asString();

        JsonNode executed = postJson("/api/inpatient/order-tasks/" + firstTask + "/execute", """
                {"expectedRevision":0,"outcomeCode":"GIVEN","commandCode":"IP-CONS-EXEC-1"}
                """, 200);
        assertEquals("EXECUTED", executed.get("status").asString());
        assertEquals(facts.dispenseId(), executed.get("medicationConsumptions").get(0).get("dispenseId").asLong());
        assertEquals(facts.dispenseLineId(),
                executed.get("medicationConsumptions").get(0).get("dispenseLineId").asLong());
        assertEquals(0, new BigDecimal("1").compareTo(new BigDecimal(
                executed.get("medicationConsumptions").get(0).get("consumedBaseQuantity").asString())));
        assertEquals(1, count("select count(*) from RHN_SUP_INP_MED_CONSUME where ID_INP_ORDER_TASK = ?",
                Long.parseLong(firstTask)));

        JsonNode replay = postJson("/api/inpatient/order-tasks/" + firstTask + "/execute", """
                {"expectedRevision":0,"outcomeCode":"GIVEN","commandCode":"IP-CONS-EXEC-1"}
                """, 200);
        assertEquals("EXECUTED", replay.get("status").asString());
        assertEquals(1, count("select count(*) from RHN_SUP_INP_MED_CONSUME where ID_INP_ORDER_TASK = ?",
                Long.parseLong(firstTask)));

        mockMvc.perform(post("/api/inpatient/order-tasks/{id}/execute", secondTask)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"outcomeCode":"GIVEN","commandCode":"IP-CONS-EXEC-2"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_MEDICATION_DISPENSE_QUANTITY_INSUFFICIENT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("可用 0 粒")));
        assertEquals("PLANNED", jdbc.queryForObject(
                "select SD_STATUS as status from RHN_EX_INP_ORDER_TASK where ID_INP_ORDER_TASK = ?", String.class, Long.parseLong(secondTask)));

        postJson("/api/inpatient/order-tasks/" + secondTask + "/skip", """
                {"expectedRevision":0,"outcomeCode":"PATIENT_REFUSED","commandCode":"IP-CONS-SKIP-2"}
                """, 200);
        postJson("/api/inpatient/order-tasks/" + thirdTask + "/skip", """
                {"expectedRevision":0,"outcomeCode":"NOT_AVAILABLE","commandCode":"IP-CONS-SKIP-3"}
                """, 200);
        assertEquals(1, count("select count(*) from RHN_SUP_INP_MED_CONSUME where ID_CARE_REQ = ?", requestId));
        assertDecimal("2", "select QTY_DSPNSD as dispensed_quantity from RHN_SUP_DISP_TASK_LINE where ID_DISP_TASK_LINE = ?", facts.taskLineId());
        assertDecimal("1", "select QTY_RETD as returned_quantity from RHN_SUP_DISP_TASK_LINE where ID_DISP_TASK_LINE = ?", facts.taskLineId());
    }

    private PharmacyFacts seedPartialDispenseWithReturn(long requestId, long encounterId) throws Exception {
        JsonNode site = postJson("/api/pharmacy/stock-sites", """
                {"organizationId":"%s","departmentId":"%s","code":"IP-PHARM","name":"住院药房",
                 "siteType":"PHARMACY","serviceScope":"INPATIENT","validFrom":"2026-01-01"}
                """.formatted(ORGANIZATION, DEPARTMENT), 201);
        JsonNode items = postJson("/api/pharmacy/stock-sites/" + site.get("id").asString() + "/stock-items/batch", """
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
                insert into RHN_SUP_STOCK_BIN (ID_STOCK_BIN, REVISION, ID_TNT, ID_STOCK_SITE, ID_STOCK_BIN_PARENT, CD_STOCK_BIN, NA_STOCK_BIN,
                    SD_BIN_TYPE, SD_STOCK_DEFAULT, FG_RECEIVE, FG_PICK, FG_COUNT, SN_SORT, FG_ACTIVE,
                    DT_CREATED, ID_USER_CREATED)
                values (?,0,?,?,null,'IP-CONS-BIN','住院药品核销测试库位','BIN','AVAILABLE',true,true,true,1,true,?,?)
                """, binId, Long.parseLong(TENANT), siteId, now, ACTOR);
        jdbc.update("""
                insert into RHN_SUP_STOCK_LOT (ID_STOCK_LOT, REVISION, ID_TNT, ID_CATALOG_ITEM, ID_ITEM_PKG, CD_LOT_NO,
                    DA_PROD, DA_EXPIRY, CD_APRVL_SNAP, NA_MFR_SNAP,
                    SD_QUALITY_STATUS, DT_QUALITY, ID_QUALITY_USER, SD_STATUS, DT_CREATED, ID_USER_CREATED)
                values (?,0,?,?,?,'IP-CONS-LOT',?,?,null,null,'QUALIFIED',?,?,'ACTIVE',?,?)
                """, lotId, Long.parseLong(TENANT), Long.parseLong(PRODUCT), Long.parseLong(PACKAGE),
                LocalDate.of(2026, 1, 1), LocalDate.of(2028, 1, 1), now, ACTOR, now, ACTOR);
        jdbc.update("""
                insert into RHN_SUP_INV_PERIOD (ID_INV_PERIOD, REVISION, ID_TNT, ID_STOCK_SITE, CD_PERIOD,
                    DA_PERIOD_FROM, DA_PERIOD_TO, SD_STATUS, DT_CLOSED, ID_USER_CLOSED, DES_INV_PERIOD, DT_CREATED, ID_USER_CREATED)
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
                insert into RHN_SUP_DISP_TASK (ID_DISP_TASK, REVISION, ID_TNT, ID_PAT, ID_ENC, ID_STOCK_SITE,
                    ID_PHARM_REVIEW_LATEST, CD_TASK_NO, SD_TASK_TYPE, SD_PRI, SD_STATUS, DT_CREATED, DT_DUE, DT_PICKED,
                    ID_ASGND_PRACT, DES_DISP_TASK)
                values (?,0,?,?,?,?,null,'IP-CONS-DT','INPATIENT','ROUTINE','PARTIALLY_RETURNED',?,null,?, ?,null)
                """, taskId, Long.parseLong(TENANT), Long.parseLong(RESIDENT), encounterId, siteId,
                now, now, ACTOR);
        jdbc.update("""
                insert into RHN_SUP_DISP_TASK_LINE (ID_DISP_TASK_LINE, ID_TNT, ID_DISP_TASK, ID_CARE_REQ,
                    SD_FULFILL_SRC_TYPE, ID_FULFILL_SRC, SN_SORT, ID_STOCK_ITEM,
                    ID_ITEM_PKG, QTY_REQD, QTY_PLANNED, QTY_DSPNSD, QTY_RETD,
                    CD_DISP_UNIT, BASE_QTY_FACTOR, FG_SPLIT, FG_TRACE_RQD, SD_STATUS,
                    CD_PRODUCT_SNAP, NA_PRODUCT_SNAP, PACKAGE_SPEC_SNAP,
                    JSON_ITEM_ATTR_SNAP, HASH_ITEM_ATTR, DT_CREATED, ID_USER_CREATED)
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
                insert into RHN_SUP_WARD_DELIV (ID_WARD_DELIV, REVISION, ID_TNT, ID_ORG, ID_STOCK_SITE,
                    ID_DEPT_NURS_UNIT, CD_DELIV_NO, SD_STATUS, NA_STOCK_SITE_SNAP,
                    NA_NURS_UNIT_SNAP, DT_CREATED, ID_USER_CREATED, DT_DSPTD, ID_USER_DSPTD,
                    DES_DSPT_NOTE, DT_RECVD, ID_USER_RECVD, DES_RCPT_NOTE, DES_DSCRPN_NOTE,
                    DT_RSLVD, ID_USER_RSLVD, CD_RSLN, DES_RSLN_NOTE)
                values (?,0,?,?,?,?,'IP-CONS-DELIVERY','RECEIVED','住院药房','综合病区',?,?,?, ?,null,
                    ?,?,null,null,null,null,null,null)
                """, deliveryId, Long.parseLong(TENANT), Long.parseLong(ORGANIZATION), siteId,
                Long.parseLong(DEPARTMENT), now, ACTOR, now, ACTOR, now, ACTOR);
        jdbc.update("""
                insert into RHN_SUP_WARD_DELIV_LINE (ID_WARD_DELIV_LINE, ID_TNT, ID_WARD_DELIV, ID_MED_DISP, ID_PAT,
                    ID_ENC, NA_PAT_SNAP, NA_MED_SNAP, QTY_EXPCTD,
                    QTY_RECVD, CD_UNIT, SD_STATUS, CD_DSCRPN, DES_DSCRPN_NOTE)
                values (?,?,?,?,?,?,'核销测试患者','阿莫西林胶囊 0.25g',2,2,'粒','MATCHED',null,null)
                """, deliveryLineId, Long.parseLong(TENANT), deliveryId, dispenseId,
                Long.parseLong(RESIDENT), encounterId);
        return new PharmacyFacts(taskLineId, dispenseId, dispenseLineId);
    }

    private void insertTransaction(long id, long periodId, String code, String type, Instant occurredAt) {
        jdbc.update("""
                insert into RHN_SUP_INV_TXN (ID_INV_TXN, ID_TNT, ID_INV_PERIOD, ID_INV_TXN_RVRS,
                    CD_TXN_NO, CD_REQ, SD_TXN_TYPE, SD_SRC_TYPE, CD_SRC,
                    DT_OCCRD, DT_POSTED, ID_USER_POSTED, DES_INV_TXN)
                values (?,?,?,null,?,?,?,'TEST',?,?,?, ?,null)
                """, id, Long.parseLong(TENANT), periodId, code, code, type, code, occurredAt, occurredAt, ACTOR);
    }

    private void insertTransactionLine(long id, long transactionId, long siteId, long binId,
                                       long stockItemId, long lotId,
                                       BigDecimal operationQuantity, BigDecimal delta) {
        jdbc.update("""
                insert into RHN_SUP_INV_TXN_LINE (ID_INV_TXN_LINE, ID_TNT, ID_INV_TXN, SN_SORT,
                    ID_STOCK_SITE, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT, ID_ITEM_PKG, SD_STOCK_STATUS,
                    QTY_OPER, CD_OPER_UNIT, BASE_QTY_FACTOR, QTY_DELTA,
                    PRICE_UNIT_COST, AMT_DELTA)
                values (?,?,?,1,?,?,?,?,?,'AVAILABLE',?,'粒',1,?,1,?)
                """, id, Long.parseLong(TENANT), transactionId, siteId, binId, stockItemId, lotId,
                Long.parseLong(PACKAGE), operationQuantity, delta, delta);
    }

    private void insertDispense(long id, long taskId, long encounterId, long siteId, Long originalId,
                                String no, String type, BigDecimal quantity, Instant occurredAt) {
        jdbc.update("""
                insert into RHN_SUP_MED_DISP (ID_MED_DISP, ID_TNT, ID_ORG, ID_DEPT, ID_DISP_TASK, ID_PAT, ID_ENC, ID_STOCK_SITE,
                    ID_MED_DISP_ORIG, CD_DISP_NO, SD_DISP_TYPE, DT_OCCRD, ID_DSPNSR_PRACT,
                    ID_DSPNSR_USER, ID_DSPNSR_ASSIGN, ID_CHECKER_PRACT, ID_CHECKER_USER,
                    ID_CHECKER_ASSIGN, DT_CHECKED, QTY_OPER, CD_OPER_UNIT, DES_MED_DISP)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,null,null,null,null,?,'粒',null)
                """, id, Long.parseLong(TENANT), Long.parseLong(ORGANIZATION), Long.parseLong(DEPARTMENT), taskId, Long.parseLong(RESIDENT), encounterId, siteId,
                originalId, no, type, occurredAt, ACTOR, ACTOR, ACTOR, quantity);
    }

    private void insertDispenseLine(long id, long dispenseId, long taskLineId, Long originalLineId,
                                    long binId, long stockItemId, long lotId, long transactionLineId,
                                    BigDecimal quantity) {
        jdbc.update("""
                insert into RHN_SUP_MED_DISP_LINE (ID_MED_DISP_LINE, ID_TNT, ID_MED_DISP, ID_DISP_TASK_LINE,
                    ID_MED_DISP_LINE_ORIG, SN_SORT, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT,
                    ID_INV_TXN_LINE, QTY_DSPNSD, CD_DISP_UNIT, BASE_QTY_FACTOR)
                values (?,?,?,?,?,1,?,?,?,?,?,'粒',1)
                """, id, Long.parseLong(TENANT), dispenseId, taskLineId, originalLineId,
                binId, stockItemId, lotId, transactionLineId, quantity);
    }

    private String admit() throws Exception {
        return postJson("/api/inpatient/admissions", """
                {"residentId":"%s","bedId":"%s","admissionTypeCode":"GENERAL",
                 "admissionSourceCode":"OUTPATIENT","admissionReason":"住院药品核销测试",
                 "commandCode":"IP-CONS-ADMIT"}
                """.formatted(RESIDENT, BED), 201).get("id").asString();
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
