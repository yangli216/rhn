package com.rhn.billing.application;

import com.rhn.billing.api.SettlementAuthorizationDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class JpaSettlementAuthorizationDirectory implements SettlementAuthorizationDirectory {
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    public JpaSettlementAuthorizationDirectory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.namedJdbc = new NamedParameterJdbcTemplate(jdbc);
    }

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

    @Override
    public Map<Long, Long> finalizedSettlementsForRequests(Long tenantId, Collection<Long> requestIds,
                                                           String sourceType) {
        Map<Long, Long> result = new LinkedHashMap<>();
        if (tenantId == null || requestIds == null || sourceType == null) return result;
        List<Long> ids = requestIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        // 预填全部请求，保证调用方用 containsKey 判定「已批量确认未结算」，无需逐条回退。
        ids.forEach(id -> result.put(id, null));
        for (int from = 0; from < ids.size(); from += 500) {
            MapSqlParameterSource params = new MapSqlParameterSource()
                    .addValue("tenantId", tenantId)
                    .addValue("sourceType", sourceType)
                    .addValue("requestIds", ids.subList(from, Math.min(from + 500, ids.size())));
            namedJdbc.query("""
                    select ci.ID_CARE_REQ as request_id, max(s.ID_STL) as settlement_id from RHN_BIL_STL s
                      join RHN_BIL_STL_LINE sl on sl.ID_TNT = s.ID_TNT and sl.ID_STL = s.ID_STL
                      join RHN_BIL_CHARGE_ITEM ci on ci.ID_TNT = sl.ID_TNT and ci.ID_CHARGE_ITEM = sl.ID_CHARGE_ITEM
                     where s.ID_TNT = :tenantId and ci.ID_CARE_REQ in (:requestIds) and ci.SD_SRC_TYPE = :sourceType
                       and s.SD_STATUS = 'SETTLED'
                     group by ci.ID_CARE_REQ
                    """, params, (rs, row) -> Map.entry(rs.getLong("request_id"), rs.getLong("settlement_id")))
                    .forEach(entry -> result.putIfAbsent(entry.getKey(), entry.getValue()));
        }
        return result;
    }
}

