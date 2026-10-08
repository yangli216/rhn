package com.rhn;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OrderDraftSaveContractTest extends RhnIntegrationTestSupport {
    @Test
    void exposes_atomic_order_save_with_required_command_and_both_lists() throws Exception {
        var doc = json(mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        var endpoint = doc.path("paths").path("/api/encounters/{encounterId}/order-drafts").path("post");
        assertFalse(endpoint.isMissingNode());
        assertEquals("saveOutpatientOrderDrafts", endpoint.path("operationId").asString());
        String exportFile = System.getProperty("rhn.openapi.export-file");
        if (exportFile != null) java.nio.file.Files.writeString(java.nio.file.Path.of(exportFile), doc.toString());
        assertTrue(endpoint.path("requestBody").path("required").asBoolean());
        var request = doc.path("components").path("schemas").path("OrderDraftSaveRequest");
        assertEquals(3, request.path("required").size());
        assertEquals("array", request.path("properties").path("medicationItems").path("type").asString());
        assertEquals("array", request.path("properties").path("serviceItems").path("type").asString());
        var response = doc.path("components").path("schemas").path("OrderDraftSaveResponse");
        assertTrue(response.path("properties").has("commandCode"));
        assertTrue(response.path("properties").has("encounterId"));
        assertTrue(response.path("properties").has("prescriptions"));
        assertTrue(response.path("properties").has("services"));
    }
}
