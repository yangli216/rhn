package com.rhn;

import com.rhn.billing.api.RefundDiagnosticDirectory;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = "rhn.diagnostics.require-settlement-authorization=false")
class DiagnosticSpecimenWorkflowTest extends RhnIntegrationTestSupport {
    @Autowired RefundDiagnosticDirectory refundFacts;
    @Autowired JdbcTemplate jdbc;

    @Test
    void each_tube_is_collected_received_rejected_and_replaced_without_losing_refund_evidence() throws Exception {
        var task = readyTask(2); String id = task.get("id").asString();
        String body = batch(task, UUID.randomUUID().toString());
        var tubes = postJson("/api/diagnostics/specimens", body);
        assertEquals(2, tubes.size());
        assertNotEquals(tubes.get(0).get("specimenNo"), tubes.get(1).get("specimenNo"));
        assertEquals(tubes, postJson("/api/diagnostics/specimens", body));
        var label = postJson("/api/platform/printing/tasks", """
                {"taskCode":"DIAGNOSTICS.SPECIMEN.LABEL.PRINT",
                 "source":{"sourceType":"DiagnosticSpecimen","sourceId":"%s","encounterId":"%s"},
                 "purpose":"CLINICAL_USE","copies":1,"idempotencyKey":"%s"}
                """.formatted(tubes.get(0).get("id").asString(), task.get("encounterId").asString(), UUID.randomUUID()));
        byte[] pdf = mockMvc.perform(get(label.get("downloadUrl").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        try (var reader = new org.openpdf.text.pdf.PdfReader(pdf)) {
            assertEquals(60 * 72 / 25.4, reader.getPageSize(1).getWidth(), .1);
            assertEquals(40 * 72 / 25.4, reader.getPageSize(1).getHeight(), .1);
            assertTrue(new org.openpdf.text.pdf.parser.PdfTextExtractor(reader).getTextFromPage(1)
                    .contains(tubes.get(0).get("specimenNo").asString()));
        }
        mockMvc.perform(post("/api/platform/printing/jobs/{id}/reprints", label.get("jobId").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"copies\":1}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PRINT_REPRINT_REASON_REQUIRED"));
        String reprintInput = "{\"copies\":1,\"reason\":\"标签污损\",\"idempotencyKey\":\"" + UUID.randomUUID() + "\"}";
        String reprintUrl = "/api/platform/printing/jobs/" + label.get("jobId").asString() + "/reprints";
        var reprint = postJson(reprintUrl, reprintInput);
        assertEquals("REPRINT", reprint.get("requestType").asString());
        assertEquals(reprint.get("jobId"), postJson(reprintUrl, reprintInput).get("jobId"));
        assertEquals("标签污损", jdbc.queryForObject("select DES_REPRINT from RHN_SYS_PRINT_JOB where ID_PRINT_JOB=?",
                String.class, reprint.get("jobId").asLong()));
        var first = action(tubes.get(0), "collection", "");
        assertEquals("READY", current(id).get("status").asString());
        Long requestId = Long.valueOf(task.get("requestId").asString());
        assertTrue(refundFacts.hasExecutionForRequest(Long.valueOf(TENANT), requestId));
        assertThrows(BusinessException.class, () -> refundFacts.requireUnexecutedForRefund(Long.valueOf(TENANT), List.of(requestId)));
        var second = action(tubes.get(1), "collection", "");
        var collected = current(id); assertEquals("COLLECTED", collected.get("status").asString());
        mockMvc.perform(post("/api/diagnostics/tasks/{id}/start", id).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedRevision\":" + collected.get("revision").asLong() + "}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_SPECIMEN_RECEIPT_REQUIRED"));
        first = action(first, "receipt", "");
        first = action(first, "rejection", ",\"reason\":\"标本量不足\"");
        mockMvc.perform(post(reprintUrl).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(reprintInput))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_LABEL_SOURCE_INVALID"));
        assertEquals("READY", current(id).get("status").asString());
        assertTrue(refundFacts.hasExecutionForRequest(Long.valueOf(TENANT), requestId));
        var replacement = action(first, "recollection", ",\"commandId\":\"replacement-" + first.get("id").asString() + "\"");
        assertEquals(first.get("id"), replacement.get("previousSpecimenId"));
        assertNotEquals(first.get("specimenNo"), replacement.get("specimenNo"));
        replacement = action(replacement, "collection", "");
        action(replacement, "receipt", ""); action(second, "receipt", "");
        var finalTask = current(id);
        assertEquals("IN_PROGRESS", postJson("/api/diagnostics/tasks/" + id + "/start",
                "{\"expectedRevision\":" + finalTask.get("revision").asLong() + "}").get("status").asString());
        mockMvc.perform(get("/api/diagnostics/specimens/scan").with(rhnWorkContext()).param("specimenNo", replacement.get("specimenNo").asString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.taskIds[0]").value(id));
        mockMvc.perform(post("/api/diagnostics/specimens/{id}/receipt", first.get("id").asString()).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":" + first.get("revision").asLong() + "}"))
            .andExpect(status().isConflict());
    }

    @Test
    void single_tube_collection_test() throws Exception {
        var task = readyTask(1); String id = task.get("id").asString();
        String body = batch(task, UUID.randomUUID().toString());
        var tubes = postJson("/api/diagnostics/specimens", body);
        assertEquals(1, tubes.size());
        action(tubes.get(0), "collection", "");
        assertEquals("COLLECTED", current(id).get("status").asString());
    }

    @Test
    void batch_rejects_cross_patient_and_same_command_with_changed_specimen_configuration() throws Exception {
        var first = readyTask(1); var second = readyTask(1);
        mockMvc.perform(post("/api/diagnostics/specimens").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"tasks\":[" + selection(first) + "," + selection(second) + "],\"commandId\":\"" + UUID.randomUUID() + "\"}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_SPECIMEN_PATIENT_MISMATCH"));
        String command = UUID.randomUUID().toString(); postJson("/api/diagnostics/specimens", batch(first, command));
        mockMvc.perform(post("/api/diagnostics/specimens").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(batch(first, command).replace("\"expectedRevision\":0", "\"expectedRevision\":999")))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIAGNOSTIC_COMMAND_CONTENT_CONFLICT"));
    }

    private String selection(JsonNode task) { return "{\"taskId\":\"" + task.get("id").asString() + "\",\"expectedRevision\":" + task.get("revision").asLong() + "}"; }
    private String batch(JsonNode task, String command) { return "{\"tasks\":[" + selection(task) + "],\"commandId\":\"" + command + "\"}"; }
    private JsonNode action(JsonNode tube, String operation, String extra) throws Exception {
        return postJson("/api/diagnostics/specimens/" + tube.get("id").asString() + "/" + operation,
                "{\"expectedRevision\":" + tube.get("revision").asLong() + extra + "}");
    }
    private JsonNode current(String id) throws Exception {
        return json(mockMvc.perform(get("/api/diagnostics/tasks/{id}", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private JsonNode readyTask(int quantity) throws Exception {
        String suffix = UUID.randomUUID().toString();
        var resident = postJson("/api/residents", "{\"fullName\":\"标本测试\",\"gender\":\"2\",\"birthDate\":\"1992-08-08\",\"identifiers\":[{\"system\":\"9\",\"value\":\"SPEC-" + suffix + "\",\"useType\":\"SECONDARY\"}]}");
        var encounter = postJson("/api/encounters", "{\"residentId\":\"" + resident.get("id").asString() + "\",\"organizationId\":\"" + ORGANIZATION + "\",\"departmentId\":\"" + DEPARTMENT + "\"}");
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asString())).andExpect(status().isOk());
        var request = postJson("/api/encounters/" + encounter.get("id").asString() + "/service-requests", "{\"catalogItemId\":\"362387869795101\",\"quantity\":" + quantity + ",\"priceType\":\"SALE\",\"performerDepartmentId\":\"" + DEPARTMENT + "\",\"pricingRequired\":true,\"reason\":\"测试\"}");
        var values = json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (var task : values) if (task.get("requestId").equals(request.get("id"))) return task;
        throw new AssertionError("Missing diagnostic task");
    }
    private JsonNode postJson(String url, String body) throws Exception {
        return json(mockMvc.perform(post(url).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString());
    }
}
