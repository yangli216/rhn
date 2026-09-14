package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class ClinicalAiPlanPreflightTest extends RhnIntegrationTestSupport {
    private static final String MEDICATION_ID = "362387869795203";
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";

    @Test
    void preflight_reloads_visible_plan_and_checks_allergy_directions_and_exact_routed_stock() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createStartedEncounter(residentId, suffix);
        recordDrugAllergy(residentId, encounterId);
        createPharmacyWithStock(suffix, 2);
        JsonNode plan = createPlan(suffix);
        String planId = plan.get("id").asString();
        String lineId = plan.at("/medications/0/lineId").asString();

        mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{encounterId}/plan-templates/{templateId}/preflight",
                        encounterId, planId).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"selectedMedicationLineIds":["%s"],"allergyReviewConfirmed":true}
                                """.formatted(lineId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.templateId").value(planId))
                .andExpect(jsonPath("$.templateRevision").value(plan.get("revision").asLong()))
                .andExpect(jsonPath("$.status").value("BLOCKED"))
                .andExpect(jsonPath("$.blockingCount").value(1))
                .andExpect(jsonPath("$.medications[0].lineId").value(lineId))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'ALLERGY_MATCH')].status")
                        .value("BLOCKED"))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'INVENTORY')].status")
                        .value("PASS"));

        mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{encounterId}/plan-templates/{templateId}/preflight",
                        encounterId, planId).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "selectedMedicationLineIds":["%s"],"allergyReviewConfirmed":true,
                                  "allergyOverrideReason":"患者既往在监护下耐受，权衡获益后拟继续使用"
                                }
                                """.formatted(lineId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("WARNING"))
                .andExpect(jsonPath("$.blockingCount").value(0))
                .andExpect(jsonPath("$.medications[0].status").value("WARNING"))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'PRODUCT_PACKAGE')].status")
                        .value("PASS"))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'DOSE')].status").value("PASS"))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'ROUTE')].status").value("PASS"))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'FREQUENCY')].status").value("PASS"))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'DURATION')].status").value("PASS"))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'QUANTITY')].status").value("PASS"))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'INVENTORY')].message")
                        .value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("当前可用 2 BOX"))))
                .andExpect(jsonPath("$.medications[0].checks[?(@.code == 'ALLERGY_MATCH')].status")
                        .value("WARNING"))
                .andExpect(jsonPath("$.drugInteractions.status").value("NOT_EVALUATED"))
                .andExpect(jsonPath("$.contraindications.status").value("NOT_EVALUATED"));

        mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{encounterId}/plan-templates/{templateId}/preflight",
                        encounterId, planId).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"selectedMedicationLineIds":["999999"],"allergyReviewConfirmed":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AI_PLAN_PREFLIGHT_LINE_INVALID"));
    }

    private String createResident(String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"AI预检测试患者",
                                  "identifiers":[{"system":"9","value":"AIPF%s","useType":"SECONDARY"}],
                                  "gender":"MALE","birthDate":"1975-06-18"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private String createStartedEncounter(String residentId, String suffix) throws Exception {
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "idempotencyCode":"AI-PREFLIGHT-%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        return encounterId;
    }

    private void recordDrugAllergy(String residentId, String encounterId) throws Exception {
        mockMvc.perform(post("/api/residents/{id}/allergies", residentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "encounterId":"%s","assertionType":"ALLERGY","categoryCode":"DRUG",
                                  "criticalityCode":"HIGH","reactionSeverity":"SEVERE","informationSource":"PATIENT",
                                  "substanceCode":"DRUG-AML","substanceDisplay":"氨氯地平","reactionText":"皮疹"
                                }
                                """.formatted(encounterId)))
                .andExpect(status().isCreated());
    }

    private JsonNode createPlan(String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "scopeType":"PERSONAL","name":"AI用药预检-%s",
                                  "medications":[{
                                    "medicationId":"%s","catalogItemId":"%s","packageId":"%s",
                                    "doseValue":5,"doseUnit":"mg","routeCode":"ORAL","frequencyCode":"QD",
                                    "durationValue":14,"durationUnit":"天","quantity":1,"quantityUnit":"BOX",
                                    "substitutionAllowed":true,"selfProvided":false,"priceType":"SALE",
                                    "pricingRequired":true,"medicationInstruction":"每日一次"
                                  }]
                                }
                                """.formatted(suffix, MEDICATION_ID, PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.medications[0].lineId").isString())
                .andReturn().getResponse().getContentAsString());
    }

    private void createPharmacyWithStock(String suffix, int baseQuantity) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"AIPF-%s",
                                 "name":"AI预检药房%s","siteType":"PHARMACY","serviceScope":"OUTPATIENT",
                                 "validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                 "splitAllowed":false,"coldChain":false,"controlled":false,"highAlert":false}
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-bins", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"AIPF-BIN-%s","name":"AI预检发药位","binType":"COUNTER",
                                 "stockDefault":"AVAILABLE","receiveAllowed":true,"pickAllowed":true,
                                 "countAllowed":true,"sortOrder":10}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode lot = json(mockMvc.perform(post("/api/pharmacy/stock-items/{stockItemId}/lots", item.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"lotNo":"AIPF-%s","productionDate":"2026-01-01","expiryDate":"2027-12-31",
                                 "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"AIPF-RCV-%s","sourceCode":"AIPF-OPEN-%s",
                                 "stockItemId":"%s","stockBinId":"%s","stockLotId":"%s",
                                 "operationQuantity":%d,"unitCost":0.60,"occurredAt":"%s","description":"AI预检入库"}
                                """.formatted(suffix, suffix, item.get("id").asString(), bin.get("id").asString(),
                                lot.get("id").asString(), baseQuantity, Instant.now())))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","code":"AIPF-ROUTE-%s","name":"AI预检发药路由",
                                 "careSetting":"OUTPATIENT","sourceDepartmentId":"%s","targetStockSiteId":"%s",
                                 "active":true,"validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, suffix, DEPARTMENT, site.get("id").asString())))
                .andExpect(status().isCreated());
    }
}
