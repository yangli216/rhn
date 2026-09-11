package com.rhn;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = RhnApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestExecutionListeners(
        listeners = RhnDatabaseResetTestExecutionListener.class,
        mergeMode = TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS)
abstract class RhnIntegrationTestSupport {
    protected static final String TENANT = "362387869790209";
    protected static final String ORGANIZATION = "362387869790211";
    protected static final String DEPARTMENT = "362387869790212";

    @Autowired
    protected MockMvc mockMvc;
    @Autowired
    protected ObjectMapper objectMapper;

    protected RequestPostProcessor rhn() {
        return request -> {
            httpBasic("doctor", "test-password").postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Tenant-Id", TENANT);
            ((MockHttpServletRequest) request).addHeader("X-Client-Session-Id", "test-session-doctor");
            return request;
        };
    }

    protected RequestPostProcessor rhn(String tenantId) {
        return request -> {
            httpBasic("doctor", "test-password").postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Tenant-Id", tenantId);
            ((MockHttpServletRequest) request).addHeader("X-Client-Session-Id", "test-session-doctor");
            return request;
        };
    }

    protected RequestPostProcessor rhnWorkContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", DEPARTMENT);
            return request;
        };
    }

    protected MockHttpServletRequestBuilder verifiedEncounterStart(String encounterId) {
        return post("/api/encounters/{id}/start", encounterId)
                .with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"factorResults":{"NAME":true,"TEST_IDENTIFIER":true},"terminalCode":"TEST"}
                        """);
    }

    protected JsonNode json(String value) {
        return objectMapper.readTree(value);
    }

    protected void prepareSignedDischargeRecord(String residentId, String encounterId, String commandPrefix)
            throws Exception {
        createAndSignDocument(residentId, encounterId, "INPATIENT_DISCHARGE_RECORD", "出院记录",
                commandPrefix + "-RECORD");
    }

    protected void recordInpatientNoKnownDrugAllergy(String residentId, String encounterId) throws Exception {
        mockMvc.perform(post("/api/residents/{residentId}/allergies", residentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "encounterId":"%s",
                                  "assertionType":"NO_KNOWN_DRUG_ALLERGY",
                                  "informationSource":"PATIENT"
                                }
                                """.formatted(encounterId)))
                .andExpect(status().isCreated());
    }

    protected String createAndSignDocument(String residentId, String encounterId, String documentType,
                                           String title, String contentText) throws Exception {
        String response = mockMvc.perform(post("/api/clinical-documents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s",
                                  "encounterId":"%s",
                                  "organizationId":"%s",
                                  "departmentId":"%s",
                                  "documentType":"%s",
                                  "title":"%s",
                                  "contentSchema":"RHN.CANVAS_EDITOR_DOCUMENT.V1",
                                  "content":{"plainText":"%s","structuredValues":{}},
                                  "changeReason":"住院出院资料准备"
                                }
                                """.formatted(residentId, encounterId, ORGANIZATION, DEPARTMENT,
                                documentType, title, contentText)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode document = json(response);
        String documentId = document.get("id").asText();
        mockMvc.perform(post("/api/clinical-documents/{documentId}/sign", documentId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedCurrentVersion":%d,"signatureMeaning":"AUTHOR"}
                                """.formatted(document.get("currentVersion").asInt())))
                .andExpect(status().isOk());
        return documentId;
    }

    protected void recordPrimaryDischargeDiagnosis(String episodeId, long expectedEpisodeRevision,
                                                    String code, String display, String commandCode)
            throws Exception {
        mockMvc.perform(put("/api/inpatient/episodes/{episodeId}/discharge-diagnoses", episodeId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedEpisodeRevision":%d,
                                  "diagnoses":[{"code":"%s","display":"%s","diagnosisType":"PRIMARY"}],
                                  "commandCode":"%s"
                                }
                                """.formatted(expectedEpisodeRevision, code, display, commandCode)))
                .andExpect(status().isOk());
    }
}
