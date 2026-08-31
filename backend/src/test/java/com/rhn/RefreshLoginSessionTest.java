package com.rhn;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = "rhn.security.refresh-login.enabled=true")
class RefreshLoginSessionTest extends RhnIntegrationTestSupport {

    @Test
    void refresh_login_cookie_restores_session_and_logout_invalidates_it() throws Exception {
        String setCookie = mockMvc.perform(get("/api/session").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refreshLoginEnabled").value(true))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, org.hamcrest.Matchers.containsString("HttpOnly")))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, org.hamcrest.Matchers.containsString("SameSite=Strict")))
                .andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);

        String token = setCookie.substring("RHN_LOGIN=".length(), setCookie.indexOf(';'));
        Cookie cookie = new Cookie("RHN_LOGIN", token);

        mockMvc.perform(get("/api/session")
                        .header("X-Tenant-Id", TENANT)
                        .header("X-Client-Session-Id", "restored-client-session")
                        .cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("doctor"));

        mockMvc.perform(delete("/api/session")
                        .header("X-Tenant-Id", TENANT)
                        .cookie(cookie))
                .andExpect(status().isNoContent())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, org.hamcrest.Matchers.containsString("Max-Age=0")));

        mockMvc.perform(get("/api/session")
                        .header("X-Tenant-Id", TENANT)
                        .header("X-Client-Session-Id", "restored-client-session")
                        .cookie(cookie))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }
}
