package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class InpatientAdmissionUnknownFactsTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void omitted_optional_admission_and_discharge_facts_remain_unknown_in_storage_and_queries() throws Exception {
        String residentId = "362387869790213";
        var admission = json(mockMvc.perform(post("/api/inpatient/admissions").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","bedId":"362387869898512","commandCode":"UNKNOWN-ADMISSION"}
                                """.formatted(residentId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String episodeId = admission.get("id").asString();
        String encounterId = admission.get("encounterId").asString();
        String[][] fields = {
                {"admissionTypeCode", "CD_ADM_TYPE"}, {"admissionSourceCode", "CD_ADM_SRC"},
                {"admissionMethodCode", "CD_ADM_METHOD"}, {"conditionCode", "CD_COND"},
                {"paymentMethodCode", "CD_PAY_METHOD"}, {"nursingLevelCode", "CD_NURS_LEVEL"},
                {"dietCode", "CD_DIET"}
        };
        for (String[] field : fields) {
            mockMvc.perform(get("/api/inpatient/bootstrap").with(rhnWorkContext()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.episodes[0]." + field[0]).doesNotExist());
            assertNull(jdbcTemplate.queryForObject("select " + field[1]
                    + " from RHN_VIS_INP_EPISODE_DETAIL where ID_CARE_EPISODE = ?",
                    String.class, Long.valueOf(episodeId)), field[0]);
        }
        prepareSignedDischargeRecord(residentId, encounterId, "UNKNOWN-DISCHARGE");
        recordPrimaryDischargeDiagnosis(episodeId, 0, "J18.900", "肺炎", "UNKNOWN-DISCHARGE-DIAGNOSIS");
        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/discharge", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":0,"commandCode":"UNKNOWN-DISCHARGE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DISCHARGED"))
                .andExpect(jsonPath("$.dischargeDispositionCode").doesNotExist());
        assertNull(jdbcTemplate.queryForObject(
                "select CD_DISCH_DISPOS from RHN_VIS_INP_EPISODE_DETAIL where ID_CARE_EPISODE = ?",
                String.class, Long.valueOf(episodeId)));
    }
}
