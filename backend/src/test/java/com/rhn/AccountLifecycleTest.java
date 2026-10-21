package com.rhn;

import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.realtime.application.PresenceConnectionSnapshot;
import com.rhn.platform.realtime.application.PresenceLeaseStore;
import com.rhn.platform.security.SessionRevocationStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The test profile signs in through an in-memory development user, so sign-in of the opened accounts is checked
 * through what production authentication relies on: HTTP Basic and refresh logins accept only accounts that
 * {@link IdentityAccessDirectory#findActiveAccount} returns, and revoked client sessions are rejected per request.
 */
class AccountLifecycleTest extends RhnIntegrationTestSupport {
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Asia/Shanghai"));

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    PresenceLeaseStore presence;
    @Autowired
    SessionRevocationStore revocations;
    @Autowired
    IdentityAccessDirectory accounts;
    @Autowired
    PasswordEncoder passwordEncoder;

    @Test
    void disabling_an_account_ends_its_sessions_and_blocks_sign_in_until_enabled_again() throws Exception {
        Account account = openAccount();
        assertThat(signInAllowed(account)).isTrue();
        String clientSession = online(account);

        changeStatus(account.userId(), 99, "INACTIVE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IAM_ACCOUNT_VERSION_CONFLICT"));
        changeStatus(account.userId(), 0, "LOCKED")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IAM_ENUM_INVALID"));
        changeStatus(account.userId(), 0, "ACTIVE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IAM_ACCOUNT_STATUS_UNCHANGED"));
        changeStatus(account.userId(), 0, "INACTIVE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"))
                .andExpect(jsonPath("$.revision").value(1));

        assertThat(signInAllowed(account)).isFalse();
        assertThat(revocations.isRevoked(Long.valueOf(TENANT), clientSession)).isTrue();
        mockMvc.perform(get("/api/session").with(withClientSession(clientSession)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_TERMINATED"));
        assertThat(events(account.userId())).containsExactly("ACCOUNT_CREATED", "ACCOUNT_DISABLED");
        assertThat(jdbc.queryForObject("""
                select JSON_DETAIL from RHN_AUD_IAM_AUTH_EVT where ID_TARGET = ? and SD_EVT_TYPE = 'ACCOUNT_DISABLED'
                """, String.class, Long.valueOf(account.userId()))).isEqualTo(account.username() + ":测试离职");
        mockMvc.perform(get("/api/platform/iam/practitioners/{id}/access", account.practitionerId()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.account.status").value("INACTIVE"))
                .andExpect(jsonPath("$.account.revision").value(1));

        changeStatus(account.userId(), 1, "ACTIVE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.revision").value(2));
        assertThat(signInAllowed(account)).isTrue();
        assertThat(events(account.userId())).containsExactly("ACCOUNT_CREATED", "ACCOUNT_DISABLED", "ACCOUNT_ENABLED");
    }

    @Test
    void the_acting_account_cannot_disable_itself() throws Exception {
        Long self = jdbc.queryForObject("select ID_USER from RHN_SYS_USER_ACCT where ID_TNT = ? and CD_USRNM = 'doctor'",
                Long.class, Long.valueOf(TENANT));
        long revision = jdbc.queryForObject("select REVISION from RHN_SYS_USER_ACCT where ID_USER = ?", Long.class, self);
        changeStatus(self.toString(), revision, "INACTIVE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IAM_ACCOUNT_SELF_DISABLE"));
    }

    @Test
    void password_reset_replaces_the_password_and_ends_the_sessions() throws Exception {
        Account account = openAccount();
        String hashBefore = hash(account.userId());
        String clientSession = online(account);

        resetPassword(account.userId(), 0, "onlyletters")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IAM_PASSWORD_WEAK"));
        resetPassword(account.userId(), 7, "Reset2026pass")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("IAM_ACCOUNT_VERSION_CONFLICT"));
        resetPassword(account.userId(), 0, "Reset2026pass")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.revision").value(1));

        String hashAfter = hash(account.userId());
        assertThat(hashAfter).startsWith("{bcrypt}").isNotEqualTo(hashBefore);
        assertThat(passwordEncoder.matches("Init2026pass", hashAfter)).isFalse();
        assertThat(passwordEncoder.matches("Reset2026pass", hashAfter)).isTrue();
        assertThat(signInAllowed(account)).isTrue();
        assertThat(revocations.isRevoked(Long.valueOf(TENANT), clientSession)).isTrue();
        assertThat(events(account.userId())).containsExactly("ACCOUNT_CREATED", "PASSWORD_RESET");
        assertThat(jdbc.queryForObject("""
                select JSON_DETAIL from RHN_AUD_IAM_AUTH_EVT where ID_TARGET = ? and SD_EVT_TYPE = 'PASSWORD_RESET'
                """, String.class, Long.valueOf(account.userId()))).doesNotContain("Reset2026pass");
    }

    @Test
    void accounts_outside_the_management_scope_cannot_be_disabled_or_reset() throws Exception {
        Account account = openAccount();
        RequestPostProcessor otherDepartment = request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", "362387869799103");
            return request;
        };
        mockMvc.perform(put("/api/platform/iam/users/{id}/status", account.userId()).with(otherDepartment)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":0,"status":"INACTIVE"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("IAM_USER_SCOPE_FORBIDDEN"));
        mockMvc.perform(post("/api/platform/iam/users/{id}/password-reset", account.userId()).with(otherDepartment)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":0,"newPassword":"Reset2026pass"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("IAM_USER_SCOPE_FORBIDDEN"));
        assertThat(jdbc.queryForObject("select REVISION from RHN_SYS_USER_ACCT where ID_USER = ?", Long.class,
                Long.valueOf(account.userId()))).isZero();
    }

    private org.springframework.test.web.servlet.ResultActions changeStatus(String userId, long revision, String status)
            throws Exception {
        return mockMvc.perform(put("/api/platform/iam/users/{id}/status", userId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"expectedRevision":%d,"status":"%s","reason":"测试离职"}
                        """.formatted(revision, status)));
    }

    private org.springframework.test.web.servlet.ResultActions resetPassword(String userId, long revision, String password)
            throws Exception {
        return mockMvc.perform(post("/api/platform/iam/users/{id}/password-reset", userId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"expectedRevision":%d,"newPassword":"%s"}
                        """.formatted(revision, password)));
    }

    private boolean signInAllowed(Account account) {
        return accounts.findActiveAccount(Long.valueOf(TENANT), account.username()).isPresent();
    }

    /** Registers an online connection of the account, as the realtime channel does on connect. */
    private String online(Account account) {
        String clientSession = "test-session-" + account.username();
        Instant now = Instant.now();
        presence.upsert(new PresenceConnectionSnapshot("conn-" + account.username(), "test", clientSession,
                Long.valueOf(TENANT), Long.valueOf(account.userId()), account.username(), null,
                Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), now, now, now));
        return clientSession;
    }

    private RequestPostProcessor withClientSession(String clientSession) {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).removeHeader("X-Client-Session-Id");
            ((MockHttpServletRequest) request).addHeader("X-Client-Session-Id", clientSession);
            return request;
        };
    }

    private List<String> events(String userId) {
        return jdbc.queryForList("""
                select SD_EVT_TYPE from RHN_AUD_IAM_AUTH_EVT where SD_TARGET_TYPE = 'USER' and ID_TARGET = ?
                 order by DT_OCCRD, ID_IAM_AUTH_EVT
                """, String.class, Long.valueOf(userId));
    }

    private String hash(String userId) {
        return jdbc.queryForObject("select HASH_PWD from RHN_SYS_USER_ACCT where ID_USER = ?", String.class,
                Long.valueOf(userId));
    }

    private Account openAccount() throws Exception {
        var input = new LinkedHashMap<String, Object>();
        input.put("code", "ACCT_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase());
        input.put("fullName", "账号生命周期测试"); input.put("sdPractGender", "0");
        input.put("organizationId", ORGANIZATION); input.put("departmentId", DEPARTMENT);
        input.put("positionId", jdbc.queryForObject("SELECT MIN(ID_POS) FROM RHN_SYS_POS WHERE ID_TNT = ? AND SD_STATUS = 'ACTIVE'",
                Long.class, Long.valueOf(TENANT)).toString());
        input.put("hireDate", TODAY.minusDays(10).toString());
        String practitionerId = json(mockMvc.perform(post("/api/platform/practitioners/onboarding").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .path("practitioner").path("id").asString();
        String username = "lc" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        JsonNode access = json(mockMvc.perform(post("/api/platform/iam/practitioners/{id}/account", practitionerId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","initialPassword":"Init2026pass"}
                                """.formatted(username)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.account.revision").value(0))
                .andReturn().getResponse().getContentAsString());
        return new Account(practitionerId, access.path("account").path("id").asString(), username);
    }

    private record Account(String practitionerId, String userId, String username) {
    }
}
