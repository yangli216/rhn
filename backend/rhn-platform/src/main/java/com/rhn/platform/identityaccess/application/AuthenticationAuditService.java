package com.rhn.platform.identityaccess.application;

import com.rhn.platform.identityaccess.api.AuthenticationAuditLog;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class AuthenticationAuditService implements AuthenticationAuditLog {
    private final JdbcTemplate jdbc;
    private final JsonCodec jsonCodec;

    public AuthenticationAuditService(JdbcTemplate jdbc, JsonCodec jsonCodec) {
        this.jdbc = jdbc;
        this.jsonCodec = jsonCodec;
    }

    @Override
    public void record(LoginEvent event) {
        Map<String, String> detail = new LinkedHashMap<>();
        put(detail, "method", event.method());
        put(detail, "vendorCode", event.vendorCode());
        put(detail, "failureCode", event.failureCode());
        put(detail, "clientAddress", event.clientAddress());
        boolean known = event.userId() != null;
        // A failed attempt may name an account that no longer exists, so only successes carry the actor.
        boolean succeeded = !LOGIN_FAILED.equals(event.eventType());
        jdbc.update("""
                insert into RHN_AUD_IAM_AUTH_EVT
                    (ID_IAM_AUTH_EVT, ID_TNT, SD_EVT_TYPE, SD_TARGET_TYPE, ID_TARGET, ID_USER_ACTOR, JSON_DETAIL, DT_OCCRD)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """, GlobalIds.next(), event.tenantId(), event.eventType(), known ? "USER_ACCOUNT" : "LOGIN_ATTEMPT",
                known ? event.userId() : GlobalIds.next(), succeeded ? event.userId() : null, jsonCodec.write(detail),
                Timestamp.from(Instant.now()));
    }

    private static void put(Map<String, String> detail, String key, String value) {
        if (value != null && !value.isBlank()) detail.put(key, value.length() > 128 ? value.substring(0, 128) : value);
    }
}
