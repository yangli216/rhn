package com.rhn;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.infrastructure.ConfigurationValueCache;
import com.rhn.platform.cryptography.application.CaSignerService;
import com.rhn.platform.cryptography.domain.CaSignerMedium;
import com.rhn.platform.cryptography.infrastructure.ca.development.DevelopmentCaAdapter;
import com.rhn.platform.security.RhnPrincipal;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** CA login and the CA second factor through the development CA; password login stays available. */
@TestPropertySource(properties = {
        "rhn.security.refresh-login.enabled=true",
        "rhn.crypto.ca.enabled=true",
        "rhn.crypto.ca.default-vendor=development-ca",
        "rhn.crypto.ca.development.enabled=true"
})
class CaLoginFlowTest extends RhnIntegrationTestSupport {
    private static final String SECOND_FACTOR_DEFINITION = "362387869796301";

    @Autowired DevelopmentCaAdapter developmentCa;
    @Autowired CaSignerService signers;
    @Autowired ExecutionContextProvider contextProvider;
    @Autowired ConfigurationValueCache configurationCache;
    @Autowired ConfigurationDirectory configuration;
    @Autowired JdbcTemplate jdbcTemplate;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    @Test
    void options_offer_mobile_and_certificate_login_before_authentication() throws Exception {
        mockMvc.perform(anonymous(get("/api/session/ca-login/options")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mobile").value(true))
                .andExpect(jsonPath("$.certificate").value(true))
                .andExpect(jsonPath("$.vendorCode").value(DevelopmentCaAdapter.CODE));
    }

    @Test
    void mobile_login_issues_a_multi_factor_session_exactly_once() throws Exception {
        enrollDoctor();
        MvcResult started = mockMvc.perform(anonymous(post("/api/session/ca-login/mobile")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pollIntervalSeconds").value(2))
                .andReturn();
        Cookie nonce = cookie(started, "RHN_CA_LOGIN");
        JsonNode challenge = json(started);
        String loginRequestId = challenge.get("loginRequestId").asString();
        String qrContent = challenge.get("qrContent").asString();

        mockMvc.perform(anonymous(get("/api/session/ca-login/mobile/{id}", loginRequestId)).cookie(nonce))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("PENDING"));
        mockMvc.perform(anonymous(post("/api/crypto/dev-ca/public/mobile-logins/confirm"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("qrContent", qrContent, "username", "doctor"))))
                .andExpect(status().isNoContent());
        MvcResult confirmed = mockMvc.perform(anonymous(get("/api/session/ca-login/mobile/{id}", loginRequestId))
                        .cookie(nonce))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("CONFIRMED"))
                .andReturn();

        mockMvc.perform(anonymous(get("/api/session")).cookie(cookie(confirmed, "RHN_LOGIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("doctor"));
        mockMvc.perform(anonymous(get("/api/session/ca-login/mobile/{id}", loginRequestId)).cookie(nonce))
                .andExpect(jsonPath("$.state").value("EXPIRED"));
        assertTrue(auditCount("LOGIN_SUCCEEDED", "\"method\":\"MOBILE\"") >= 1);
    }

    @Test
    void mobile_login_is_bound_to_the_starting_browser_and_can_be_rejected() throws Exception {
        enrollDoctor();
        MvcResult started = mockMvc.perform(anonymous(post("/api/session/ca-login/mobile")))
                .andExpect(status().isOk()).andReturn();
        String loginRequestId = json(started).get("loginRequestId").asString();

        mockMvc.perform(anonymous(get("/api/session/ca-login/mobile/{id}", loginRequestId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CA_LOGIN_BROWSER_REQUIRED"));
        mockMvc.perform(anonymous(get("/api/session/ca-login/mobile/{id}", loginRequestId))
                        .cookie(new Cookie("RHN_CA_LOGIN", "x".repeat(43))))
                .andExpect(jsonPath("$.state").value("EXPIRED"));

        mockMvc.perform(anonymous(post("/api/crypto/dev-ca/public/mobile-logins/reject"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "qrContent", json(started).get("qrContent").asString()))))
                .andExpect(status().isNoContent());
        MvcResult rejected = mockMvc.perform(anonymous(get("/api/session/ca-login/mobile/{id}", loginRequestId))
                        .cookie(cookie(started, "RHN_CA_LOGIN")))
                .andExpect(jsonPath("$.state").value("REJECTED"))
                .andReturn();
        assertNull(rejected.getResponse().getHeader(HttpHeaders.SET_COOKIE));
        assertTrue(auditCount("LOGIN_FAILED", "CA_LOGIN_REJECTED") >= 1);
    }

    @Test
    void certificate_login_verifies_a_one_time_challenge_signature() throws Exception {
        enrollDoctor();
        MvcResult tampered = certificateChallenge(anonymous(post("/api/session/ca-login/certificate-challenges")));
        JsonNode signed = developmentTokenSign("doctor", json(tampered).get("toBeSigned").asString());
        byte[] signature = Base64.getDecoder().decode(signed.get("signatureValue").asString());
        signature[signature.length - 1] ^= 0x01;
        submitCertificate(anonymous(post("/api/session/ca-login/certificate")), tampered,
                Base64.getEncoder().encodeToString(signature), signed.get("certificate").asString())
                .andExpect(jsonPath("$.state").value("FAILED"))
                .andExpect(jsonPath("$.failureCode").value("CA_LOGIN_SIGNATURE_INVALID"));

        MvcResult challenge = certificateChallenge(anonymous(post("/api/session/ca-login/certificate-challenges")));
        signed = developmentTokenSign("doctor", json(challenge).get("toBeSigned").asString());
        MvcResult confirmed = submitCertificate(anonymous(post("/api/session/ca-login/certificate")), challenge,
                signed.get("signatureValue").asString(), signed.get("certificate").asString())
                .andExpect(jsonPath("$.state").value("CONFIRMED"))
                .andReturn();
        assertNotNull(cookie(confirmed, "RHN_LOGIN"));
        submitCertificate(anonymous(post("/api/session/ca-login/certificate")), challenge,
                signed.get("signatureValue").asString(), signed.get("certificate").asString())
                .andExpect(jsonPath("$.state").value("EXPIRED"));
        assertTrue(auditCount("LOGIN_SUCCEEDED", "\"method\":\"CERTIFICATE\"") >= 1);
    }

    @Test
    void certificates_without_an_active_bound_account_cannot_log_in() throws Exception {
        Long unbound = GlobalIds.next();
        DevelopmentCaAdapter.Issued unboundIssued = developmentCa.issue(unbound, "unbound");
        Long missingAccount = GlobalIds.next();
        DevelopmentCaAdapter.Issued missingIssued = bindDevelopmentSigner(missingAccount, "missing-account");

        MvcResult first = certificateChallenge(anonymous(post("/api/session/ca-login/certificate-challenges")));
        DevelopmentCaAdapter.ClientSigned unboundSigned = developmentCa.signLocally(unboundIssued.externalSignerId(),
                Base64.getDecoder().decode(json(first).get("toBeSigned").asString()));
        submitCertificate(anonymous(post("/api/session/ca-login/certificate")), first,
                unboundSigned.signatureValue(), unboundSigned.certificate())
                .andExpect(jsonPath("$.failureCode").value("CA_LOGIN_SIGNER_UNBOUND"));

        MvcResult second = certificateChallenge(anonymous(post("/api/session/ca-login/certificate-challenges")));
        DevelopmentCaAdapter.ClientSigned missingSigned = developmentCa.signLocally(missingIssued.externalSignerId(),
                Base64.getDecoder().decode(json(second).get("toBeSigned").asString()));
        submitCertificate(anonymous(post("/api/session/ca-login/certificate")), second,
                missingSigned.signatureValue(), missingSigned.certificate())
                .andExpect(jsonPath("$.state").value("FAILED"))
                .andExpect(jsonPath("$.failureCode").value("CA_LOGIN_ACCOUNT_INACTIVE"));
    }

    @Test
    void required_second_factor_blocks_password_until_the_same_account_confirms() throws Exception {
        enrollDoctor();
        DevelopmentCaAdapter.Issued other = bindDevelopmentSigner(GlobalIds.next(), "other-signer");
        Long valueId = GlobalIds.next();
        jdbcTemplate.update("""
                insert into RHN_SYS_PARAM_VAL (
                    ID_PARAM_VAL, ID_PARAM_DEF, ID_TNT, SD_SCOPE_TYPE, ID_SCOPE, SCOPE_REF, CD_SCOPE,
                    SD_VAL_MODE, JSON_VAL, SECRET_REF, FG_ACTIVE, REVISION,
                    DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED
                ) values (?, ?, ?, 'TENANT', ?, null, ?,
                    'OVERRIDE', '{"mode":"REQUIRED"}', null, true, 0,
                    current_timestamp, 362387869790222, current_timestamp, 362387869790222)
                """, valueId, Long.valueOf(SECOND_FACTOR_DEFINITION), Long.valueOf(TENANT), Long.valueOf(TENANT),
                "TENANT:" + TENANT);
        configurationCache.invalidateAll();
        try {
            assertEquals("REQUIRED", configuration.resolveCurrent(Long.valueOf(TENANT), null, null, null,
                    "platform.identity.second-factor.policy").value().get("mode").asString());
            mockMvc.perform(get("/api/session").with(rhn()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("SECOND_FACTOR_REQUIRED"));

            MvcResult foreign = certificateChallenge(post("/api/session/ca-login/certificate-challenges").with(rhn()));
            DevelopmentCaAdapter.ClientSigned otherSigned = developmentCa.signLocally(other.externalSignerId(),
                    Base64.getDecoder().decode(json(foreign).get("toBeSigned").asString()));
            submitCertificate(post("/api/session/ca-login/certificate").with(rhn()), foreign,
                    otherSigned.signatureValue(), otherSigned.certificate())
                    .andExpect(jsonPath("$.failureCode").value("CA_LOGIN_SECOND_FACTOR_MISMATCH"));

            MvcResult own = certificateChallenge(post("/api/session/ca-login/certificate-challenges").with(rhn()));
            JsonNode signed = developmentTokenSign("doctor", json(own).get("toBeSigned").asString());
            MvcResult confirmed = submitCertificate(post("/api/session/ca-login/certificate").with(rhn()), own,
                    signed.get("signatureValue").asString(), signed.get("certificate").asString())
                    .andExpect(jsonPath("$.state").value("CONFIRMED"))
                    .andReturn();
            mockMvc.perform(anonymous(get("/api/session")).cookie(cookie(confirmed, "RHN_LOGIN")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.username").value("doctor"));
            assertTrue(auditCount("LOGIN_SUCCEEDED", "\"method\":\"PASSWORD+CERTIFICATE\"") >= 1);
        } finally {
            jdbcTemplate.update("delete from RHN_SYS_PARAM_VAL where ID_PARAM_VAL = ?", valueId);
            configurationCache.invalidateAll();
        }
        mockMvc.perform(get("/api/session").with(rhn())).andExpect(status().isOk());
    }

    private void enrollDoctor() throws Exception {
        mockMvc.perform(post("/api/crypto/dev-ca/enrollments").with(rhn())).andExpect(status().isOk());
    }

    /** Binds a development certificate to an account id directly, as an administrator would. */
    private DevelopmentCaAdapter.Issued bindDevelopmentSigner(Long userId, String name) {
        TenantContext.set(Long.valueOf(TENANT));
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new RhnPrincipal(userId, Long.valueOf(TENANT), name), "", List.of()));
        try {
            DevelopmentCaAdapter.Issued issued = developmentCa.issue(userId, name);
            signers.bind(contextProvider.requireCurrent(), userId, null, DevelopmentCaAdapter.CODE,
                    issued.externalSignerId(), CaSignerMedium.UKEY, issued.certificate());
            return issued;
        } finally {
            SecurityContextHolder.clearContext();
            TenantContext.clear();
        }
    }

    private MvcResult certificateChallenge(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andExpect(status().isOk())
                .andExpect(jsonPath("$.challengeId").isNotEmpty()).andReturn();
    }

    private org.springframework.test.web.servlet.ResultActions submitCertificate(
            MockHttpServletRequestBuilder request, MvcResult challenge, String signatureValue, String certificate)
            throws Exception {
        return mockMvc.perform(request.cookie(cookie(challenge, "RHN_CA_LOGIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "challengeId", json(challenge).get("challengeId").asString(),
                                "signatureValue", signatureValue, "certificate", certificate))))
                .andExpect(status().isOk());
    }

    private JsonNode developmentTokenSign(String username, String toBeSigned) throws Exception {
        return json(mockMvc.perform(anonymous(post("/api/crypto/dev-ca/public/token-signatures"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("username", username, "toBeSigned", toBeSigned))))
                .andExpect(status().isOk()).andReturn());
    }

    private static MockHttpServletRequestBuilder anonymous(MockHttpServletRequestBuilder request) {
        return request.header("X-Tenant-Id", TENANT).header("X-Client-Session-Id", "ca-login-browser");
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private static Cookie cookie(MvcResult result, String name) {
        for (String header : result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)) {
            if (header.startsWith(name + "=")) {
                return new Cookie(name, header.substring(name.length() + 1, header.indexOf(';')));
            }
        }
        throw new AssertionError("Missing cookie " + name);
    }

    private int auditCount(String eventType, String detailFragment) {
        Integer count = jdbcTemplate.queryForObject("""
                select count(*) from RHN_AUD_IAM_AUTH_EVT
                 where ID_TNT = ? and SD_EVT_TYPE = ? and JSON_DETAIL like ?
                """, Integer.class, Long.valueOf(TENANT), eventType, "%" + detailFragment + "%");
        assertNotNull(count);
        return count;
    }
}
