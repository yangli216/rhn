package com.rhn.platform.numbering.application;

import com.rhn.platform.numbering.api.BusinessNumberRule;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.ZoneId;
import java.util.Map;

@ConfigurationProperties("rhn.business-numbering")
public record BusinessNumberingProperties(String redisKeyPrefix, String zoneId, Map<String, BusinessNumberRule> rules) {
    public BusinessNumberingProperties {
        redisKeyPrefix = redisKeyPrefix == null ? "rhn:business-number" : redisKeyPrefix;
        if (!redisKeyPrefix.matches("[A-Za-z0-9:_-]{1,96}")) throw new IllegalArgumentException("Invalid business numbering redis-key-prefix");
        zoneId = zoneId == null ? "Asia/Shanghai" : zoneId;
        ZoneId.of(zoneId);
        if (rules == null || rules.isEmpty()) throw new IllegalArgumentException("Business numbering rules are required");
        rules.forEach((code, rule) -> {
            if (!code.matches("[a-z][a-z0-9-]{0,63}") || rule == null) throw new IllegalArgumentException("Invalid business numbering rule: " + code);
        });
        rules = Map.copyOf(rules);
    }
}
