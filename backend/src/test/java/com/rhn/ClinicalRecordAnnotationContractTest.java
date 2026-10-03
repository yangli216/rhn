package com.rhn;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ClinicalRecordAnnotationContractTest extends RhnIntegrationTestSupport {
    @Test void annotations_are_sidecar_contracts_for_writing_generation_and_save() throws Exception {
        var result = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/outpatient/note-templates'].get.operationId")
                        .value("listOutpatientNoteTemplates"))
                .andExpect(jsonPath("$.components.schemas.RecordAnnotation.properties.binding.type").value("string"))
                .andExpect(jsonPath("$.components.schemas.OutpatientPlanTemplateView.properties.searchProfile['$ref']").value("#/components/schemas/PlanSearchProfile"))
                .andExpect(jsonPath("$.components.schemas.RecordClinicalDataRequest.properties.annotations.items['$ref']")
                        .value("#/components/schemas/RecordAnnotation"))
                .andExpect(jsonPath("$.components.schemas.ClinicalAssistantDraft.properties.annotations.items['$ref']")
                        .value("#/components/schemas/RecordAnnotation"))
                .andExpect(jsonPath("$.components.schemas.OutpatientNoteTemplateContent.properties.annotations.items['$ref']")
                        .value("#/components/schemas/RecordAnnotation"))
                .andExpect(jsonPath("$.paths['/api/ai/clinical-assistant/encounters/{encounterId}/suggestions'].post.requestBody.content['application/json'].schema['$ref']")
                        .value("#/components/schemas/ClinicalAssistantGenerateRequest"))
                .andExpect(jsonPath("$.components.schemas.RecordDraft.properties.annotations.items['$ref']")
                        .value("#/components/schemas/RecordAnnotation"))
                .andReturn();
        String export = System.getProperty("rhn.openapi.export");
        if (export != null) Files.writeString(Path.of(export), result.getResponse().getContentAsString());
    }
}
