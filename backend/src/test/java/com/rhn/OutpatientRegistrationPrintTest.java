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
    void registration_template_opens_in_designer_and_its_copy_can_be_previewed() throws Exception {
        String templateId = "270000000000009";
        String sample = """
                {"sampleData":{"organizationName":"测试卫生院","residentName":"测试患者",
                 "ticketNo":"A001","registrationNo":"GH20261003001","barcode":"GH20261003001"}}
                """;
        byte[] published = mockMvc.perform(post("/api/platform/printing/administration/templates/{id}/preview", templateId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(sample))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertPdf(published);
        JsonNode draft = json(mockMvc.perform(post("/api/platform/printing/administration/templates/{id}/drafts", templateId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        byte[] copied = mockMvc.perform(post("/api/platform/printing/administration/drafts/{id}/preview", draft.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(sample))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertPdf(copied);
    }

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

    private static final String REGISTRATION_SERVICE = "362387869795104";

    @Test
    void registration_ticket_reflects_actual_settlement_payment_details() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String scheduleId = createTodaySchedule(suffix, 10);

        JsonNode intent = json(mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "scheduleId":"%s","idempotencyCode":"PRINT-REG-%s",
                                  "registrationSource":"WINDOW","visitType":"GENERAL"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, scheduleId, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PAYMENT_PENDING"))
                .andExpect(jsonPath("$.feeAmount").value(10.00))
                .andReturn().getResponse().getContentAsString());

        String settlementId = intent.get("settlementId").asString();
        mockMvc.perform(post("/api/billing/settlements/{settlementId}/payment-orders", settlementId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "idempotencyKey":"REG-PAY-%s","businessScene":"REGISTRATION",
                                  "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH","amount":10.00,
                                  "terminalCode":"REGISTRATION-TEST"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUCCEEDED"));

        JsonNode completed = json(mockMvc.perform(get("/api/billing/registration-intents/{intentId}",
                                intent.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.encounterId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());

        String encounterId = completed.get("encounterId").asString();
        Long registrationId = jdbcTemplate.queryForObject(
                "select ID_PAT_REG from RHN_SC_PAT_REG where ID_ENC = ?", Long.class, Long.valueOf(encounterId));

        String idempotencyKey = "REG-PRINT-BILLING-" + suffix;
        String request = """
                {"taskCode":"OP.REGISTRATION.TICKET.PRINT",
                 "source":{"sourceType":"PatientRegistration","sourceId":"%s","encounterId":"%s"},
                 "purpose":"PATIENT_COPY","copies":1,"idempotencyKey":"%s"}
                """.formatted(registrationId, encounterId, idempotencyKey);
        JsonNode ticketReceipt = json(mockMvc.perform(post("/api/platform/printing/tasks").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("GENERATED"))
                .andReturn().getResponse().getContentAsString());

        String payloadJson = jdbcTemplate.queryForObject(
                "select JSON_SNAP from RHN_SYS_PRINT_OUTPUT where ID_PRINT_OUTPUT = " + ticketReceipt.get("outputId").asLong(),
                String.class);
        assertNotNull(payloadJson);
        assertTrue(payloadJson.contains("\"payableAmount\":\"10.00\""), "自费实收金额应为 10.00，实际: " + payloadJson);
        assertTrue(payloadJson.contains("\"paymentMethodName\":\"现金\""), "支付方式应为现金，实际: " + payloadJson);
        assertTrue(payloadJson.contains("\"baseFee\":\"10.00\""), "诊查费应为 10.00，实际: " + payloadJson);

        byte[] pdf = download(ticketReceipt);
        assertPdf(pdf);
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

    private String createTodaySchedule(String suffix, int capacity) throws Exception {
        java.time.LocalDate today = java.time.LocalDate.now();
        JsonNode generated = json(mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"362387869790223","catalogItemId":"%s",
                                  "dateFrom":"%s","dateTo":"%s","weekdays":[%d],"dayParts":["MORNING"],
                                  "morningStart":"00:00","morningEnd":"23:59","capacity":%d,
                                  "locationName":"挂号打印验收诊室","idempotencyCode":"REG-PRINT-SCHED-%s"
                                }
                                """.formatted(REGISTRATION_SERVICE, today, today,
                                today.getDayOfWeek().getValue(), capacity, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return generated.at("/schedules/0/id").asString();
    }
}
