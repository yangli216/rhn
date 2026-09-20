package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class OrderDocumentInfoIntegrationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test void prescription_metadata_is_scoped_versioned_and_survives_later_document_creation() throws Exception {
        String encounter = encounter();
        JsonNode rx = createPrescription(encounter);
        String path = "/api/encounters/" + encounter + "/prescriptions/" + rx.path("id").asString() + "/document-info";
        mockMvc.perform(put(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(update(rx.path("revision").asLong(), "I10", true, null)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.documentInfo.diagnoses[0].display").value("原发性高血压"))
                .andExpect(jsonPath("$.documentInfo.externalPrescription").value(true))
                .andExpect(jsonPath("$.documentInfo.specialDisease").value("高血压"));
        mockMvc.perform(put(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(update(rx.path("revision").asLong(), "I10", false, null)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRESCRIPTION_REVISION_CONFLICT"));
        createPrescription(encounter);
        mockMvc.perform(get("/api/encounters/" + encounter + "/prescriptions").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == '%s')].documentInfo.externalPrescription".formatted(rx.path("id").asString())).value(true));
        String other = encounter();
        mockMvc.perform(put(path.replace(encounter, other)).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(update(1, "I10", false, null)))
                .andExpect(status().isNotFound());
        jdbc.update("update RHN_EX_REQ_GRP set SD_STATUS = 'ACTIVE', DT_SUBMITTED = CURRENT_TIMESTAMP, ID_USER_SUBMITTED = ID_USER_AUTHORED where ID_REQ_GRP = ?", rx.path("id").asLong());
        mockMvc.perform(put(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(update(1, "I10", false, null)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRESCRIPTION_STATE_INVALID"));
    }

    @Test void diagnosis_validation_and_execution_guard_protect_service_metadata() throws Exception {
        String encounter = encounter();
        JsonNode service = json(mockMvc.perform(post("/api/encounters/" + encounter + "/service-requests")
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                {"catalogItemId":"362387869795101","quantity":1,"clinicalDescription":"标本说明"}
                """)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String path = "/api/encounters/" + encounter + "/service-requests/" + service.path("id").asString() + "/document-info";
        mockMvc.perform(put(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(update(service.path("revision").asLong(), "OTHER", false, "排查感染")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ORDER_DOCUMENT_DIAGNOSIS_INVALID"));
        mockMvc.perform(put(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(update(service.path("revision").asLong(), "I10", true, "排查感染")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ORDER_DOCUMENT_TYPE_INVALID"));
        JsonNode updated = json(mockMvc.perform(put(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(update(service.path("revision").asLong(), "I10", false, "排查感染")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.clinicalDescription").value("标本说明"))
                .andExpect(jsonPath("$.documentInfo.examinationPurpose").value("排查感染"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/encounters/" + encounter + "/service-requests").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].documentInfo.examinationPurpose").value("排查感染"));
        jdbc.update("update RHN_EX_DIAG_EXEC_TASK set SD_STATUS = 'COLLECTED' where ID_CARE_REQ = ?", service.path("id").asLong());
        mockMvc.perform(put(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(update(updated.path("revision").asLong(), "I10", false, "改动")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_DOCUMENT_EXECUTION_STARTED"));
    }

    private String update(long revision, String code, boolean external, String purpose) {
        return """
            {"expectedRevision":%d,"documentInfo":{"diagnoses":[{"code":"%s","display":"客户端名称","primary":true}],
             "externalPrescription":%s,"specialDisease":"高血压","examinationPurpose":%s}}
            """.formatted(revision, code, external, purpose == null ? "null" : "\"" + purpose + "\"");
    }
    private JsonNode createPrescription(String encounter) throws Exception {
        return json(mockMvc.perform(post("/api/encounters/" + encounter + "/prescriptions").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("{\"categoryCode\":\"WESTERN\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    private String encounter() throws Exception {
        String resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"fullName":"单据信息测试","gender":"FEMALE","birthDate":"1988-08-08",
                 "identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}]}
                """.formatted(UUID.randomUUID()))).andExpect(status().isCreated()).andReturn()
                .getResponse().getContentAsString()).path("id").asString();
        String id = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                """.formatted(resident, ORGANIZATION, DEPARTMENT))).andExpect(status().isCreated()).andReturn()
                .getResponse().getContentAsString()).path("id").asString();
        mockMvc.perform(verifiedEncounterStart(id)).andExpect(status().isOk());
        mockMvc.perform(put("/api/encounters/" + id + "/clinical-record").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"chiefComplaint":"血压升高","systolic":140,"diastolic":90,"diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}]}
                """)).andExpect(status().isOk());
        return id;
    }
}
