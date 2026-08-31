package com.rhn.platform.security;

import com.rhn.platform.web.CorrelationIdFilter;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.shared.api.ApiError;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    WorkContextAuthorizationFilter workContextAuthorizationFilter(
            IdentityAccessDirectory identityAccessDirectory,
            WorkContextDirectory workContextDirectory,
            JsonCodec jsonCodec) {
        return new WorkContextAuthorizationFilter(identityAccessDirectory, workContextDirectory, jsonCodec);
    }

    @Bean
    ClientSessionRevocationFilter clientSessionRevocationFilter(
            SessionRevocationStore revocations, JsonCodec jsonCodec) {
        return new ClientSessionRevocationFilter(revocations, jsonCodec);
    }

    @Bean
    RefreshLoginAuthenticationFilter refreshLoginAuthenticationFilter(
            RefreshLoginSessionService refreshLoginSessionService,
            IdentityAccessDirectory identityAccessDirectory) {
        return new RefreshLoginAuthenticationFilter(refreshLoginSessionService, identityAccessDirectory);
    }

    @Bean
    FilterRegistrationBean<WorkContextAuthorizationFilter> disableContainerRegistration(
            WorkContextAuthorizationFilter filter) {
        FilterRegistrationBean<WorkContextAuthorizationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    FilterRegistrationBean<ClientSessionRevocationFilter> disableClientSessionContainerRegistration(
            ClientSessionRevocationFilter filter) {
        FilterRegistrationBean<ClientSessionRevocationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false); return registration;
    }

    @Bean
    FilterRegistrationBean<RefreshLoginAuthenticationFilter> disableRefreshLoginContainerRegistration(
            RefreshLoginAuthenticationFilter filter) {
        FilterRegistrationBean<RefreshLoginAuthenticationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JsonCodec jsonCodec,
                                            WorkContextAuthorizationFilter workContextAuthorizationFilter,
                                            ClientSessionRevocationFilter clientSessionRevocationFilter,
                                            RefreshLoginAuthenticationFilter refreshLoginAuthenticationFilter) throws Exception {
        AuthenticationEntryPoint authenticationRequired = (request, response, exception) -> {
            Object correlationId = request.getAttribute(CorrelationIdFilter.ATTRIBUTE_NAME);
            response.setStatus(401);
            response.setContentType("application/json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(jsonCodec.write(new ApiError(
                    "AUTHENTICATION_REQUIRED", "登录信息已失效，请重新登录",
                    correlationId == null ? "" : correlationId.toString(), Instant.now(), List.of())));
        };
        return http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/actuator/health/**", "/actuator/info", "/v3/api-docs/**").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(authenticationRequired))
                .httpBasic(basic -> basic.authenticationEntryPoint(authenticationRequired))
                .addFilterBefore(refreshLoginAuthenticationFilter, BasicAuthenticationFilter.class)
                .addFilterAfter(clientSessionRevocationFilter, BasicAuthenticationFilter.class)
                .addFilterAfter(workContextAuthorizationFilter, ClientSessionRevocationFilter.class)
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    @ConditionalOnProperty(prefix = "rhn.security", name = "dev-user-enabled", havingValue = "true")
    UserDetailsService devUserDetailsService(
            @Value("${rhn.security.dev-username}") String username,
            @Value("${rhn.security.dev-password}") String password,
            PasswordEncoder encoder) {
        return new InMemoryUserDetailsManager(User.withUsername(username)
                .password(encoder.encode(password))
                .roles("CLINICIAN")
                .build());
    }
}
