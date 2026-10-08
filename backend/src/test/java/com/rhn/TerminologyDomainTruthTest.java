package com.rhn;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TerminologyDomainTruthTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test void diseaseSystemCannotBeCreatedWithAnImplicitWesternDomain() throws Exception {
        for (String field : new String[]{"", "\"sdDiagnosisDomain\":null,"}) {
            String code = code();
            var result = create(code, "DISEASE", field, 400);
            assertEquals("INVALID_ARGUMENT", result.path("code").asString());
            assertTrue(result.path("message").asString().contains("必须明确指定诊断体系"));
            assertEquals(0, jdbc.queryForObject("select count(*) from RHN_BD_CODE_SYSTEM where CD_CODE_SYSTEM=?", Integer.class, code));
        }
    }

    @ParameterizedTest @ValueSource(strings = {"WESTERN_MEDICINE", "TCM_DISEASE", "TCM_SYNDROME"})
    void explicitDiseaseDomainsArePreservedInStorageAndDirectory(String domain) throws Exception {
        String code = code();
        String id = create(code, "DISEASE", "\"sdDiagnosisDomain\":\"" + domain + "\",", 201).path("id").asString();
        assertEquals(domain, jdbc.queryForObject("select SD_DIAG_DOMAIN from RHN_BD_CODE_SYSTEM where ID_CODE_SYSTEM=?", String.class, Long.valueOf(id)));
        var systems = json(mockMvc.perform(get("/api/platform/terminology/disease-code-systems").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        boolean found = false;
        for (var system : systems) if (id.equals(system.path("id").asString())) {
            found = true;
            assertEquals(domain, system.path("sdDiagnosisDomain").asString());
        }
        assertTrue(found);
    }

    @Test void nonDiseaseSystemDoesNotAcquireADiagnosisDomain() throws Exception {
        String id = create(code(), "COMMON", "", 201).path("id").asString();
        assertNull(jdbc.queryForObject("select SD_DIAG_DOMAIN from RHN_BD_CODE_SYSTEM where ID_CODE_SYSTEM=?", String.class, Long.valueOf(id)));
    }

    @Test void memberContractDeclaresUnknownCodeAndDomain() throws Exception {
        String document = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var schemas = json(document).path("components").path("schemas");
        var ref = schemas.path("DiseaseManagementProgramView").path("properties").path("members").path("items").path("$ref").asString();
        var member = schemas.path(ref.substring(ref.lastIndexOf('/') + 1));
        assertTrue(member.path("properties").has("systemName"));
        for (String field : new String[]{"code", "sdDiagnosisDomain"}) {
            assertTrue(member.path("properties").path(field).path("type").toString().contains("null"), field);
        }
        String export = System.getProperty("rhn.terminology-domain.openapi-export");
        if (export != null) java.nio.file.Files.writeString(java.nio.file.Path.of(export), document);
    }

    private String code() { return "LOCAL.VIS.CS.TRUTH_" + UUID.randomUUID().toString().replace("-", "").toUpperCase(); }

    private JsonNode create(String code, String type, String domainField, int expected) throws Exception {
        return json(mockMvc.perform(post("/api/platform/terminology/code-systems").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"productScope":false,"code":"%s","name":"诊断体系真实性测试","version":"2026.10",
                 "systemType":"%s",%s"effectiveFrom":"2026-01-01"}
                """.formatted(code, type, domainField)))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
}
