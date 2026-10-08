package com.rhn;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TreatmentAssessmentContractTest extends RhnIntegrationTestSupport {
    @Test void treatment_contract_requires_assessment_and_represents_unknown_results() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var schemas = json(body).path("components").path("schemas");
        assertThat(schemas.path("CompleteRequest").path("required").toString()).contains("resultCode", "adverseReaction");
        assertThat(schemas.path("StartRequest").path("required").toString()).contains("verificationMethod");
        assertThat(schemas.path("TreatmentExecutionTaskView").path("properties").path("adverseReaction").path("type").toString()).contains("null", "boolean");
        String export = System.getProperty("rhn.test.openapi-export");
        if (export != null) Files.writeString(Path.of(export), body);
    }
}
