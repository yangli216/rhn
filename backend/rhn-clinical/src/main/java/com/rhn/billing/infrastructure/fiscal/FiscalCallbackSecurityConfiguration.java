package com.rhn.billing.infrastructure.fiscal;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;

/**
 * 财政回调入口的专用安全链：仅匹配配置的那一个精确路径（POST），对该路径不要求登录会话，
 * 信任完全来自控制器内的 HMAC 签名校验。主安全链不做任何放宽，其余路径仍须认证。
 */
@Configuration
@EnableConfigurationProperties(FiscalGatewayProperties.class)
@ConditionalOnProperty(name = "rhn.billing.fiscal.gateway.callback.enabled", havingValue = "true")
class FiscalCallbackSecurityConfiguration {
    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    SecurityFilterChain fiscalCallbackSecurityFilterChain(HttpSecurity http, FiscalGatewayProperties properties) throws Exception {
        return http
                .securityMatcher(PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, properties.callback().path()))
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .build();
    }
}
