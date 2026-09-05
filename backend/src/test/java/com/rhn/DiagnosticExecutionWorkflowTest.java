package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = "rhn.diagnostics.require-settlement-authorization=true")
@Tag("outpatient-main-flow")
class DiagnosticExecutionWorkflowTest extends RhnIntegrationTestSupport {

    @Test
    void paid_laboratory_request_moves_through_collection_execution_and_local_report() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"362387869795101","quantity":1,"priceType":"SALE",
                                 "pricingRequired":true,"reason":"基层门诊血常规复查",
                                 "clinicalDescription":"发热三日，复查感染指标"}
                                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.serviceType").value("LABORATORY"))
                .andReturn().getResponse().getContentAsString());

        JsonNode tasks = json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].status".formatted(request.get("id").asText()))
                        .value("WAITING_SETTLEMENT"))
                .andReturn().getResponse().getContentAsString());
        JsonNode task = findBy(tasks, "requestId", request.get("id").asText());

        mockMvc.perform(post("/api/diagnostics/tasks/{id}/collection", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"specimenNo\":\"SP-%s\"}"
                                .formatted(task.get("revision").asLong(), suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DIAGNOSTIC_COLLECTION_STATE_INVALID"));

        JsonNode statement = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.charges.length()").value(1))
                .andReturn().getResponse().getContentAsString());
        JsonNode invoice = json(mockMvc.perform(post("/api/billing/accounts/{id}/invoices",
                                statement.get("accountId").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"invoiceNo\":\"DX-INV-%s\",\"settlementScene\":\"OUTPATIENT\"}"
                                .formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/settlements/{id}/payment-orders", invoice.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"idempotencyKey":"DX-PAY-%s","businessScene":"OUTPATIENT",
                                 "paymentSceneCode":"CASHIER","paymentMethodCode":"CASH",
                                 "amount":%s,"terminalCode":"DX-TEST"}
                                """.formatted(suffix, invoice.get("netAmount").decimalValue().toPlainString())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("SUCCEEDED"));

        tasks = json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext())
                        .param("requestType", "LABORATORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].status".formatted(request.get("id").asText()))
                        .value("READY"))
                .andReturn().getResponse().getContentAsString());
        task = findBy(tasks, "requestId", request.get("id").asText());
        JsonNode collected = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/collection", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"specimenNo\":\"SP-%s\",\"note\":\"静脉血\"}"
                                .formatted(task.get("revision").asLong(), suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COLLECTED"))
                .andExpect(jsonPath("$.specimenNo").value("SP-" + suffix))
                .andReturn().getResponse().getContentAsString());
        JsonNode started = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/start", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d}".formatted(collected.get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString());

        JsonNode report = json(mockMvc.perform(post("/api/diagnostics/tasks/{id}/local-reports", task.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"valueType":"NUMBER","observationValue":"5.8",
                                 "unitCode":"10^9/L","referenceRangeLow":3.5,"referenceRangeHigh":9.5,
                                 "interpretationCode":"N","conclusion":"白细胞计数在参考范围内"}
                                """.formatted(started.get("revision").asLong())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("FINAL"))
                .andExpect(jsonPath("$.observations[0].valueNumber").value(5.8))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext()).param("status", "COMPLETED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestId == '%s')].reportId"
                        .formatted(request.get("id").asText())).value(report.get("id").asText()));
        mockMvc.perform(get("/api/encounters/{id}/diagnostic-reports", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].conclusion").value("白细胞计数在参考范围内"));
    }

    private JsonNode findBy(JsonNode values, String field, String expected) {
        for (JsonNode value : values) if (expected.equals(value.get(field).asText())) return value;
        throw new AssertionError("未找到医技任务：" + expected);
    }

    private String createResident(String suffix) throws Exception {
        String digits = Integer.toUnsignedString(suffix.hashCode());
        String tail = ("0000" + digits).substring(("0000" + digits).length() - 4);
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"医技闭环测试居民","identifiers":[{"system":"9","value":"DIAG-%s","useType":"SECONDARY"}],
                                 "gender":"FEMALE","birthDate":"1992-08-08"}
                                """.formatted(tail)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asText())).andExpect(status().isOk());
        return encounter.get("id").asText();
    }
}
