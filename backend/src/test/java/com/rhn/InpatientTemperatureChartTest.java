package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientTemperatureChartTest extends RhnIntegrationTestSupport {
    private static final String RESIDENT = "362387869790213";
    private static final String BED_01 = "362387869898512";
    private static final String BED_02 = "362387869898513";

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void append_only_vitals_and_automatic_workflow_events_form_a_queryable_week() throws Exception {
        String admissionResponse = mockMvc.perform(post("/api/inpatient/admissions")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s",
                                  "bedId":"%s",
                                  "admissionReason":"体温单纵向切片验收",
                                  "commandCode":"TEST-TEMP-CHART-ADMIT"
                                }
                                """.formatted(RESIDENT, BED_01)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String episodeId = json(admissionResponse).get("id").asString();
        String encounterId = json(admissionResponse).get("encounterId").asString();

        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/chart-events", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "eventType":"ADMISSION",
                                  "occurredAt":"%s",
                                  "displayText":"不允许手工补入院",
                                  "commandCode":"TEST-TEMP-CHART-MANUAL-ADMISSION"
                                }
                                """.formatted(Instant.now())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INPATIENT_CHART_EVENT_SYSTEM_MANAGED"));

        Instant observedAt = Instant.now();
        Instant coolingObservedAt = observedAt;
        String observationBody = """
                {
                  "observedAt":"%s",
                  "temperatureSite":"AXILLARY",
                  "temperatureCelsius":38.2,
                  "coolingTemperatureCelsius":37.5,
                  "coolingObservedAt":"%s",
                  "pulseRate":96,
                  "respiratoryRate":22,
                  "systolicBloodPressure":128,
                  "diastolicBloodPressure":76,
                  "oxygenSaturation":97,
                  "bodyWeightKg":62.5,
                  "intakeVolumeMl":850,
                  "outputVolumeMl":620,
                  "commandCode":"TEST-TEMP-CHART-OBS-01"
                }
                """.formatted(observedAt, coolingObservedAt);
        String observationResponse = mockMvc.perform(post(
                        "/api/inpatient/episodes/{episodeId}/vital-observations", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(observationBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.observedAt").value(observedAt.toString()))
                .andExpect(jsonPath("$.temperatureCelsius").value(38.2))
                .andExpect(jsonPath("$.temperatureSite").value("AXILLARY"))
                .andExpect(jsonPath("$.coolingTemperatureCelsius").value(37.5))
                .andExpect(jsonPath("$.coolingObservedAt").value(coolingObservedAt.toString()))
                .andExpect(jsonPath("$.systolicBloodPressure").value(128))
                .andExpect(jsonPath("$.status").value("RECORDED"))
                .andReturn().getResponse().getContentAsString();
        String observationId = json(observationResponse).get("id").asString();

        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/vital-observations", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(observationBody.replace("38.2", "39.9")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(observationId))
                .andExpect(jsonPath("$.temperatureCelsius").value(38.2));

        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/vital-observations", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "observedAt":"%s",
                                  "temperatureCelsius":38.0,
                                  "commandCode":"TEST-TEMP-CHART-OBS-02"
                                }
                                """.formatted(observedAt)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.temperatureCelsius").value(38.0));

        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/transfer", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedRevision":0,
                                  "targetBedId":"%s",
                                  "reason":"转至观察床",
                                  "commandCode":"TEST-TEMP-CHART-TRANSFER"
                                }
                                """.formatted(BED_02)))
                .andExpect(status().isOk());

        prepareSignedDischargeRecord(RESIDENT, encounterId, "TEMPERATURE-CHART");
        recordPrimaryDischargeDiagnosis(episodeId, 1, "R50.900", "发热", "TEMPERATURE-CHART-DIAGNOSIS");

        String dischargeResponse = mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/discharge", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedRevision":1,
                                  "dispositionCode":"HOME",
                                  "note":"病情稳定出院",
                                  "commandCode":"TEST-TEMP-CHART-DISCHARGE"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Instant dischargedAt = Instant.parse(json(dischargeResponse).get("dischargedAt").asString());

        mockMvc.perform(post("/api/inpatient/episodes/{episodeId}/vital-observations", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "observedAt":"%s",
                                  "pulseRate":80,
                                  "commandCode":"TEST-TEMP-CHART-AFTER-DISCHARGE"
                                }
                                """.formatted(dischargedAt)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INPATIENT_CHART_READ_ONLY"));

        LocalDate weekStart = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/temperature-chart", episodeId)
                        .with(rhnWorkContext()).queryParam("weekStart", weekStart.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.episodeId").value(episodeId))
                .andExpect(jsonPath("$.weekStart").value(weekStart.toString()))
                .andExpect(jsonPath("$.weekEnd").value(weekStart.plusDays(6).toString()))
                .andExpect(jsonPath("$.readOnly").value(true))
                .andExpect(jsonPath("$.observations.length()").value(2))
                .andExpect(jsonPath("$.observations[0].coolingTemperatureCelsius").value(37.5))
                .andExpect(jsonPath("$.events.length()").value(3))
                .andExpect(jsonPath("$.events[0].eventType").value("ADMISSION"))
                .andExpect(jsonPath("$.events[0].displayText").value("入院"))
                .andExpect(jsonPath("$.events[1].eventType").value("BED_TRANSFER"))
                .andExpect(jsonPath("$.events[1].displayText").value("01床→02床"))
                .andExpect(jsonPath("$.events[2].eventType").value("DISCHARGE"))
                .andExpect(jsonPath("$.events[2].occurredAt").value(dischargedAt.toString()));

        mockMvc.perform(get("/api/inpatient/episodes/{episodeId}/temperature-chart", episodeId)
                        .with(rhnWorkContext()).queryParam("weekStart", weekStart.minusWeeks(1).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.observations.length()").value(0))
                .andExpect(jsonPath("$.events.length()").value(0));

        assertEquals(2, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_INP_OBS_GRP where ID_TNT = ?",
                Integer.class, Long.valueOf(TENANT)));
        assertEquals(11, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_INP_OBS where ID_TNT = ?",
                Integer.class, Long.valueOf(TENANT)));
        assertEquals(3, jdbcTemplate.queryForObject(
                "select count(*) from RHN_VIS_INP_CHART_EVT where ID_TNT = ?",
                Integer.class, Long.valueOf(TENANT)));
        assertEquals("01床", jdbcTemplate.queryForObject(
                "select NA_SRC_LOC as source_location_name from RHN_VIS_INP_CHART_EVT where CD_COMMAND = ?",
                String.class, "TEST-TEMP-CHART-TRANSFER:CHART"));
        assertEquals("02床", jdbcTemplate.queryForObject(
                "select NA_TARGET_LOC as target_location_name from RHN_VIS_INP_CHART_EVT where CD_COMMAND = ?",
                String.class, "TEST-TEMP-CHART-TRANSFER:CHART"));
    }
}
