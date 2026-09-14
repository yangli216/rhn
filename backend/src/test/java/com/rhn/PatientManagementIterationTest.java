package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PatientManagementIterationTest extends RhnIntegrationTestSupport {
    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void resident_profile_and_schedule_backed_reception_form_one_persistent_flow() throws Exception {
        String suffix = Long.toString(GlobalIds.next()).substring(13);
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"基层门诊患者%s","identifiers":[{"system":"9","value":"33010219900101%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1990-01-01","phone":"13800138088"
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.version").value(0))
                .andReturn().getResponse().getContentAsString());
        String residentId = resident.get("id").asString();

        mockMvc.perform(put("/api/residents/{residentId}/profile", residentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedVersion":0,"fullName":"基层门诊患者%s","gender":"FEMALE",
                                  "birthDate":"1990-01-01","phone":"13800138088","deceased":false,
                                  "demographicProfile":{"nationalityCode":"CN","ethnicityCode":"01",
                                    "sdResidencyType":"HOUSEHOLD","sdMaritalStatus":"2",
                                    "sdEducationLevel":"30","sdOccupationType":"200",
                                    "sdBloodType":"A","sdRhType":"POSITIVE"},
                                  "addresses":[{"sdUse":"HOME","provinceCode":"330000000000","cityCode":"330100000000",
                                    "districtCode":"330102000000","addressText":"示范街道一号","postalCode":"310000",
                                    "primary":true,"validFrom":"2020-01-01"}],
                                  "relatedPersons":[{"fullName":"患者家属","sdRelationship":"1",
                                    "phone":"13800138089","guardian":false,"emergencyContact":true,
                                    "validFrom":"2020-01-01"}],
                                  "coverages":[{"sdCoverageType":"01","payerName":"城镇职工基本医疗保险",
                                    "memberNo":"YB%s","primary":true,"validFrom":"2020-01-01"}]
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resident.version").value(1))
                .andExpect(jsonPath("$.demographicProfile.sdMaritalStatus").value("2"))
                .andExpect(jsonPath("$.demographicProfile.sdMaritalStatusText").value("已婚"))
                .andExpect(jsonPath("$.demographicProfile.sdResidencyTypeText").value("户籍人口"))
                .andExpect(jsonPath("$.demographicProfile.sdEducationLevelText").value("大学专科教育"))
                .andExpect(jsonPath("$.addresses[0].primary").value(true))
                .andExpect(jsonPath("$.relatedPersons[0].emergencyContact").value(true))
                .andExpect(jsonPath("$.coverages[0].sdCoverageType").value("01"))
                .andExpect(jsonPath("$.coverages[0].sdCoverageTypeText").value("城镇职工基本医疗保险"));

        mockMvc.perform(get("/api/residents")
                        .with(rhnWorkContext())
                        .queryParam("query", "YB" + suffix))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(residentId));

        LocalDate today = LocalDate.now();
        jdbcTemplate.update("delete from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED in (select ID_SVC_SCHED from RHN_SC_SVC_SCHED where ID_PRACT = 362387869790223 and DA_SVC = ?)", today);
        jdbcTemplate.update("delete from RHN_SC_APPT where ID_SVC_SCHED in (select ID_SVC_SCHED from RHN_SC_SVC_SCHED where ID_PRACT = 362387869790223 and DA_SVC = ?)", today);
        jdbcTemplate.update("delete from RHN_SC_SVC_SCHED where ID_PRACT = 362387869790223 and DA_SVC = ?", today);
        JsonNode generated = json(mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"362387869790223","catalogItemId":"362387869795104",
                                  "dateFrom":"%s","dateTo":"%s","weekdays":[%d],"dayParts":["MORNING"],
                                  "morningStart":"08:00","morningEnd":"12:00","capacity":5,
                                  "locationName":"全科门诊一诊室","idempotencyCode":"reception-schedule-%s"
                                }
                                """.formatted(today, today, today.getDayOfWeek().getValue(), suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.generatedCount").value(1))
                .andReturn().getResponse().getContentAsString());
        String scheduleId = generated.get("schedules").get(0).get("id").asString();
        String requestCode = "registration-" + suffix;

        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "scheduleId":"%s","idempotencyCode":"%s",
                                  "registrationSource":"WINDOW","visitType":"GENERAL"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, scheduleId, requestCode)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.registrationId").isNotEmpty())
                .andExpect(jsonPath("$.appointmentId").isNotEmpty())
                .andExpect(jsonPath("$.scheduleId").value(scheduleId))
                .andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asString();

        mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "scheduleId":"%s","idempotencyCode":"%s",
                                  "registrationSource":"WINDOW","visitType":"GENERAL"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, scheduleId, requestCode)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(encounterId));

        mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", today.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(encounterId)).value("WAITING"))
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].registrationStatus".formatted(encounterId))
                        .value("REGISTERED"))
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].residentName".formatted(encounterId))
                        .value("基层门诊患者" + suffix));

        mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s",
                                 "idempotencyCode":"duplicate-%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ENCOUNTER_ACTIVE_DUPLICATE"));

        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        mockMvc.perform(get("/api/outpatient/reception/queue").with(rhnWorkContext())
                        .queryParam("date", today.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].status".formatted(encounterId))
                        .value("SERVING"))
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].registrationStatus".formatted(encounterId))
                        .value("REGISTERED"));

        assertEquals(1, jdbcTemplate.queryForObject(
                "select QTY_OCCUPIED from RHN_SC_SCHED_SLOT_POOL where ID_SVC_SCHED = ?", Integer.class,
                Long.valueOf(scheduleId)));
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_SC_APPT where ID_APPT = ?", Integer.class,
                encounter.get("appointmentId").asLong()));
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_SC_QUEUE_TICKET where SD_SOURCE_TYPE = 'PAT_REG' and ID_SOURCE = ?", Integer.class,
                encounter.get("registrationId").asLong()));
        assertEquals("REGISTERED", jdbcTemplate.queryForObject(
                "select SD_STATUS as status from RHN_SC_PAT_REG where ID_PAT_REG = ?", String.class,
                encounter.get("registrationId").asLong()));
    }

    @Test
    void rich_registration_persists_the_complete_resident_profile_in_one_transaction() throws Exception {
        String suffix = "%04d".formatted(Math.floorMod(GlobalIds.next(), 10_000));
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"完整建档居民%s","nationalId":"",
                                  "gender":"MALE","birthDate":"1988-01-01","phone":"1380013%s",
                                  "identifiers":[
                                    {"system":"6","value":"P%s","useType":"OFFICIAL"},
                                    {"system":"9","value":"JK%s","useType":"SECONDARY"}
                                  ],
                                  "demographicProfile":{"nationalityCode":"CN","ethnicityCode":"01",
                                    "sdResidencyType":"NON_HOUSEHOLD","sdMaritalStatus":"2",
                                    "sdEducationLevel":"20","sdOccupationType":"200",
                                    "sdBloodType":"O","sdRhType":"POSITIVE"},
                                  "addresses":[{"sdUse":"HOME","addressText":"幸福街道健康路 8 号",
                                    "primary":true,"validFrom":"2024-01-01"}],
                                  "relatedPersons":[{"fullName":"紧急联系人","sdRelationship":"1",
                                    "phone":"1390013%s","guardian":false,"emergencyContact":true,
                                    "validFrom":"2024-01-01"}],
                                  "coverages":[{"sdCoverageType":"02","payerName":"城镇居民基本医疗保险",
                                    "memberNo":"YB%s","primary":true,"validFrom":"2024-01-01"}],
                                  "employments":[{"employerName":"基层健康服务中心",
                                    "sdOccupationType":"200","phone":"0571-12345678",
                                    "addressText":"健康路 10 号","primary":true,"validFrom":"2024-01-01"}]
                                }
                                """.formatted(suffix, suffix, suffix, suffix, suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.identifiers.length()").value(2))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/residents/{residentId}/profile", resident.get("id").asString())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.demographicProfile.sdResidencyTypeText").value("非户籍常住人口"))
                .andExpect(jsonPath("$.demographicProfile.sdEducationLevelText").value("大学本科教育"))
                .andExpect(jsonPath("$.addresses[0].addressText").value("幸福街道健康路 8 号"))
                .andExpect(jsonPath("$.relatedPersons[0].sdRelationshipText").value("配偶"))
                .andExpect(jsonPath("$.coverages[0].sdCoverageTypeText").value("城镇居民基本医疗保险"))
                .andExpect(jsonPath("$.employments[0].employerName").value("基层健康服务中心"))
                .andExpect(jsonPath("$.employments[0].sdOccupationTypeText").value("专业技术人员"));
    }
}
