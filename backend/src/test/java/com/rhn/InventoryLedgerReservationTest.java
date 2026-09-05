package com.rhn;

import com.rhn.pharmacy.infrastructure.InventoryTransactionRepository;
import com.rhn.pharmacy.application.InventoryApplicationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.UUID;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class InventoryLedgerReservationTest extends RhnIntegrationTestSupport {
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";

    @Autowired
    private InventoryTransactionRepository transactionRepository;
    @Autowired
    private InventoryApplicationService inventoryService;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void immutable_receipts_fefo_reservation_release_and_concurrent_gate_form_one_atomic_slice() throws Exception {
        long transactionBaseline = transactionRepository.count();
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture fixture = createPharmacy(suffix);
        JsonNode earlyLot = createLot(fixture.stockItemId(), "EARLY-" + suffix, "2027-02-01");
        JsonNode lateLot = createLot(fixture.stockItemId(), "LATE-" + suffix, "2027-12-31");

        JsonNode earlyReceipt = receive("INV-RCV-E-" + suffix, fixture, earlyLot.get("id").asText(), "1");
        receive("INV-RCV-L-" + suffix, fixture, lateLot.get("id").asText(), "2");
        assertEquals(14, earlyReceipt.at("/lines/0/quantityDelta").decimalValue().intValueExact());

        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(receiptBody(
                                "INV-RCV-E-" + suffix, fixture, earlyLot.get("id").asText(), "1")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(earlyReceipt.get("id").asText()));
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(receiptBody(
                                "INV-RCV-E-" + suffix, fixture, earlyLot.get("id").asText(), "2")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVENTORY_REQUEST_CODE_PAYLOAD_MISMATCH"));

        Reviewer reviewer = createReviewer(suffix);
        JsonNode task1 = createReviewedTask(suffix + "A", fixture.stockItemId(), reviewer, 2);
        JsonNode reserved = reserve(task1.get("id").asText());
        assertEquals("PICKING", reserved.get("taskStatus").asText());
        assertEquals(28, reserved.get("reservedBaseQuantity").decimalValue().intValueExact());
        assertEquals(2, reserved.get("allocations").size());
        assertEquals(earlyLot.get("id").asText(), reserved.at("/allocations/0/stockLotId").asText());
        assertEquals(14, reserved.at("/allocations/0/quantityReserved").decimalValue().intValueExact());
        assertEquals(lateLot.get("id").asText(), reserved.at("/allocations/1/stockLotId").asText());

        JsonNode duplicate = reserve(task1.get("id").asText());
        assertEquals(reserved.at("/allocations/0/id").asText(), duplicate.at("/allocations/0/id").asText());
        assertEquals(2, duplicate.get("allocations").size());

        JsonNode released = json(mockMvc.perform(post(
                                "/api/pharmacy/dispense-tasks/{taskId}/reservations/release", task1.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"患者暂缓取药，释放占用\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("READY_TO_PICK"))
                .andExpect(jsonPath("$.reservedBaseQuantity").value(0))
                .andReturn().getResponse().getContentAsString());
        for (JsonNode allocation : released.get("allocations")) {
            assertEquals("RELEASED", allocation.get("status").asText());
        }

        JsonNode balancesAfterRelease = balances(fixture);
        assertEquals(42, sum(balancesAfterRelease, "quantityOnHand"));
        assertEquals(0, sum(balancesAfterRelease, "quantityReserved"));
        assertEquals(42, sum(balancesAfterRelease, "quantityAvailable"));

        JsonNode task2 = createReviewedTask(suffix + "B", fixture.stockItemId(), reviewer, 2);
        CompletableFuture<MvcResult> first = reserveAsync(task1.get("id").asText());
        CompletableFuture<MvcResult> second = reserveAsync(task2.get("id").asText());
        List<MvcResult> results = List.of(first.join(), second.join());
        assertEquals(1, results.stream().filter(value -> value.getResponse().getStatus() == 200).count());
        assertEquals(1, results.stream().filter(value -> value.getResponse().getStatus() == 409).count());
        JsonNode failure = json(results.stream().filter(value -> value.getResponse().getStatus() == 409)
                .findFirst().orElseThrow().getResponse().getContentAsString());
        assertEquals("INVENTORY_RESERVATION_INSUFFICIENT", failure.get("code").asText());

        JsonNode balancesAfterRace = balances(fixture);
        assertEquals(28, sum(balancesAfterRace, "quantityReserved"));
        assertEquals(14, sum(balancesAfterRace, "quantityAvailable"));
        assertEquals(transactionBaseline + 2, transactionRepository.count(), "预留和释放不能伪造成库存数量事务");

        JsonNode winner = json(results.stream().filter(value -> value.getResponse().getStatus() == 200)
                .findFirst().orElseThrow().getResponse().getContentAsString());
        jdbcTemplate.update("update RHN_SUP_INV_RESV set DT_EXPIRES = ? "
                        + "where ID_TNT = ? and ID_CARE_REQ = ? and SD_STATUS = 'ACTIVE'",
                Instant.now().minusSeconds(60), Long.valueOf(TENANT), winner.at("/allocations/0/requestId").asLong());
        inventoryService.expireDueReservations();
        JsonNode expired = json(mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}/reservations",
                        winner.get("taskId").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("READY_TO_PICK"))
                .andExpect(jsonPath("$.reservedBaseQuantity").value(0))
                .andReturn().getResponse().getContentAsString());
        int expiredAllocationCount = 0;
        for (JsonNode allocation : expired.get("allocations")) {
            assertTrue(!"ACTIVE".equals(allocation.get("status").asText()));
            if ("EXPIRED".equals(allocation.get("status").asText())) expiredAllocationCount++;
        }
        assertEquals(2, expiredAllocationCount);
        assertEquals(0, sum(balances(fixture), "quantityReserved"));

        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(receiptBody(
                                "INV-RCV-FRACTION-" + suffix, fixture, lateLot.get("id").asText(), "0.5")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVENTORY_RECEIPT_QUANTITY_PRECISION_INVALID"));

        JsonNode openPackage = json(mockMvc.perform(post("/api/pharmacy/inventory/open-packages")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "requestCode":"OPEN-%s","stockSiteId":"%s","stockBinId":"%s",
                                  "stockItemId":"%s","stockLotId":"%s",
                                  "occurredAt":"2026-08-27T12:00:00Z","description":"人工登记拆零"
                                }
                                """.formatted(suffix, fixture.siteId(), fixture.binId(),
                                fixture.stockItemId(), earlyLot.get("id").asText())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.remainingBaseQuantity").value(14))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/pharmacy/inventory/open-packages/{id}/events", openPackage.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].eventType").value("OPEN"))
                .andExpect(jsonPath("$[0].balanceAfter").value(14));
        mockMvc.perform(post("/api/pharmacy/inventory/reconciliations").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PASSED"))
                .andExpect(jsonPath("$.issueCount").value(0));

        mockMvc.perform(get("/api/pharmacy/inventory/transactions").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()).queryParam("periodCode", "202608"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].transactionType").value(org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.is("RECEIPT"))));
        mockMvc.perform(get("/api/pharmacy/inventory/balances/page").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()).queryParam("page", "0").queryParam("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2));
        mockMvc.perform(get("/api/pharmacy/inventory/transactions/page").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()).queryParam("periodCode", "202608")
                        .queryParam("stockItemId", fixture.stockItemId()).queryParam("page", "0")
                        .queryParam("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].lines.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void preparation_partial_dispense_patient_return_and_batch_trace_form_one_auditable_slice() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture fixture = createPharmacy(suffix);
        JsonNode lot = createLot(fixture.stockItemId(), "DSP-" + suffix, "2027-12-31");
        receive("DSP-RCV-" + suffix, fixture, lot.get("id").asText(), "3");
        Reviewer pharmacist = createReviewer("D" + suffix);
        JsonNode task = createReviewedTask("D" + suffix, fixture.stockItemId(), pharmacist, 2);
        reserve(task.get("id").asText());

        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/picking/complete", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "pickerPractitionerId":"%s","pickerAssignmentId":"%s",
                                  "description":"批次核对及配药完成"
                                }
                                """.formatted(pharmacist.practitionerId(), pharmacist.assignmentId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("READY_TO_DISPENSE"));

        jdbcTemplate.update("update RHN_SUP_STOCK_ITEM set FG_CONTROLLED = true, SD_CONTROL_LEVEL = 'LEVEL_1' "
                + "where ID_TNT = ? and ID_STOCK_ITEM = ?", Long.valueOf(TENANT), Long.valueOf(fixture.stockItemId()));
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/dispenses", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(dispenseBody("DSP-SPECIAL-" + suffix, "1", pharmacist)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SPECIAL_MEDICATION_DUAL_CONFIRMATION_REQUIRED"));
        jdbcTemplate.update("update RHN_SUP_STOCK_ITEM set FG_CONTROLLED = false, SD_CONTROL_LEVEL = null "
                + "where ID_TNT = ? and ID_STOCK_ITEM = ?", Long.valueOf(TENANT), Long.valueOf(fixture.stockItemId()));

        String firstCode = "DSP-1-" + suffix;
        JsonNode first = dispense(task.get("id").asText(), firstCode, "1", pharmacist);
        assertEquals("DISPENSE", first.get("dispenseType").asText());
        assertEquals(1, first.get("lines").size());
        assertEquals(lot.get("id").asText(), first.at("/lines/0/stockLotId").asText());
        JsonNode afterFirst = json(mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}/trace",
                        task.get("id").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("PARTIALLY_DISPENSED"))
                .andExpect(jsonPath("$.dispensedQuantity").value(1))
                .andExpect(jsonPath("$.netDispensedQuantity").value(1))
                .andReturn().getResponse().getContentAsString());
        assertEquals(1, afterFirst.get("events").size());
        JsonNode reservationAfterFirst = json(mockMvc.perform(get(
                        "/api/pharmacy/dispense-tasks/{taskId}/reservations", task.get("id").asText())
                        .with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(14, reservationAfterFirst.at("/allocations/0/quantityConsumed").decimalValue().intValueExact());
        assertEquals("PARTIAL", reservationAfterFirst.at("/allocations/0/status").asText());

        JsonNode duplicateFirst = dispense(task.get("id").asText(), firstCode, "1", pharmacist);
        assertEquals(first.get("id").asText(), duplicateFirst.get("id").asText());
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/dispenses", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(dispenseBody(firstCode, "2", pharmacist)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MEDICATION_DISPENSE_REQUEST_REUSED"));

        JsonNode second = dispense(task.get("id").asText(), "DSP-2-" + suffix, "1", pharmacist);
        mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}/trace", task.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.dispensedQuantity").value(2))
                .andExpect(jsonPath("$.events.length()").value(2));
        JsonNode afterDispenseBalance = balances(fixture);
        assertEquals(14, sum(afterDispenseBalance, "quantityOnHand"));
        assertEquals(0, sum(afterDispenseBalance, "quantityReserved"));

        String returnOne = "RET-1-" + suffix;
        JsonNode returnedFirst = returnMedication(first, returnOne, pharmacist, "RESTOCK");
        assertEquals(first.get("id").asText(), returnedFirst.get("originalDispenseId").asText());
        JsonNode duplicateReturn = returnMedication(first, returnOne, pharmacist, "RESTOCK");
        assertEquals(returnedFirst.get("id").asText(), duplicateReturn.get("id").asText());
        mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}/trace", task.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("PARTIALLY_RETURNED"))
                .andExpect(jsonPath("$.returnedQuantity").value(1))
                .andExpect(jsonPath("$.netDispensedQuantity").value(1));

        returnMedication(second, "RET-2-" + suffix, pharmacist, "QUARANTINE");
        JsonNode trace = json(mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}/trace",
                        task.get("id").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("RETURNED"))
                .andExpect(jsonPath("$.returnedQuantity").value(2))
                .andExpect(jsonPath("$.netDispensedQuantity").value(0))
                .andExpect(jsonPath("$.events.length()").value(4))
                .andExpect(jsonPath("$.returns.length()").value(2))
                .andReturn().getResponse().getContentAsString());
        assertTrue(trace.get("events").toString().contains("RETURN"));
        JsonNode finalBalances = balances(fixture);
        assertEquals(42, sum(finalBalances, "quantityOnHand"));
        assertEquals(42, sum(finalBalances, "quantityAvailable"));
        int availableStatus = 0; int quarantineStatus = 0;
        for (JsonNode balance : finalBalances) {
            if ("AVAILABLE".equals(balance.get("stockStatus").asText())) {
                availableStatus += balance.get("quantityOnHand").decimalValue().intValueExact();
            }
            if ("QUARANTINE".equals(balance.get("stockStatus").asText())) {
                quarantineStatus += balance.get("quantityOnHand").decimalValue().intValueExact();
            }
        }
        assertEquals(28, availableStatus); assertEquals(14, quarantineStatus);

        JsonNode transactions = json(mockMvc.perform(get("/api/pharmacy/inventory/transactions").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()).queryParam("periodCode", "202608"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andReturn().getResponse().getContentAsString());
        int dispenses = 0; int returns = 0;
        for (JsonNode transaction : transactions) {
            if ("DISPENSE".equals(transaction.get("transactionType").asText())) dispenses++;
            if ("RETURN".equals(transaction.get("transactionType").asText())) returns++;
        }
        assertEquals(2, dispenses); assertEquals(2, returns);
    }

    @Test
    void concurrent_final_dispense_allows_exactly_one_immutable_event() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        PharmacyFixture fixture = createPharmacy("R" + suffix);
        JsonNode lot = createLot(fixture.stockItemId(), "RACE-" + suffix, "2027-12-31");
        receive("RACE-RCV-" + suffix, fixture, lot.get("id").asText(), "1");
        Reviewer pharmacist = createReviewer("R" + suffix);
        JsonNode task = createReviewedTask("R" + suffix, fixture.stockItemId(), pharmacist, 1);
        reserve(task.get("id").asText());
        completePicking(task.get("id").asText(), pharmacist);

        CompletableFuture<MvcResult> first = dispenseAsync(
                task.get("id").asText(), "RACE-DSP-A-" + suffix, pharmacist);
        CompletableFuture<MvcResult> second = dispenseAsync(
                task.get("id").asText(), "RACE-DSP-B-" + suffix, pharmacist);
        List<MvcResult> results = List.of(first.join(), second.join());

        assertEquals(1, results.stream().filter(value -> value.getResponse().getStatus() == 201).count());
        assertEquals(1, results.stream().filter(value -> value.getResponse().getStatus() == 409).count());
        mockMvc.perform(get("/api/pharmacy/dispense-tasks/{taskId}/trace", task.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.dispensedQuantity").value(1))
                .andExpect(jsonPath("$.events.length()").value(1));
        JsonNode balance = balances(fixture);
        assertEquals(0, sum(balance, "quantityOnHand"));
        assertEquals(0, sum(balance, "quantityReserved"));
        mockMvc.perform(get("/api/pharmacy/inventory/transactions").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()).queryParam("periodCode", "202608"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    private JsonNode dispense(String taskId, String requestCode, String quantity, Reviewer pharmacist) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/dispenses", taskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(dispenseBody(requestCode, quantity, pharmacist)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private CompletableFuture<MvcResult> dispenseAsync(String taskId, String requestCode, Reviewer pharmacist) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                return mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/dispenses", taskId)
                                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                                .content(dispenseBody(requestCode, "1", pharmacist)))
                        .andReturn();
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    private void completePicking(String taskId, Reviewer pharmacist) throws Exception {
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/picking/complete", taskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "pickerPractitionerId":"%s","pickerAssignmentId":"%s",
                                  "description":"并发发药前配药复核完成"
                                }
                                """.formatted(pharmacist.practitionerId(), pharmacist.assignmentId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskStatus").value("READY_TO_DISPENSE"));
    }

    private String dispenseBody(String requestCode, String quantity, Reviewer pharmacist) {
        return """
                {
                  "requestCode":"%s","operationQuantity":%s,"occurredAt":"2026-08-27T10:00:00Z",
                  "dispenserPractitionerId":"%s","dispenserAssignmentId":"%s",
                  "description":"窗口发药"
                }
                """.formatted(requestCode, quantity, pharmacist.practitionerId(), pharmacist.assignmentId());
    }

    private JsonNode returnMedication(JsonNode dispense, String returnNo, Reviewer pharmacist,
                                      String disposition) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/dispenses/{dispenseId}/returns", dispense.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "returnNo":"%s","reasonCode":"PATIENT_NOT_USE",
                                  "occurredAt":"2026-08-27T11:00:00Z",
                                  "processorPractitionerId":"%s","processorAssignmentId":"%s",
                                  "description":"患者退药确认",
                                  "lines":[{
                                    "originalDispenseLineId":"%s","quantity":1,
                                    "disposition":"%s"
                                  }]
                                }
                                """.formatted(returnNo, pharmacist.practitionerId(), pharmacist.assignmentId(),
                                dispense.at("/lines/0/id").asText(), disposition)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private CompletableFuture<MvcResult> reserveAsync(String taskId) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                return mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reservations", taskId)
                                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                                .content("{\"expiryMinutes\":30}"))
                        .andReturn();
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        });
    }

    private JsonNode reserve(String taskId) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reservations", taskId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expiryMinutes\":30}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private int sum(JsonNode values, String field) {
        int result = 0;
        for (JsonNode value : values) result += value.get(field).decimalValue().intValueExact();
        return result;
    }

    private JsonNode balances(PharmacyFixture fixture) throws Exception {
        return json(mockMvc.perform(get("/api/pharmacy/inventory/balances").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId())
                        .queryParam("stockItemId", fixture.stockItemId()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode receive(String requestCode, PharmacyFixture fixture, String lotId, String quantity) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(receiptBody(requestCode, fixture, lotId, quantity)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String receiptBody(String requestCode, PharmacyFixture fixture, String lotId, String quantity) {
        return """
                {
                  "requestCode":"%s","sourceCode":"OPENING-%s",
                  "stockItemId":"%s","stockBinId":"%s","stockLotId":"%s",
                  "operationQuantity":%s,"unitCost":8.50,
                  "occurredAt":"2026-08-27T08:00:00Z","description":"M3.2 库存期初验收"
                }
                """.formatted(requestCode, requestCode, fixture.stockItemId(), fixture.binId(), lotId, quantity);
    }

    private JsonNode createLot(String stockItemId, String lotNo, String expiry) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-items/{stockItemId}/lots", stockItemId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "lotNo":"%s","productionDate":"2026-01-01","expiryDate":"%s",
                                  "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"
                                }
                                """.formatted(lotNo, expiry)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private PharmacyFixture createPharmacy(String suffix) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","departmentId":"%s","code":"INV-%s",
                                  "name":"库存验收药房%s","siteType":"PHARMACY","serviceScope":"OUTPATIENT",
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items",
                                site.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                  "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                  "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-bins",
                                site.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"PICK-A","name":"A区拣货位","binType":"BIN",
                                  "stockDefault":"AVAILABLE","receiveAllowed":true,
                                  "pickAllowed":true,"countAllowed":true,"sortOrder":10
                                }
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new PharmacyFixture(site.get("id").asText(), item.get("id").asText(), bin.get("id").asText());
    }

    private JsonNode createReviewedTask(String suffix, String stockItemId, Reviewer reviewer, int quantity) throws Exception {
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","quantity":%d,
                                  "substitutionAllowed":false,"selfProvided":false,"allergyReviewConfirmed":true,
                                  "businessDate":"2026-08-27","reason":"M3.2 库存预留验收"
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID, quantity)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode task = json(mockMvc.perform(post("/api/pharmacy/requests/{requestId}/intake",
                                request.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stockItemId\":\"%s\"}".formatted(stockItemId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return json(mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reviews", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "result":"PASS","pharmacistPractitionerId":"%s",
                                  "reviewerAssignmentId":"%s"
                                }
                                """.formatted(reviewer.practitionerId(), reviewer.assignmentId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("READY_TO_PICK"))
                .andReturn().getResponse().getContentAsString());
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"库存并发患者","identifiers":[{"system":"9","value":"33010219910101%s","useType":"SECONDARY"}],
                                 "gender":"MALE","birthDate":"1991-01-01"}
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asText()))
                .andExpect(status().isOk());
        return encounter.get("id").asText();
    }

    private Reviewer createReviewer(String suffix) throws Exception {
        JsonNode practitioner = json(mockMvc.perform(post("/api/platform/practitioners").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"INV-P-%s\",\"fullName\":\"库存药师\",\"sdPractGender\":\"FEMALE\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode position = json(mockMvc.perform(post("/api/platform/positions").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"INV-POS-%s","name":"库存药师","sdPositionType":"PHARMACY"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode employment = json(mockMvc.perform(post("/api/platform/employments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"%s","organizationId":"%s","code":"INV-E-%s",
                                  "sdEmploymentType":"PERMANENT","primaryEmployment":true,"hireDate":"2026-01-01"
                                }
                                """.formatted(practitioner.get("id").asText(), ORGANIZATION, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode assignment = json(mockMvc.perform(post("/api/platform/assignments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "employmentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "positionId":"%s","code":"INV-A-%s","sdAssignmentType":"PRIMARY",
                                  "primaryAssignment":true,"validFrom":"2026-01-01"
                                }
                                """.formatted(employment.get("id").asText(), ORGANIZATION, DEPARTMENT,
                                position.get("id").asText(), suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Reviewer(practitioner.get("id").asText(), assignment.get("id").asText());
    }

    private record PharmacyFixture(String siteId, String stockItemId, String binId) {}
    private record Reviewer(String practitionerId, String assignmentId) {}
}
