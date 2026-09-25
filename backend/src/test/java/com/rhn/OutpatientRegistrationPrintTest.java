package com.rhn;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("outpatient-main-flow")
class OutpatientRegistrationPrintTest extends RhnIntegrationTestSupport {

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void registration_ticket_generates_immutable_pdf_and_audit() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String registrationId = encounter.get("registrationId").asString();
        String encounterId = encounter.get("id").asString();

        String idempotencyKey = "REG-PRINT-" + suffix;
        String request = """
                {"taskCode":"OP.REGISTRATION.TICKET.PRINT",
                 "source":{"sourceType":"PatientRegistration","sourceId":"%s","encounterId":"%s"},
                 "purpose":"PATIENT_COPY","copies":1,"idempotencyKey":"%s"}
                """.formatted(registrationId, encounterId, idempotencyKey);
        JsonNode ticketReceipt = json(mockMvc.perform(post("/api/platform/printing/tasks").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("GENERATED"))
                .andExpect(jsonPath("$.taskCode").value("OP.REGISTRATION.TICKET.PRINT"))
                .andExpect(jsonPath("$.templateCode").value("OUTPATIENT_REGISTRATION_TICKET_80"))
                .andExpect(jsonPath("$.delivery.channel").value("BROWSER_PDF"))
                .andExpect(jsonPath("$.contentDigest").isNotEmpty())
                .andReturn().getResponse().getContentAsString());

        byte[] pdf = download(ticketReceipt);
        assertPdf(pdf);

        // 幂等重放
        JsonNode replay = json(mockMvc.perform(post("/api/platform/printing/tasks").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        assertEquals(ticketReceipt.get("jobId").asString(), replay.get("jobId").asString());
        assertEquals(ticketReceipt.get("outputId").asString(), replay.get("outputId").asString());
    }

    private byte[] download(JsonNode receipt) throws Exception {
        MvcResult result = mockMvc.perform(get(receipt.get("downloadUrl").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andReturn();
        return result.getResponse().getContentAsByteArray();
    }

    private void assertPdf(byte[] pdf) {
        assertNotNull(pdf);
        assertTrue(pdf.length > 500);
        assertEquals("%PDF", new String(pdf, 0, 4, StandardCharsets.US_ASCII));
    }

    private String createResident(String suffix) throws Exception {
        String nationalId = "11010119900101" + suffix.substring(0, 4);
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"挂号打印测试患者","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],"gender":"FEMALE","birthDate":"1990-01-01"}
                                """.formatted(nationalId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }
}
