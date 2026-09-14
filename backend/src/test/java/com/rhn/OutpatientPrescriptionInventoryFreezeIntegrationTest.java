package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class OutpatientPrescriptionInventoryFreezeIntegrationTest extends RhnIntegrationTestSupport {
    private static final String MEDICATION_ID = "362387869795203";
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void orderable_medications_filters_by_stock_and_prescription_freezes_and_releases_inventory() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createAndStartEncounter(residentId);
        recordNoKnownDrugAllergy(residentId, encounterId);
        saveClinicalRecord(encounterId);

        // 1. Setup pharmacy with stock and outpatient dispense route (2 boxes)
        PharmacyFixture pharmacy = createPharmacyWithStock(suffix, 2);

        // 2. Query orderable-medications for this encounter
        mockMvc.perform(get("/api/encounters/{id}/orderable-medications", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '%s')]".formatted(MEDICATION_ID)).exists())
                .andExpect(jsonPath("$[?(@.id == '%s')].stockSiteName".formatted(MEDICATION_ID)).isNotEmpty())
                .andExpect(jsonPath("$[?(@.id == '%s')].availablePackageQuantity".formatted(MEDICATION_ID)).value(2));

        // 3. Create prescription draft
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "categoryCode":"WESTERN"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());

        String prescriptionId = prescription.get("id").asString();

        // 4. Create medication request associated with prescription (1 box <= 2 available)
        JsonNode medicationRequest = json(mockMvc.perform(post(
                                "/api/encounters/{encounterId}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "prescriptionId":"%s",
                                  "medicationId":"%s",
                                  "catalogItemId":"%s","packageId":"%s","quantity":1,
                                  "quantityUnit":"BOX","substitutionAllowed":false,"selfProvided":false,
                                  "doseValue":5,"doseUnit":"mg","routeCode":"PO","frequencyCode":"QD",
                                  "durationValue":14,"durationUnit":"DAY",
                                  "medicationInstruction":"口服，每日一次",
                                  "allergyReviewConfirmed":true,
                                  "priceType":"SALE","pricingRequired":true,
                                  "performerOrganizationId":"%s","performerDepartmentId":"%s",
                                  "reason":"高血压门诊治疗"
                                }
                                """.formatted(prescriptionId, MEDICATION_ID, PRODUCT_ID, PACKAGE_ID, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());

        // 5. Submit prescription -> triggers inventory freeze (order reservation)
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{id}/submit", encounterId, prescriptionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"reason":"医生提交开立"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // Verify active freeze in database
        int activeFreezes = jdbcTemplate.queryForObject(
                "select count(*) from RHN_SUP_RX_INV_FREEZE where ID_RX=? and SD_STATUS='ACTIVE'",
                Integer.class, Long.valueOf(prescriptionId));
        assertEquals(1, activeFreezes);

        // 6. Cancel prescription -> releases frozen inventory
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{id}/cancel", encounterId, prescriptionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":1,"reason":"测试取消释放库存"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        // Verify freeze status transitioned to RELEASED
        int releasedFreezes = jdbcTemplate.queryForObject(
                "select count(*) from RHN_SUP_RX_INV_FREEZE where ID_RX=? and SD_STATUS='RELEASED'",
                Integer.class, Long.valueOf(prescriptionId));
        assertEquals(1, releasedFreezes);
    }

    @Test
    void prescription_submission_blocks_when_quantity_exceeds_available_stock() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createAndStartEncounter(residentId);
        recordNoKnownDrugAllergy(residentId, encounterId);
        saveClinicalRecord(encounterId);

        // Setup pharmacy with 1 box only
        createPharmacyWithStock(suffix, 1);

        // Create prescription draft
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "categoryCode":"WESTERN"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());

        String prescriptionId = prescription.get("id").asString();

        // Request 10 boxes (exceeds available 1 box)
        mockMvc.perform(post("/api/encounters/{encounterId}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "prescriptionId":"%s",
                                  "medicationId":"%s",
                                  "catalogItemId":"%s","packageId":"%s","quantity":10,
                                  "quantityUnit":"BOX","substitutionAllowed":false,"selfProvided":false,
                                  "doseValue":5,"doseUnit":"mg","routeCode":"PO","frequencyCode":"QD",
                                  "durationValue":14,"durationUnit":"DAY",
                                  "medicationInstruction":"口服，每日一次",
                                  "allergyReviewConfirmed":true,
                                  "priceType":"SALE","pricingRequired":true,
                                  "performerOrganizationId":"%s","performerDepartmentId":"%s",
                                  "reason":"高血压门诊治疗"
                                }
                                """.formatted(prescriptionId, MEDICATION_ID, PRODUCT_ID, PACKAGE_ID, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        // Submit prescription -> should be blocked by insufficient inventory (409 Conflict)
        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{id}/submit", encounterId, prescriptionId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":0,"reason":"医生提交开立"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVENTORY_INSUFFICIENT"));
    }

    private String createResident(String suffix) throws Exception {
        String digits = suffix.replaceAll("[^0-9]", "");
        if (digits.length() < 4) digits = (digits + "0000").substring(0, 4);
        String response = mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"门诊库存测试患者",
                                  "identifiers":[{"system":"9","value":"33010219880618%s","useType":"SECONDARY"}],
                                  "gender":"MALE","birthDate":"1988-06-18"
                                }
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json(response).get("id").asString();
    }

    private String createAndStartEncounter(String residentId) throws Exception {
        String response = mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String encounterId = json(response).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        return encounterId;
    }

    private void recordNoKnownDrugAllergy(String residentId, String encounterId) throws Exception {
        mockMvc.perform(post("/api/residents/{residentId}/allergies", residentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "encounterId":"%s",
                                  "assertionType":"NO_KNOWN_DRUG_ALLERGY",
                                  "informationSource":"PATIENT"
                                }
                                """.formatted(encounterId)))
                .andExpect(status().isCreated());
    }

    private void saveClinicalRecord(String encounterId) throws Exception {
        mockMvc.perform(put("/api/encounters/{encounterId}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "chiefComplaint":"血压升高伴头晕三天","presentIllness":"无胸痛及意识障碍",
                                  "medicalHistory":"既往高血压","physicalExam":"心肺查体未见明显异常",
                                  "treatmentPlan":"口服降压药并监测血压","systolic":158,"diastolic":96,
                                  "temperature":36.5,"pulseRate":82,
                                  "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"));
    }

    private PharmacyFixture createPharmacyWithStock(String suffix, int baseQuantity) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","departmentId":"%s",
                                  "code":"OPD-%s","name":"门诊测试药房%s",
                                  "siteType":"PHARMACY","serviceScope":"OUTPATIENT","validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                  "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                  "splitAllowed":false,"coldChain":false,"controlled":false,"highAlert":false
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-bins", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"OPD-PICK-%s","name":"门诊测试发药位","binType":"COUNTER",
                                  "stockDefault":"AVAILABLE","receiveAllowed":true,"pickAllowed":true,
                                  "countAllowed":true,"sortOrder":10
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        JsonNode lot = json(mockMvc.perform(post("/api/pharmacy/stock-items/{stockItemId}/lots", item.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "lotNo":"OPD-%s","productionDate":"2026-01-01","expiryDate":"2027-12-31",
                                  "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "requestCode":"OPD-RCV-%s","sourceCode":"OPENING-%s",
                                  "stockItemId":"%s","stockBinId":"%s","stockLotId":"%s",
                                  "operationQuantity":%d,"unitCost":0.60,"occurredAt":"%s",
                                  "description":"测试入库"
                                }
                                """.formatted(suffix, suffix, item.get("id").asString(), bin.get("id").asString(),
                                lot.get("id").asString(), baseQuantity, Instant.now())))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","code":"OPD-ROUTE-%s","name":"门诊发药路由%s",
                                  "careSetting":"OUTPATIENT","sourceDepartmentId":"%s",
                                  "targetStockSiteId":"%s","active":true,"validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, suffix, suffix, DEPARTMENT, site.get("id").asString())))
                .andExpect(status().isCreated());

        return new PharmacyFixture(item.get("id").asString());
    }

    private record PharmacyFixture(String stockItemId) {}
}
