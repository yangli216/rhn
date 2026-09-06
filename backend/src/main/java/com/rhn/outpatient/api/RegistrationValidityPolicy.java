package com.rhn.outpatient.api;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

/**
 * 门诊挂号效期策略：控制挂号有效天数与截止时间计算（当天23:59:59或24小时后）。
 */
@Service
public class RegistrationValidityPolicy {
    public static final String PARAMETER_DAYS_KEY = "outpatient.registration.validity.days";
    public static final String PARAMETER_CUTOFF_MODE_KEY = "outpatient.registration.validity.cutoff-mode";

    public static final String MODE_END_OF_DAY = "END_OF_DAY";
    public static final String MODE_EXACT_DURATION = "EXACT_DURATION";

    public static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private final ConfigurationDirectory configuration;
    private final String overrideDays;
    private final String overrideCutoffMode;

    public RegistrationValidityPolicy(ConfigurationDirectory configuration,
                                      @Value("${rhn.outpatient.registration.validity.days:}") String overrideDays,
                                      @Value("${rhn.outpatient.registration.validity.cutoff-mode:}") String overrideCutoffMode) {
        this.configuration = configuration;
        this.overrideDays = overrideDays == null ? "" : overrideDays.trim();
        this.overrideCutoffMode = overrideCutoffMode == null ? "" : overrideCutoffMode.trim();
    }

    public int resolveValidityDays(Long tenantId, Long userId, Long organizationId, Long departmentId) {
        if (!overrideDays.isBlank()) {
            try {
                int days = Integer.parseInt(overrideDays);
                return Math.max(1, days);
            } catch (NumberFormatException ignored) {
            }
        }
        if (tenantId != null && configuration != null) {
            ConfigurationValue configured = configuration.resolveCurrent(tenantId, userId,
                    organizationId, departmentId, PARAMETER_DAYS_KEY);
            if (configured != null && configured.value() != null) {
                int val = configured.value().asInt(1);
                return Math.max(1, val);
            }
        }
        return 1;
    }

    public String resolveCutoffMode(Long tenantId, Long userId, Long organizationId, Long departmentId) {
        if (!overrideCutoffMode.isBlank()) {
            return normalizeMode(overrideCutoffMode);
        }
        if (tenantId != null && configuration != null) {
            ConfigurationValue configured = configuration.resolveCurrent(tenantId, userId,
                    organizationId, departmentId, PARAMETER_CUTOFF_MODE_KEY);
            if (configured != null && configured.value() != null) {
                String text = configured.value().isTextual()
                        ? configured.value().asText()
                        : configured.value().toString();
                return normalizeMode(text);
            }
        }
        return MODE_END_OF_DAY;
    }

    private String normalizeMode(String raw) {
        if (raw == null) return MODE_END_OF_DAY;
        String cleaned = raw.replace("\"", "").trim().toUpperCase(Locale.ROOT);
        if ("EXACT_DURATION".equals(cleaned) || "24_HOURS".equals(cleaned) || "EXACT_HOURS".equals(cleaned)) {
            return MODE_EXACT_DURATION;
        }
        return MODE_END_OF_DAY;
    }

    public Instant calculateCutoffTime(Instant registeredAt, Long tenantId, Long organizationId, Long departmentId) {
        return calculateCutoffTime(registeredAt, tenantId, null, organizationId, departmentId);
    }

    public Instant calculateCutoffTime(Instant registeredAt, Long tenantId, Long userId, Long organizationId, Long departmentId) {
        if (registeredAt == null) {
            return Instant.EPOCH;
        }
        int days = resolveValidityDays(tenantId, userId, organizationId, departmentId);
        String mode = resolveCutoffMode(tenantId, userId, organizationId, departmentId);

        if (MODE_EXACT_DURATION.equals(mode)) {
            return registeredAt.plus(days, ChronoUnit.DAYS);
        }
        LocalDate regDate = registeredAt.atZone(BUSINESS_ZONE).toLocalDate();
        return regDate.plusDays(days).atStartOfDay(BUSINESS_ZONE).toInstant();
    }

    public boolean isValid(Instant registeredAt, Instant now, Long tenantId, Long organizationId, Long departmentId) {
        return isValid(registeredAt, now, tenantId, null, organizationId, departmentId);
    }

    public boolean isValid(Instant registeredAt, Instant now, Long tenantId, Long userId, Long organizationId, Long departmentId) {
        if (registeredAt == null) return false;
        Instant current = now != null ? now : Instant.now();
        Instant cutoff = calculateCutoffTime(registeredAt, tenantId, userId, organizationId, departmentId);
        return current.isBefore(cutoff);
    }

    public boolean isExpired(Instant registeredAt, Instant now, Long tenantId, Long organizationId, Long departmentId) {
        return !isValid(registeredAt, now, tenantId, organizationId, departmentId);
    }

    public boolean isExpired(Instant registeredAt, Instant now, Long tenantId, Long userId, Long organizationId, Long departmentId) {
        return !isValid(registeredAt, now, tenantId, userId, organizationId, departmentId);
    }
}
