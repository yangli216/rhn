package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MedicationSafetyGovernanceTest extends RhnIntegrationTestSupport {

    @Test
    void representative_skin_test_and_special_antimicrobial_drugs_are_available() throws Exception {
        mockMvc.perform(get("/api/platform/master-data/medications")
                        .param("query", "DEMO-DRUG-PEN-G").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("青霉素钠"))
                .andExpect(jsonPath("$[0].sdAntimicrobialLevel").value("NON_RESTRICTED"))
                .andExpect(jsonPath("$[0].antimicrobialOutpatientAllowed").value(true))
                .andExpect(jsonPath("$[0].skinTestRequired").value(true))
                .andExpect(jsonPath("$[0].skinTestMethod").value("INTRADERMAL"))
                .andExpect(jsonPath("$[0].skinTestSolutionMode").value("DILUTED_SOLUTION"))
                .andExpect(jsonPath("$[0].skinTestObservationMinutes").value(20))
                .andExpect(jsonPath("$[0].skinTestResultValidityHours").value(24))
                .andExpect(jsonPath("$[0].classifications[?(@.systemCode == 'NEML')].systemVersion").value("2026"))
                .andExpect(jsonPath("$[0].classifications[?(@.systemCode == 'ATC')].code").value("J01CE01"))
                .andExpect(jsonPath("$[0].allergenConceptIds").isArray());

        mockMvc.perform(get("/api/platform/master-data/medications")
                        .param("query", "DEMO-DRUG-MEM").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("美罗培南"))
                .andExpect(jsonPath("$[0].sdAntimicrobialLevel").value("SPECIAL"))
                .andExpect(jsonPath("$[0].antimicrobialOutpatientAllowed").value(false))
                .andExpect(jsonPath("$[0].antimicrobialConsultationRequired").value(true))
                .andExpect(jsonPath("$[0].antimicrobialEmergencyAllowed").value(true));
    }

    @Test
    void controlled_allergen_terms_support_drug_class_prescribing_checks() throws Exception {
        mockMvc.perform(get("/api/allergen-terms").param("category", "DRUG").param("query", "青霉素")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'PENICILLINS')].display").value("青霉素类"))
                .andExpect(jsonPath("$[?(@.code == 'AMOXICILLIN')].conceptType").value("DRUG_INGREDIENT"));

        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"类别过敏测试患者","identifiers":[{"system":"9","value":"CLASS%s",
                                "useType":"SECONDARY"}],"gender":"FEMALE","birthDate":"1990-01-01"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String encounterId = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());

        mockMvc.perform(post("/api/residents/{id}/allergies", residentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"encounterId":"%s","allergenId":"362387873140002","assertionType":"ALLERGY",
                                "categoryCode":"DRUG","criticalityCode":"HIGH","reactionSeverity":"SEVERE",
                                "informationSource":"PATIENT","reactionText":"既往速发型反应"}
                                """.formatted(encounterId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.allergenId").value("362387873140002"))
                .andExpect(jsonPath("$.substanceCode").value("PENICILLINS"))
                .andExpect(jsonPath("$.substanceDisplay").value("青霉素类"));

        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"medicationId":"362387869795201","quantity":1,"quantityUnit":"粒",
                                "substitutionAllowed":false,"selfProvided":true,"allergyReviewConfirmed":true}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MEDICATION_ALLERGY_MATCH"));
    }

    @Test
    void medication_configuration_validates_and_persists_governance_rules() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        mockMvc.perform(post("/api/platform/master-data/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(standardMedicationInput("""
                                {
                                  "code":"MED-SAFETY-%s","name":"皮试配置测试药品",
                                  "sdMedicationType":"WESTERN","sdDoseForm":"INJECTION",
                                  "preparationSpec":"1g","preparationUnit":"瓶",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":true,
                                  "sdAntimicrobialLevel":"RESTRICTED","antimicrobialOutpatientAllowed":true,
                                  "antimicrobialConsultationRequired":true,"antimicrobialEmergencyAllowed":false,
                                  "antimicrobialMaxDays":5,"skinTestRequired":true,
                                  "skinTestMethod":"PRICK","skinTestSolutionMode":"ORIGINAL_SOLUTION",
                                  "skinTestObservationMinutes":30,"skinTestResultValidityHours":48,
                                  "skinTestInstructions":"按说明书原液点刺",
                                  "chronicDiseaseDrug":false,"singleOrder":true,"sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.antimicrobialMaxDays").value(5))
                .andExpect(jsonPath("$.skinTestMethod").value("PRICK"))
                .andExpect(jsonPath("$.skinTestObservationMinutes").value(30))
                .andExpect(jsonPath("$.skinTestInstructions").value("按说明书原液点刺"));

        mockMvc.perform(post("/api/platform/master-data/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"MED-SPECIAL-BAD-%s","name":"错误门诊特殊级抗菌药",
                                  "sdMedicationType":"WESTERN","prescriptionDrug":true,
                                  "essentialDrug":false,"antimicrobial":true,
                                  "sdAntimicrobialLevel":"SPECIAL","antimicrobialOutpatientAllowed":true,
                                  "antimicrobialConsultationRequired":true,"skinTestRequired":false,
                                  "chronicDiseaseDrug":false,"singleOrder":true,"sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MEDICATION_SPECIAL_ANTIMICROBIAL_OUTPATIENT_INVALID"));
    }

    @Test
    void outpatient_ordering_blocks_special_level_and_excessive_duration() throws Exception {
        String suffix = "%04d".formatted(Math.floorMod(UUID.randomUUID().hashCode(), 10000));
        String resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"抗菌药规则患者","identifiers":[{"system":"9","value":"33010219990909%s",
                                "useType":"SECONDARY"}],"gender":"FEMALE","birthDate":"1999-09-09"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        String encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(resident, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounter)).andExpect(status().isOk());

        mockMvc.perform(get("/api/encounters/{id}/orderable-medications", encounter)
                        .param("query", "DEMO-DRUG-PEN-G").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("DEMO-DRUG-PEN-G"))
                .andExpect(jsonPath("$[0].availablePackageQuantity").value(120))
                .andExpect(jsonPath("$[0].products[0].id").value("362387872000301"));

        mockMvc.perform(get("/api/encounters/{id}/orderable-medications", encounter)
                        .param("query", "DEMO-DRUG-MEM").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("DEMO-DRUG-MEM"))
                .andExpect(jsonPath("$[0].availablePackageQuantity").value(60))
                .andExpect(jsonPath("$[0].products[0].id").value("362387872000302"));

        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounter).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"medicationId":"362387872000902","quantity":1,"quantityUnit":"瓶",
                                "substitutionAllowed":false,"selfProvided":true,"allergyReviewConfirmed":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ANTIMICROBIAL_OUTPATIENT_NOT_ALLOWED"));

        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounter).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"medicationId":"362387872000901","quantity":8,"quantityUnit":"瓶",
                                "durationValue":8,"durationUnit":"DAY","substitutionAllowed":false,
                                "selfProvided":true,"allergyReviewConfirmed":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ANTIMICROBIAL_OUTPATIENT_DURATION_EXCEEDED"));
    }
}
