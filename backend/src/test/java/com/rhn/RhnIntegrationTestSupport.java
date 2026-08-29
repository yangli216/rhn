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

@SpringBootTest
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
            return request;
        };
    }

    protected RequestPostProcessor rhn(String tenantId) {
        return request -> {
            httpBasic("doctor", "test-password").postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Tenant-Id", tenantId);
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
}
