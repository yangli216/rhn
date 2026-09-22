package com.rhn;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
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
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
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

    @Autowired
    protected com.rhn.platform.masterdata.application.StandardMedicationCatalogService medicationReferences;
    @Autowired
    protected com.rhn.platform.masterdata.infrastructure.MedicationStandardSourceRepository medicationSources;

    /** Business-flow fixtures explicitly adopt an available reference specification; contract tests use raw input. */
    protected String standardMedicationInput(String input) {
        var body = (tools.jackson.databind.node.ObjectNode) json(input);
        var summary = medicationReferences.summary();
        var entries = medicationReferences.search("", body.path("sdMedicationType").asString(), "STRUCTURED", 0, 100);
        var specs = new java.util.ArrayList<JsonNode>();
        for (int page = 0; page < entries.totalPages(); page++) {
            for (var entry : medicationReferences.search("", body.path("sdMedicationType").asString(), "STRUCTURED", page, 100).content()) {
                medicationReferences.detail(entry.path("id").asString()).path("specifications").forEach(specs::add);
            }
        }
        var eligible = specs.stream().filter(spec -> spec.path("doseForm").asString().equals(body.path("sdDoseForm").asString()))
                .filter(spec -> medicationSources.findFirstByTenantIdAndCatalogCodeAndCatalogVersionAndSpecificationCodeOrderByMedicationIdAsc(Long.valueOf(TENANT),
                    summary.path("catalogId").asString(), summary.path("catalogVersion").asString(), spec.path("id").asString()).isEmpty()).toList();
        var spec = eligible.stream().filter(v -> v.path("specification").asString().replace(" ", "")
                .equalsIgnoreCase(body.path("preparationSpec").asString().replace(" ", ""))).findFirst()
                .orElseGet(() -> eligible.stream().findFirst().orElseThrow(() -> new IllegalArgumentException("Fixture needs a reference specification")));
        body.put("standardSpecificationId", spec.path("id").asString());
        body.put("preparationSpec", spec.path("specification").asString());
        if (!spec.path("presentationUnit").isNull()) body.put("preparationUnit", spec.path("presentationUnit").asString());
        var strength = spec.path("strength");
        body.remove("strengthValue"); body.remove("strengthUnit");
        if (strength.path("computable").asBoolean() && "AMOUNT_PER_PRESENTATION".equals(strength.path("kind").asString())) {
            body.put("strengthValue", new java.math.BigDecimal(strength.path("numerator").path("value").asString()));
            body.put("strengthUnit", strength.path("numerator").path("unit").asString());
        }
        return body.toString();
    }

    protected JsonNode linkStandardMedication(String specificationId, String code) throws Exception {
        String path = "/api/platform/master-data/medication-standard-catalog/specifications/" + specificationId + "/medications";
        JsonNode candidates = json(mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path)
                .with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode medication = null;
        for (var candidate : candidates) if (code.equals(candidate.path("code").asString())) medication = candidate;
        if (medication == null) throw new IllegalArgumentException("Expected reference-compatible fixture: " + code);
        var body = objectMapper.createObjectNode(); body.set("medication", medication);
        body.put("medicationId", medication.path("id").asString()); body.put("expectedRevision", medication.path("revision").asLong());
        return json(mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
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
        String documentId = document.get("id").asString();
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
