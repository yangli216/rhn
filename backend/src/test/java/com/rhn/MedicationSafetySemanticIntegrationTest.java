package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class MedicationSafetySemanticIntegrationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    private String MEDICATION;
    private static final String LEVOFLOXACIN = "362387880000128";

    @Test void submitting_child_levofloxacin_prescription_returns_shadow_age_contraindication_warning() throws Exception {
        String resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                  {"fullName":"儿童合理用药联调","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],
                   "gender":"MALE","birthDate":"2020-09-10"}
                """.formatted(UUID.randomUUID()))).andExpect(status().isCreated()).andReturn()
                .getResponse().getContentAsString()).path("id").asString();
        String encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                  {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                """.formatted(resident, ORGANIZATION, DEPARTMENT))).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).path("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounter)).andExpect(status().isOk());
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounter)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"categoryCode\":\"WESTERN\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String prescriptionId = prescription.path("id").asString();

        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounter).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"prescriptionId":"%s","medicationId":"%s","quantity":1,"quantityUnit":"片",
                 "doseValue":0.25,"doseUnit":"g","routeCode":"ORAL","frequencyCode":"TID",
                 "durationValue":3,"durationUnit":"DAY","allergyReviewConfirmed":true,
                 "substitutionAllowed":false,"selfProvided":true,"pricingRequired":false}
                """.formatted(prescriptionId, LEVOFLOXACIN))).andExpect(status().isCreated());

        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/submit",
                        encounter, prescriptionId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedRevision\":" + prescription.path("revision").asLong() + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.safetyEvaluation.mode").value("SHADOW"))
                .andExpect(jsonPath("$.safetyEvaluation.decision").value("BLOCK"))
                .andExpect(jsonPath("$.safetyEvaluation.findings[?(@.ruleCode == 'QMED.AGE_CONTRAINDICATION')]").exists())
                .andExpect(jsonPath("$.safetyEvaluation.findings[?(@.ruleCode == 'QMED.AGE_CONTRAINDICATION')].message")
                        .value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.allOf(
                                org.hamcrest.Matchers.containsString("未满18周岁"),
                                org.hamcrest.Matchers.containsString("左氧氟沙星")))));

        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_MED_EVAL where ID_PRESCRIPTION=?",
                Integer.class, prescriptionId)).isEqualTo(1);
    }

    @Test void saved_semantics_feed_shadow_evaluation_without_changing_orders_or_reading_current_master_data() throws Exception {
        MEDICATION = linkStandardMedication("STD-04D8635B1192769EBA24309B", "MED-2026-W185").path("id").asString();
        String resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                  {"fullName":"用药版本联调","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],
                   "gender":"MALE","birthDate":"1988-06-18"}
                """.formatted(UUID.randomUUID()))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
        String encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                  {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                """.formatted(resident, ORGANIZATION, DEPARTMENT))).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).path("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounter)).andExpect(status().isOk());
        String prescription = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounter).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"categoryCode\":\"WESTERN\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
        String path = "/api/encounters/"+encounter+"/prescriptions/"+prescription+"/safety-evaluations";
        String firstId = createItem(encounter, prescription);
        JsonNode unknownAllergy = evaluate(path);
        assertThat(unknownAllergy.path("decision").asString()).isEqualTo("BLOCK");
        assertThat(jdbc.queryForObject("select SD_STATUS from RHN_EX_CARE_REQ where ID_CARE_REQ=?", String.class, firstId)).isEqualTo("DRAFT");
        recordInpatientNoKnownDrugAllergy(resident, encounter);
        JsonNode pass = evaluate(path);
        assertThat(pass.path("decision").asString()).isEqualTo("PASS");
        createItem(encounter, prescription);
        JsonNode warn = evaluate(path);
        assertThat(warn.path("decision").asString()).isEqualTo("WARN");
        assertThat(warn.path("findings").size()).isEqualTo(1);
        assertThat(warn.path("inputHash")).isNotEqualTo(pass.path("inputHash"));
        String saved = jdbc.queryForObject("select JSON_INPUT from RHN_AUD_MED_EVAL where ID_EVAL=?", String.class, warn.path("evaluationId").asString());
        JsonNode input = json(saved);
        assertThat(input.path("schemaVersion").asString()).isEqualTo("qmed-prescription-v2");
        assertThat(input.at("/medications/0/semanticStatus").asString()).isEqualTo("VERSIONED_PARTIAL");
        String frozen = jdbc.queryForObject("select MEDICATION_SNAPSHOT from RHN_EX_MED_REQ where ID_CARE_REQ=?", String.class, firstId);
        String originalName = jdbc.queryForObject("select NA_MED from RHN_BD_MED where ID_MED=?", String.class, MEDICATION);
        try {
            jdbc.update("update RHN_BD_MED set NA_MED = ?, QTY_STRENGTH_VAL=99 where ID_MED=?", "修改后的药品名称", MEDICATION);
            JsonNode again = evaluate(path);
            assertThat(again.path("inputHash")).isEqualTo(warn.path("inputHash"));
            assertThat(again.path("decision")).isEqualTo(warn.path("decision"));
            assertThat(jdbc.queryForObject("select MEDICATION_SNAPSHOT from RHN_EX_MED_REQ where ID_CARE_REQ=?", String.class, firstId)).isEqualTo(frozen);
            mockMvc.perform(get(path+"/"+warn.path("evaluationId").asString()).with(rhnWorkContext()))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.inputHash").value(warn.path("inputHash").asString()));
        } finally {
            jdbc.update("update RHN_BD_MED set NA_MED=?, QTY_STRENGTH_VAL=5 where ID_MED=?", originalName, MEDICATION);
        }
        assertThat(jdbc.queryForObject("select SD_STATUS from RHN_EX_CARE_REQ where ID_CARE_REQ=?", String.class, firstId)).isEqualTo("DRAFT");
        assertThat(jdbc.queryForObject("select count(*) from RHN_SUP_RX_INV_FREEZE where ID_RX=?", Integer.class, prescription)).isZero();
        mockMvc.perform(get("/api/platform/master-data/clinical-semantics/impact").with(rhnWorkContext())
                .param("kind","MEDICATION").param("conceptId",MEDICATION)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.area == 'ACTIVE_ORDERS')].activeCount").value("2"))
                .andExpect(jsonPath("$[?(@.area == 'ORDER_TEMPLATES')].coverage").value("UNAVAILABLE"));
        mockMvc.perform(get("/api/encounters/1/prescriptions/"+prescription+"/safety-evaluations/"+warn.path("evaluationId").asString())
                .with(rhnWorkContext())).andExpect(status().isNotFound());
    }

    private String createItem(String encounter, String prescription) throws Exception {
        return json(mockMvc.perform(post("/api/encounters/{id}/medication-requests",encounter).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"prescriptionId":"%s","medicationId":"%s","quantity":1,"quantityUnit":"片",
                 "doseValue":5,"doseUnit":"mg","routeCode":"PO","frequencyCode":"QD",
                 "durationValue":7,"durationUnit":"DAY","allergyReviewConfirmed":true,
                 "substitutionAllowed":false,"selfProvided":true,"pricingRequired":false}
                """.formatted(prescription, MEDICATION))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.medicationSnapshot.clinicalSemantics.medicationSemanticVersion").isNotEmpty())
                .andReturn().getResponse().getContentAsString()).path("id").asString();
    }
    private JsonNode evaluate(String path) throws Exception {
        return json(mockMvc.perform(post(path).with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("SHADOW")).andExpect(jsonPath("$.evaluationId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
    }
}
