package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientAdmissionFlowTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED_01 = "362387869898512";
    private static final String BED_02 = "362387869898513";

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void direct_admission_transfer_discharge_and_bed_release_form_one_transactionally_safe_flow() throws Exception {
        mockMvc.perform(get("/api/inpatient/bootstrap").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.beds.length()").value(4))
                .andExpect(jsonPath("$.beds[?(@.id == '" + BED_01 + "')].displayStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.episodes.length()").value(0));

        String admissionCommand = "TEST-INPATIENT-ADMIT-01";
        String admissionBody = """
                {
                  "residentId":"%s",
                  "bedId":"%s",
                  "admissionTypeCode":"GENERAL",
                  "admissionSourceCode":"OUTPATIENT",
                  "admissionReason":"反复咳嗽伴气促，需要住院观察",
                  "admissionMethodCode":"WHEELCHAIR",
                  "conditionCode":"URGENT",
                  "paymentMethodCode":"BASIC_MEDICAL_INSURANCE",
                  "referralOrganizationName":"青禾社区卫生服务站",
                  "emergencyContactName":"李家属",
                  "emergencyContactRelationship":"2",
                  "emergencyContactPhone":"13800000000",
                  "admissionNote":"需要协助办理医保入院",
                  "nursingLevelCode":"LEVEL_III",
                  "dietCode":"NORMAL",
                  "commandCode":"%s"
                }
                """.formatted(RESIDENT, BED_01, admissionCommand);
        mockMvc.perform(post("/api/inpatient/admissions")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(admissionBody.replace("\"emergencyContactRelationship\":\"2\"", "\"emergencyContactRelationship\":\"INVALID_RELATIONSHIP\"")
                                .replace(admissionCommand, "TEST-INPATIENT-INVALID-RELATIONSHIP")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INPATIENT_CONTACT_RELATIONSHIP_INVALID"));

        String admissionResponse = mockMvc.perform(post("/api/inpatient/admissions")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(admissionBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ADMITTED"))
                .andExpect(jsonPath("$.residentId").value(RESIDENT))
                .andExpect(jsonPath("$.bedId").value(BED_01))
                .andExpect(jsonPath("$.bedNo").value("01床"))
                .andExpect(jsonPath("$.departmentName").value("综合病区"))
                .andExpect(jsonPath("$.admissionMethodCode").value("WHEELCHAIR"))
                .andExpect(jsonPath("$.conditionCode").value("URGENT"))
                .andExpect(jsonPath("$.paymentMethodCode").value("BASIC_MEDICAL_INSURANCE"))
                .andExpect(jsonPath("$.emergencyContactName").value("李家属"))
                .andExpect(jsonPath("$.emergencyContactRelationship").value("2"))
                .andExpect(jsonPath("$.emergencyContactRelationshipText").value("子"))
                .andExpect(jsonPath("$.emergencyContactPhone").value("13800000000"))
                .andExpect(jsonPath("$.admissionNote").value("需要协助办理医保入院"))
                .andReturn().getResponse().getContentAsString();
        String episodeId = json(admissionResponse).get("id").asString();
        String encounterId = json(admissionResponse).get("encounterId").asString();

        mockMvc.perform(post("/api/inpatient/admissions")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(admissionBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(episodeId));

        mockMvc.perform(post("/api/inpatient/admissions")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(admissionBody.replace(BED_01, BED_02).replace(admissionCommand, "TEST-DUPLICATE-RESIDENT")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_ALREADY_ADMITTED"));

        String transferBody = """
                {
                  "expectedRevision":0,
                  "targetBedId":"%s",
                  "reason":"患者需要靠近护士站观察",
                  "commandCode":"TEST-INPATIENT-TRANSFER-01"
                }
                """.formatted(BED_02);
        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/transfer", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(transferBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.bedId").value(BED_02))
                .andExpect(jsonPath("$.bedNo").value("02床"));

        mockMvc.perform(get("/api/inpatient/bootstrap").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.beds[?(@.id == '" + BED_01 + "')].displayStatus").value("CLEANING"))
                .andExpect(jsonPath("$.beds[?(@.id == '" + BED_02 + "')].displayStatus").value("OCCUPIED"));

        prepareSignedDischargeRecord(RESIDENT, encounterId, "ADMISSION-FLOW");
        recordPrimaryDischargeDiagnosis(episodeId, 1, "J18.900", "肺炎", "ADMISSION-FLOW-DIAGNOSIS");

        String dischargeBody = """
                {
                  "expectedRevision":1,
                  "dispositionCode":"HOME",
                  "note":"病情好转，回家继续口服用药",
                  "commandCode":"TEST-INPATIENT-DISCHARGE-01"
                }
                """;
        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/discharge", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(dischargeBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(2))
                .andExpect(jsonPath("$.status").value("DISCHARGED"))
                .andExpect(jsonPath("$.bedNo").value("02床"))
                .andExpect(jsonPath("$.dischargeDispositionCode").value("HOME"));

        mockMvc.perform(get("/api/inpatient/bootstrap").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.episodes.length()").value(0))
                .andExpect(jsonPath("$.beds[?(@.id == '" + BED_02 + "')].displayStatus").value("CLEANING"));

        mockMvc.perform(get("/api/inpatient/bootstrap").with(rhnWorkContext()).queryParam("status", "ALL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.episodes[0].id").value(episodeId))
                .andExpect(jsonPath("$.episodes[0].status").value("DISCHARGED"));

        String releaseBody = """
                {
                  "expectedRevision":1,
                  "status":"AVAILABLE",
                  "reason":"床单位清洁消毒完成",
                  "commandCode":"TEST-INPATIENT-BED-RELEASE-01"
                }
                """;
        mockMvc.perform(post("/api/inpatient/beds/{bedId}/status", BED_02)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(releaseBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(2))
                .andExpect(jsonPath("$.displayStatus").value("AVAILABLE"));

        assertEquals(0, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_INP_BED_OCCUP where ID_TNT = ?", Integer.class, Long.valueOf(TENANT)));
        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_ENC_LOC_HIST where ID_TNT = ? and SD_STATUS = 'COMPLETED'",
                Integer.class, Long.valueOf(TENANT)));
        assertEquals(4, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_INP_EVT where ID_TNT = ?", Integer.class, Long.valueOf(TENANT)));
        assertEquals("WHEELCHAIR", jdbcTemplate.queryForObject(
                "select CD_ADM_METHOD as admission_method_code from RHN_VIS_INP_EPISODE_DETAIL where ID_CARE_EPISODE = ?",
                String.class, Long.valueOf(episodeId)));
        assertEquals("13800000000", jdbcTemplate.queryForObject(
                "select EMERG_CONTACT_PHONE from RHN_VIS_INP_EPISODE_DETAIL where ID_CARE_EPISODE = ?",
                String.class, Long.valueOf(episodeId)));
        assertEquals("2", jdbcTemplate.queryForObject(
                "select EMERG_CONTACT_RELSHIP from RHN_VIS_INP_EPISODE_DETAIL where ID_CARE_EPISODE = ?",
                String.class, Long.valueOf(episodeId)));
    }

}
