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
                                  "fullName":"基层门诊患者%s","nationalId":"33010219900101%s",
                                  "gender":"FEMALE","birthDate":"1990-01-01","phone":"13800138088"
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.version").value(0))
                .andReturn().getResponse().getContentAsString());
        String residentId = resident.get("id").asText();

        mockMvc.perform(put("/api/residents/{residentId}/profile", residentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedVersion":0,"fullName":"基层门诊患者%s","gender":"FEMALE",
                                  "birthDate":"1990-01-01","phone":"13800138088","deceased":false,
                                  "demographicProfile":{"nationalityCode":"CN","ethnicityCode":"HAN",
                                    "sdResidencyType":"HOUSEHOLD","sdMaritalStatus":"MARRIED",
                                    "sdEducationLevel":"COLLEGE","sdOccupationType":"PROFESSIONAL",
                                    "sdBloodType":"A","sdRhType":"POSITIVE"},
                                  "addresses":[{"sdUse":"HOME","provinceCode":"330000000000","cityCode":"330100000000",
                                    "districtCode":"330102000000","addressText":"示范街道一号","postalCode":"310000",
                                    "primary":true,"validFrom":"2020-01-01"}],
                                  "relatedPersons":[{"fullName":"患者家属","sdRelationship":"SPOUSE",
                                    "phone":"13800138089","guardian":false,"emergencyContact":true,
                                    "validFrom":"2020-01-01"}],
                                  "coverages":[{"sdCoverageType":"EMPLOYEE_BASIC","payerName":"职工基本医疗保险",
                                    "memberNo":"YB%s","primary":true,"validFrom":"2020-01-01"}]
                                }
                                """.formatted(suffix, suffix)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resident.version").value(1))
                .andExpect(jsonPath("$.demographicProfile.sdMaritalStatus").value("MARRIED"))
                .andExpect(jsonPath("$.demographicProfile.sdMaritalStatusText").value("已婚"))
                .andExpect(jsonPath("$.demographicProfile.sdResidencyTypeText").value("户籍人口"))
                .andExpect(jsonPath("$.demographicProfile.sdEducationLevelText").value("大学专科"))
                .andExpect(jsonPath("$.addresses[0].primary").value(true))
                .andExpect(jsonPath("$.relatedPersons[0].emergencyContact").value(true))
                .andExpect(jsonPath("$.coverages[0].sdCoverageType").value("EMPLOYEE_BASIC"))
                .andExpect(jsonPath("$.coverages[0].sdCoverageTypeText").value("职工基本医疗保险"));

        LocalDate today = LocalDate.now();
        JsonNode generated = json(mockMvc.perform(post("/api/outpatient/scheduling/quick-schedules")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"362387869790223","catalogItemId":"362387869795101",
                                  "dateFrom":"%s","dateTo":"%s","weekdays":[%d],"dayParts":["MORNING"],
                                  "morningStart":"08:00","morningEnd":"12:00","capacity":5,
                                  "locationName":"全科门诊一诊室","idempotencyCode":"reception-schedule-%s"
                                }
                                """.formatted(today, today, today.getDayOfWeek().getValue(), suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.generatedCount").value(1))
                .andReturn().getResponse().getContentAsString());
        String scheduleId = generated.get("schedules").get(0).get("id").asText();
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
        String encounterId = encounter.get("id").asText();

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
                        .value("IN_SERVICE"))
                .andExpect(jsonPath("$[?(@.encounterId == '%s')].registrationStatus".formatted(encounterId))
                        .value("REGISTERED"));

        assertEquals(1, jdbcTemplate.queryForObject(
                "select occupied_count from schedule_slot_pools where schedule_id = ?", Integer.class,
                Long.valueOf(scheduleId)));
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from appointments where id = ?", Integer.class,
                encounter.get("appointmentId").asLong()));
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from queue_tickets where registration_id = ?", Integer.class,
                encounter.get("registrationId").asLong()));
        assertEquals("REGISTERED", jdbcTemplate.queryForObject(
                "select status from patient_registrations where id = ?", String.class,
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
                                    {"system":"NATIONAL_ID","value":"33010219880101%s","useType":"OFFICIAL"},
                                    {"system":"HEALTH_CARD","value":"JK%s","useType":"SECONDARY"}
                                  ],
                                  "demographicProfile":{"nationalityCode":"CHN","ethnicityCode":"01",
                                    "sdResidencyType":"NON_HOUSEHOLD","sdMaritalStatus":"MARRIED",
                                    "sdEducationLevel":"BACHELOR","sdOccupationType":"PROFESSIONAL",
                                    "sdBloodType":"O","sdRhType":"POSITIVE"},
                                  "addresses":[{"sdUse":"HOME","addressText":"幸福街道健康路 8 号",
                                    "primary":true,"validFrom":"2024-01-01"}],
                                  "relatedPersons":[{"fullName":"紧急联系人","sdRelationship":"SPOUSE",
                                    "phone":"1390013%s","guardian":false,"emergencyContact":true,
                                    "validFrom":"2024-01-01"}],
                                  "coverages":[{"sdCoverageType":"RESIDENT_BASIC","payerName":"城乡居民医保",
                                    "memberNo":"YB%s","primary":true,"validFrom":"2024-01-01"}],
                                  "employments":[{"employerName":"基层健康服务中心",
                                    "sdOccupationType":"PROFESSIONAL","phone":"0571-12345678",
                                    "addressText":"健康路 10 号","primary":true,"validFrom":"2024-01-01"}]
                                }
                                """.formatted(suffix, suffix, suffix, suffix, suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.identifiers.length()").value(2))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/residents/{residentId}/profile", resident.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.demographicProfile.sdResidencyTypeText").value("非户籍常住人口"))
                .andExpect(jsonPath("$.demographicProfile.sdEducationLevelText").value("大学本科"))
                .andExpect(jsonPath("$.addresses[0].addressText").value("幸福街道健康路 8 号"))
                .andExpect(jsonPath("$.relatedPersons[0].sdRelationshipText").value("配偶"))
                .andExpect(jsonPath("$.coverages[0].sdCoverageTypeText").value("城乡居民基本医疗保险"))
                .andExpect(jsonPath("$.employments[0].employerName").value("基层健康服务中心"))
                .andExpect(jsonPath("$.employments[0].sdOccupationTypeText").value("专业技术人员"));
    }
}
