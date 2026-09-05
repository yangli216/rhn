package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class OutpatientStructuredNoteFormTest extends RhnIntegrationTestSupport {

    @Test
    void published_form_versions_validate_and_snapshot_structured_note_data() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String code = "HYPERTENSION_" + suffix;
        JsonNode versionOne = json(mockMvc.perform(post("/api/outpatient/note-forms").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(createForm(code)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.formCode").value(code))
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.definitionSchema").value("RHN.OUTPATIENT_NOTE_FORM_DEFINITION.V1"))
                .andExpect(jsonPath("$.sections[0].fields[0].type").value("NUMBER"))
                .andReturn().getResponse().getContentAsString());

        JsonNode versionTwo = json(mockMvc.perform(post("/api/outpatient/note-forms/{code}/versions", code)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(reviseForm()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.name").value("高血压规范复诊"))
                .andReturn().getResponse().getContentAsString());

        String visible = mockMvc.perform(get("/api/outpatient/note-forms").with(rhnWorkContext())
                        .param("specialtyCode", "GENERAL_PRACTICE"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode current = StreamSupport.stream(objectMapper.readTree(visible).spliterator(), false)
                .filter(value -> code.equals(value.path("formCode").asText())).findFirst().orElseThrow();
        assertEquals(2, current.path("version").asInt());

        mockMvc.perform(post("/api/outpatient/note-forms/{code}/versions", code)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(reviseForm()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOTE_FORM_VERSION_CONFLICT"));

        String encounterId = createStartedEncounter();
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(record(versionOne.get("id").asText(), "{}", "FORM-OLD-" + suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOTE_FORM_VERSION_RETIRED"));

        String versionTwoId = versionTwo.get("id").asText();
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(record(versionTwoId, "{\"homeSystolic\":142}", "FORM-MISSING-" + suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NOTE_FORM_FIELD_REQUIRED"));

        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(record(versionTwoId,
                                "{\"homeSystolic\":142,\"medicationAdherence\":\"GOOD\",\"adverseEffects\":\"无\"}",
                                "FORM-VALID-" + suffix)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/clinical-documents").with(rhnWorkContext())
                        .param("encounterId", encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].contentSchema").value("RHN.OUTPATIENT_NOTE.V3"))
                .andExpect(jsonPath("$[0].content.structuredForm.formCode").value(code))
                .andExpect(jsonPath("$[0].content.structuredForm.version").value(2))
                .andExpect(jsonPath("$[0].content.structuredForm.sections[0].fields[1].label").value("服药依从性"))
                .andExpect(jsonPath("$[0].content.structuredData.homeSystolic").value(142))
                .andExpect(jsonPath("$[0].content.structuredData.medicationAdherence").value("GOOD"));
    }

    private String createStartedEncounter() throws Exception {
        String resident = mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"结构化病历居民","identifiers":[{"system":"9","value":"NOTE-FORM-198801011488","useType":"SECONDARY"}],
                                 "gender":"FEMALE","birthDate":"1988-01-01"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String residentId = objectMapper.readTree(resident).get("id").asText();
        String encounter = mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "idempotencyCode":"FORM-REG-%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, residentId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String encounterId = objectMapper.readTree(encounter).get("id").asText();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        return encounterId;
    }

    private String createForm(String code) {
        return """
                {"formCode":"%s","name":"高血压复诊","description":"全科慢病随访结构",
                 "specialtyCode":"GENERAL_PRACTICE","sections":[
                   {"code":"followUp","title":"复诊评估","fields":[
                     {"code":"homeSystolic","label":"家庭收缩压","type":"NUMBER","required":true,
                      "unit":"mmHg","minimum":40,"maximum":300},
                     {"code":"medicationAdherence","label":"服药依从性","type":"SELECT","required":true,
                      "options":[{"value":"GOOD","label":"良好"},{"value":"POOR","label":"较差"}]}
                   ]}
                 ]}
                """.formatted(code);
    }

    private String reviseForm() {
        return """
                {"expectedVersion":1,"name":"高血压规范复诊","description":"第二版增加不良反应记录",
                 "specialtyCode":"GENERAL_PRACTICE","sections":[
                   {"code":"followUp","title":"复诊评估","fields":[
                     {"code":"homeSystolic","label":"家庭收缩压","type":"NUMBER","required":true,
                      "unit":"mmHg","minimum":40,"maximum":300},
                     {"code":"medicationAdherence","label":"服药依从性","type":"SELECT","required":true,
                      "options":[{"value":"GOOD","label":"良好"},{"value":"POOR","label":"较差"}]},
                     {"code":"adverseEffects","label":"药物不良反应","type":"TEXTAREA","required":false,
                      "maxLength":500}
                   ]}
                 ]}
                """;
    }

    private String record(String formVersionId, String structuredData, String commandCode) {
        return """
                {"commandCode":"%s","chiefComplaint":"血压升高复诊","systolic":148,"diastolic":92,
                 "noteFormVersionId":"%s","structuredData":%s,
                 "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]}
                """.formatted(commandCode, formVersionId, structuredData);
    }
}
