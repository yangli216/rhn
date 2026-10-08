package com.rhn;

import com.rhn.platform.masterdata.infrastructure.ExaminationServiceRepository;
import com.rhn.platform.masterdata.infrastructure.LaboratoryServiceRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class ClinicalConfigurationTruthTest extends RhnIntegrationTestSupport {
    @Autowired LaboratoryServiceRepository laboratories;
    @Autowired ExaminationServiceRepository examinations;

    @ParameterizedTest
    @ValueSource(strings = {"laboratory", "examination"})
    void reading_missing_configuration_does_not_create_a_default_profile(String type) throws Exception {
        long id = removeProfile(type);
        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(get(path(id) + "/clinical-configuration").with(rhnWorkContext()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.serviceId").value(Long.toString(id)))
                    .andExpect(jsonPath("$." + type).doesNotExist());
            assertMissing(type, id);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"laboratory", "examination"})
    void profile_updates_and_child_creation_require_an_existing_profile(String type) throws Exception {
        long id = removeProfile(type);
        String code = type.equals("laboratory") ? "LAB_PROFILE_NOT_FOUND" : "EXAM_PROFILE_NOT_FOUND";
        String update = type.equals("laboratory")
                ? "{\"expectedRevision\":0,\"fastingRequired\":true,\"pointOfCare\":false}"
                : "{\"expectedRevision\":0,\"bodySiteRequired\":true,\"multiBodySite\":false}";
        mockMvc.perform(put(path(id) + "/" + type + "-profile").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value(code));
        assertMissing(type, id);
        String endpoint = type.equals("laboratory") ? "specimens" : "examination-variants";
        String create = type.equals("laboratory")
                ? "{\"specimenItemId\":\"362387869797111\",\"defaultSpecimen\":false,\"requiredSpecimen\":true,\"sortOrder\":90,\"status\":\"ACTIVE\"}"
                : "{\"code\":\"TEST_SITE\",\"name\":\"测试部位\",\"bodySiteRequired\":true,\"sortOrder\":90,\"status\":\"ACTIVE\"}";
        mockMvc.perform(post(path(id) + "/" + endpoint).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(create))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value(code));
        assertMissing(type, id);
    }

    private long removeProfile(String type) throws Exception {
        String created = mockMvc.perform(post("/api/platform/master-data/services").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"SRV-TRUTH-%s","name":"配置缺失测试项目","unitCode":"次",
                                 "orderable":true,"chargeable":true,"sdStatus":"ACTIVE",
                                 "validFrom":"2026-01-01","sdServiceType":"%s",
                                 "sdUsageType":"COMMON","medicalTechnology":true,
                                 "combinationItem":false,"singleOrder":true,"pregnancyAlert":false}
                                """.formatted(java.util.UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                                type.equals("laboratory") ? "LABORATORY" : "EXAMINATION")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long id = json(created).path("id").asLong();
        // Explicit project creation initializes its profile; reads must not reconstruct a missing one.
        assertThat(type.equals("laboratory") ? laboratories.existsById(id) : examinations.existsById(id)).isTrue();
        if (type.equals("laboratory")) {
            laboratories.deleteById(id); laboratories.flush();
        } else {
            examinations.deleteById(id); examinations.flush();
        }
        assertMissing(type, id);
        return id;
    }

    private void assertMissing(String type, long id) {
        assertThat(type.equals("laboratory") ? laboratories.existsById(id) : examinations.existsById(id)).isFalse();
    }

    private String path(long id) {
        return "/api/platform/master-data/operations/services/" + id;
    }
}
