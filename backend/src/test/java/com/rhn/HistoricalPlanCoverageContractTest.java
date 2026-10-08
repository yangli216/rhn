package com.rhn;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HistoricalPlanCoverageContractTest extends RhnIntegrationTestSupport {
    @Test void publishesExplicitReviewEvidenceAndCoverageWithoutExecutableIndices() throws Exception {
        var response = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var document = json(response);
        var schemas = document.path("components").path("schemas");
        var plan = schemas.path("HistoricalStablePlanView");
        assertEquals("array", plan.path("properties").path("reviewItems").path("type").asString());
        assertEquals("#/components/schemas/HistoricalPlanReviewItem",
                plan.path("properties").path("reviewItems").path("items").path("$ref").asString());
        assertEquals("array", plan.path("properties").path("assessedCategories").path("type").asString());
        assertTrue(plan.path("required").toString().contains("\"reviewItems\""));
        assertTrue(plan.path("required").toString().contains("\"assessedCategories\""));
        var review = schemas.path("HistoricalPlanReviewItem").path("properties");
        for (String field : new String[]{"category", "sourceId", "medicationId", "catalogItemId", "code", "display", "reason"})
            assertTrue(review.has(field), field);
        assertFalse(review.has("historicalIndex"));
        assertFalse(review.has("standardIndex"));
        String export = System.getProperty("rhn.historical-coverage.openapi-export");
        if (export != null) Files.writeString(Path.of(export), response);
    }
}
