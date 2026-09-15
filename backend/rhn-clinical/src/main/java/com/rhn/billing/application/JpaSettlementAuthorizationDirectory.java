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
                select max(s.ID_STL) from RHN_BIL_STL s
                  join RHN_BIL_STL_LINE sl on sl.ID_TNT = s.ID_TNT and sl.ID_STL = s.ID_STL
                  join RHN_BIL_CHARGE_ITEM ci on ci.ID_TNT = sl.ID_TNT and ci.ID_CHARGE_ITEM = sl.ID_CHARGE_ITEM
                 where s.ID_TNT = ? and ci.ID_CARE_REQ = ? and ci.SD_SRC_TYPE = ? and s.SD_STATUS = 'SETTLED'
                """, Long.class, tenantId, requestId, sourceType);
        return Optional.ofNullable(value);
    }
}

