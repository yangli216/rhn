package com.rhn.platform.security;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Collection;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Tenant policy {@value #PARAMETER_KEY}: whether a password must be followed by a CA proof (phone app
 * confirmation or UKey) before a session is issued. Privileged accounts hold any authority in
 * {@code rhn.security.second-factor.privileged-authorities}. Break-glass accounts listed in
 * {@code rhn.security.second-factor.exempt-usernames} may still log in with a password; every such
 * login is audited separately.
 */
@Component
class SecondFactorPolicy {
    static final String PARAMETER_KEY = "platform.identity.second-factor.policy";
    private final ConfigurationDirectory configuration;
    private final Set<String> privilegedAuthorities;
    private final Set<String> exemptUsernames;

    SecondFactorPolicy(ConfigurationDirectory configuration,
                       @Value("${rhn.security.second-factor.privileged-authorities:IAM.MANAGE,MAINTENANCE.MANAGE,AI_CONFIGURATION.MANAGE}")
                       String privilegedAuthorities,
                       @Value("${rhn.security.second-factor.exempt-usernames:}") String exemptUsernames) {
        this.configuration = configuration;
        this.privilegedAuthorities = split(privilegedAuthorities, false);
        this.exemptUsernames = split(exemptUsernames, true);
    }

    Mode mode(Long tenantId) {
        var configured = configuration.resolveCurrent(tenantId, null, null, null, PARAMETER_KEY);
        var mode = configured.value() == null ? null : configured.value().get("mode");
        if (mode == null || !mode.isString()) return Mode.NONE;
        try {
            return Mode.valueOf(mode.asString().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return Mode.NONE;
        }
    }

    boolean required(Long tenantId, Collection<String> authorities) {
        return switch (mode(tenantId)) {
            case NONE -> false;
            case REQUIRED -> true;
            case REQUIRED_FOR_PRIVILEGED -> authorities.stream().anyMatch(privilegedAuthorities::contains);
        };
    }

    boolean exempt(String username) {
        return username != null && exemptUsernames.contains(username.trim().toLowerCase(Locale.ROOT));
    }

    private static Set<String> split(String value, boolean lowerCase) {
        if (value == null || value.isBlank()) return Set.of();
        return Arrays.stream(value.split(",")).map(String::trim).filter(item -> !item.isEmpty())
                .map(item -> lowerCase ? item.toLowerCase(Locale.ROOT) : item)
                .collect(Collectors.toUnmodifiableSet());
    }

    enum Mode { NONE, REQUIRED_FOR_PRIVILEGED, REQUIRED }
}
