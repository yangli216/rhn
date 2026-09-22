package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class DirectVisitIntegrationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    private static final String ENABLE = "362387869795122";
    private static final String SERVICE = "362387869795123";

    @Test
    void child_can_save_note_without_blood_pressure_but_adult_and_partial_values_are_rejected() throws Exception {
        configure(ENABLE, "true");
        String child = receive(resident(java.time.LocalDate.now().minusYears(6).toString()), UUID.randomUUID().toString(), 200)
                .at("/encounter/id").asString();
        String body = """
                {"chiefComplaint":"咳嗽两天","diagnoses":[{"code":"R05","display":"咳嗽","type":"PRIMARY"}]}
                """;
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", child).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.chiefComplaint").value("咳嗽两天"))
                .andExpect(jsonPath("$.systolic").doesNotExist());
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", child).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body.replace("\"chiefComplaint\"", "\"systolic\":100,\"chiefComplaint\"")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CLINICAL_BLOOD_PRESSURE_PAIR_REQUIRED"));
        String adult = receive(resident(), UUID.randomUUID().toString(), 200).at("/encounter/id").asString();
        mockMvc.perform(put("/api/encounters/{id}/clinical-record", adult).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("OUTPATIENT_BLOOD_PRESSURE_REQUIRED"));
    }

    @Test
    void nullable_service_definition_can_be_edited_without_losing_null_default() throws Exception {
        String body = """
                {"expectedRevision":0,"categoryId":"362387869794021",
                 "key":"outpatient.direct-visit.catalog-item-id","name":"直接接诊门诊服务（编辑）",
                 "valueType":"STRING","controlType":"TEXT","jsonSchema":"{\\"type\\":\\"string\\",\\"pattern\\":\\"^[0-9]*$\\"}",
                 "defaultValueJson":"null","allowedScopes":["DEPARTMENT"],"category":"BUSINESS",
                 "inheritanceEnabled":true,"cacheEnabled":true,"nullableValue":true,
                 "sensitivity":"NORMAL","displayPolicy":"PLAIN","requestCode":"%s"}
                """;
        mockMvc.perform(put("/api/platform/configuration/definitions/{id}", SERVICE).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body.formatted(UUID.randomUUID())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.defaultValueJson").value("null"));
        configure(ENABLE, "true");
        String encounter = receive(resident(), UUID.randomUUID().toString(), 200).at("/encounter/id").asString();
        assertEquals(0, count("RHN_BIL_CHARGE_ITEM", "ID_ENC", encounter));
        mockMvc.perform(put("/api/platform/configuration/definitions/{id}", SERVICE).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body.replace("\"expectedRevision\":0", "\"expectedRevision\":1")
                        .replace("\"nullableValue\":true", "\"nullableValue\":false").formatted(UUID.randomUUID())))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PARAMETER_NULL_NOT_ALLOWED"));
    }

    @Test
    void disabled_by_default_and_service_parameter_is_department_only() throws Exception {
        mockMvc.perform(get("/api/encounters/direct-visit/settings").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        String resident = resident();
        receive(resident, UUID.randomUUID().toString(), 409);
        assertEquals(0, count("RHN_VIS_ENC", "ID_PAT", resident));
        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", SERVICE).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of(
                    "scopeType", "ORGANIZATION", "scopeId", ORGANIZATION, "valueMode", "OVERRIDE",
                    "valueJson", "\"362387869795104\"", "reason", "test", "requestCode", UUID.randomUUID().toString()))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void free_direct_visit_is_atomic_idempotent_and_does_not_require_schedule_or_account() throws Exception {
        configure(ENABLE, "true");
        String resident = resident(), command = UUID.randomUUID().toString();
        JsonNode first = receive(resident, command, 200);
        String encounter = first.at("/encounter/id").asString();
        assertEquals("CREATED", first.get("outcome").asString());
        assertEquals("IN_PROGRESS", first.at("/encounter/status").asString());
        assertTrue(first.at("/encounter/scheduleId").isNull());
        assertEquals(encounter, receive(resident, command, 200).at("/encounter/id").asString());
        assertEquals(encounter, receive(resident, UUID.randomUUID().toString(), 200).at("/encounter/id").asString());
        assertEquals(1, count("RHN_VIS_ENC", "ID_PAT", resident));
        assertEquals(1, count("RHN_SC_PAT_REG", "ID_PAT", resident));
        assertEquals(0, count("RHN_BIL_CHARGE_ITEM", "ID_ENC", encounter));
        assertEquals(0, count("RHN_BIL_PAT_ACCT", "ID_ENC", encounter));
        assertEquals(1, count("RHN_VIS_ENC_IDENT_CHECK", "ID_ENC", encounter));
    }

    @Test
    void clearing_department_service_restores_free_reception() throws Exception {
        configure(ENABLE, "true"); configure(SERVICE, "\"362387869795104\"");
        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", SERVICE).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of(
                    "scopeType", "DEPARTMENT", "scopeId", DEPARTMENT, "organizationId", ORGANIZATION,
                    "valueMode", "EXPLICIT_NULL", "expectedRevision", 0,
                    "reason", "取消门诊服务费", "requestCode", UUID.randomUUID().toString()))))
                .andExpect(status().isOk());
        String encounter = receive(resident(), UUID.randomUUID().toString(), 200).at("/encounter/id").asString();
        assertEquals(0, count("RHN_BIL_CHARGE_ITEM", "ID_ENC", encounter));
    }

    @Test
    void configured_service_is_posted_once_without_payment_and_can_be_invoiced_later() throws Exception {
        configure(ENABLE, "true"); configure(SERVICE, "\"362387869795104\"");
        String resident = resident();
        String encounter = receive(resident, UUID.randomUUID().toString(), 200).at("/encounter/id").asString();
        receive(resident, UUID.randomUUID().toString(), 200);
        assertEquals(1, count("RHN_BIL_CHARGE_ITEM", "ID_ENC", encounter));
        JsonNode statement = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounter).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("DIRECT_VISIT_SERVICE", statement.at("/charges/0/sourceType").asString());
        assertTrue(statement.at("/charges/0/totalAmount").decimalValue().signum() > 0);
        assertEquals(0, statement.get("payments").size());
        assertEquals(0, statement.get("invoices").size());
        mockMvc.perform(post("/api/encounters/{id}/service-requests", encounter).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                    {"catalogItemId":"362387869795105","quantity":1,"priceType":"SALE","pricingRequired":true,"reason":"门诊处置"}
                    """)).andExpect(status().isCreated());
        statement = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounter).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(2, statement.get("charges").size());
        String accountId = statement.at("/charges/0/patientAccountId").asString();
        String chargeId = statement.at("/charges/0/id").asString();
        assertEquals(accountId, statement.at("/charges/1/patientAccountId").asString());
        mockMvc.perform(post("/api/billing/accounts/{id}/invoices", accountId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of(
                    "invoiceNo", "DV-" + UUID.randomUUID(), "chargeItemIds", java.util.List.of(chargeId, statement.at("/charges/1/id").asString()),
                    "settlementScene", "OUTPATIENT", "terminalScene", "CASHIER"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.lines.length()").value(2));
    }

    @Test
    void existing_registration_is_reused_without_adding_service_fee_even_if_mode_disabled() throws Exception {
        configure(SERVICE, "\"362387869795104\"");
        String resident = resident();
        String original = register(resident);
        JsonNode result = receive(resident, UUID.randomUUID().toString(), 200);
        assertEquals("REUSED", result.get("outcome").asString());
        assertEquals(original, result.at("/encounter/id").asString());
        assertEquals(0, count("RHN_BIL_CHARGE_ITEM", "ID_ENC", original));
    }

    @Test
    void bad_service_rolls_back_registration_and_identity_failure_never_creates_it() throws Exception {
        configure(ENABLE, "true"); configure(SERVICE, "\"999999999\"");
        String resident = resident();
        var response = mockMvc.perform(post("/api/encounters/direct-visit").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body(resident, UUID.randomUUID().toString())))
                .andReturn().getResponse();
        assertTrue(response.getStatus() >= 400, response.getContentAsString());
        assertEquals(0, count("RHN_VIS_ENC", "ID_PAT", resident));
        assertEquals(0, count("RHN_SC_PAT_REG", "ID_PAT", resident));
        mockMvc.perform(post("/api/encounters/direct-visit").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of(
                    "residentId", resident, "commandCode", UUID.randomUUID().toString(), "factorResults", Map.of("NAME", true)))))
                .andExpect(status().isBadRequest());
        assertEquals(0, count("RHN_VIS_ENC", "ID_PAT", resident));
    }

    @Test
    void other_doctor_is_not_taken_over_and_expired_visit_is_not_reused() throws Exception {
        configure(ENABLE, "true");
        String resident = resident();
        String original = receive(resident, UUID.randomUUID().toString(), 200).at("/encounter/id").asString();
        jdbc.update("update RHN_VIS_ENC set ID_CLNCN = ? where ID_ENC = ?", "other-doctor", Long.valueOf(original));
        JsonNode conflict = receive(resident, UUID.randomUUID().toString(), 409);
        assertEquals("DIRECT_VISIT_OTHER_CLINICIAN", conflict.get("code").asString());
        jdbc.update("update RHN_VIS_ENC set DT_REGD = ? where ID_ENC = ?",
                java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(86400 * 10)), Long.valueOf(original));
        String next = receive(resident, UUID.randomUUID().toString(), 200).at("/encounter/id").asString();
        assertNotEquals(original, next);
    }

    @Test
    void simultaneous_reads_create_only_one_visit_and_service_charge() throws Exception {
        configure(ENABLE, "true"); configure(SERVICE, "\"362387869795104\"");
        String resident = resident();
        var a = CompletableFuture.supplyAsync(() -> uncheckedReceive(resident));
        var b = CompletableFuture.supplyAsync(() -> uncheckedReceive(resident));
        assertEquals(a.get().at("/encounter/id").asString(), b.get().at("/encounter/id").asString());
        assertEquals(1, count("RHN_VIS_ENC", "ID_PAT", resident));
        assertEquals(1, count("RHN_BIL_CHARGE_ITEM", "ID_PAT", resident));
    }

    @Test
    void multiple_valid_registrations_require_a_choice_and_foreign_selection_is_rejected() throws Exception {
        configure(ENABLE, "true");
        String resident = resident();
        String first = register(resident);
        jdbc.update("update RHN_VIS_ENC set DT_REGD = ? where ID_ENC = ?",
                java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(86400 * 10)), Long.valueOf(first));
        String second = register(resident);
        jdbc.update("update RHN_VIS_ENC set DT_REGD = ? where ID_ENC = ?",
                java.sql.Timestamp.from(java.time.Instant.now()), Long.valueOf(first));
        JsonNode selection = receive(resident, UUID.randomUUID().toString(), 200);
        assertEquals("SELECT_REGISTRATION", selection.get("outcome").asString());
        assertEquals(2, selection.get("candidates").size());
        assertEquals(0, count("RHN_VIS_ENC_IDENT_CHECK", "ID_ENC", first));
        var body = objectMapper.readTree(body(resident, UUID.randomUUID().toString()));
        ((tools.jackson.databind.node.ObjectNode) body).put("encounterId", second);
        mockMvc.perform(post("/api/encounters/direct-visit").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(body.toString())).andExpect(status().isOk()).andExpect(jsonPath("$.encounter.id").value(second));
        ((tools.jackson.databind.node.ObjectNode) body).put("commandCode", UUID.randomUUID().toString()).put("encounterId", "999999");
        mockMvc.perform(post("/api/encounters/direct-visit").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(body.toString())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DIRECT_VISIT_SELECTION_EXPIRED"));
    }

    @Test
    void completed_visit_is_not_reopened_and_pending_paid_registration_cannot_be_bypassed() throws Exception {
        configure(ENABLE, "true");
        String resident = resident();
        String first = receive(resident, UUID.randomUUID().toString(), 200).at("/encounter/id").asString();
        jdbc.update("update RHN_VIS_ENC set SD_STATUS = 'COMPLETED' where ID_ENC = ?", Long.valueOf(first));
        String second = receive(resident, UUID.randomUUID().toString(), 200).at("/encounter/id").asString();
        assertNotEquals(first, second);

        String pendingResident = resident();
        var today = java.time.LocalDate.now();
        String schedule = json(mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"registrationScope":"DEPARTMENT","catalogItemId":"362387869795104",
                 "dateFrom":"%s","dateTo":"%s","weekdays":[%d],"dayParts":["MORNING"],
                 "morningStart":"00:00","morningEnd":"23:59","capacity":5,"idempotencyCode":"%s"}
                """.formatted(today, today, today.getDayOfWeek().getValue(), UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).at("/schedules/0/id").asString();
        mockMvc.perform(post("/api/billing/registration-intents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("residentId", pendingResident, "organizationId", ORGANIZATION,
                    "departmentId", DEPARTMENT, "scheduleId", schedule, "idempotencyCode", UUID.randomUUID().toString(),
                    "registrationSource", "WINDOW", "visitType", "GENERAL"))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PAYMENT_PENDING"));
        assertEquals("DIRECT_VISIT_REGISTRATION_PENDING", receive(pendingResident, UUID.randomUUID().toString(), 409).get("code").asString());
        assertEquals(0, count("RHN_VIS_ENC", "ID_PAT", pendingResident));
    }

    private JsonNode uncheckedReceive(String resident) {
        try { return receive(resident, UUID.randomUUID().toString(), 200); }
        catch (Exception e) { throw new RuntimeException(e); }
    }
    private String body(String resident, String command) {
        return objectMapper.writeValueAsString(Map.of("residentId", resident, "commandCode", command,
                "factorResults", Map.of("NAME", true, "BIRTH_DATE", true), "terminalCode", "TEST"));
    }
    private JsonNode receive(String resident, String command, int expectedStatus) throws Exception {
        return json(mockMvc.perform(post("/api/encounters/direct-visit").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body(resident, command)))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString());
    }
    private int count(String table, String column, String id) {
        return jdbc.queryForObject("select count(*) from " + table + " where " + column + " = ?", Integer.class, Long.valueOf(id));
    }
    private void configure(String id, String value) throws Exception {
        mockMvc.perform(put("/api/platform/configuration/definitions/{id}/values", id).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(Map.of(
                    "scopeType", "DEPARTMENT", "scopeId", DEPARTMENT, "organizationId", ORGANIZATION,
                    "valueMode", "OVERRIDE", "valueJson", value, "reason", "直接接诊测试", "requestCode", UUID.randomUUID().toString()))))
                .andExpect(status().isOk());
    }
    private String resident() throws Exception {
        return resident("1992-03-04");
    }
    private String resident(String birthDate) throws Exception {
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("fullName", "直接接诊患者", "gender", "FEMALE", "birthDate", birthDate,
                    "identifiers", java.util.List.of(Map.of("system", "9", "value", "DV" + UUID.randomUUID(), "useType", "SECONDARY"))))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }
    private String register(String resident) throws Exception {
        return json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("residentId", resident, "organizationId", ORGANIZATION,
                    "departmentId", DEPARTMENT, "idempotencyCode", UUID.randomUUID().toString()))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }
}
