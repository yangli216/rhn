package com.rhn.billing.application;

import com.rhn.billing.api.SettlementAuthorizationDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class JpaSettlementAuthorizationDirectory implements SettlementAuthorizationDirectory {
    private final JdbcTemplate jdbc;

    public JpaSettlementAuthorizationDirectory(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public Optional<Long> finalizedSettlementForRequest(Long tenantId, Long requestId, String sourceType) {
        Long value = jdbc.queryForObject("""
                select max(s.id)
                  from settlements s
                  join settlement_lines sl on sl.tenant_id = s.tenant_id and sl.settlement_id = s.id
                  join charge_items ci on ci.tenant_id = sl.tenant_id and ci.id = sl.charge_item_id
                 where s.tenant_id = ? and ci.request_id = ? and ci.source_type = ? and s.status = 'SETTLED'
                """, Long.class, tenantId, requestId, sourceType);
        return Optional.ofNullable(value);
    }
}

