package com.rhn.billing.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** 医保调试配置与网关往返记录的持久化。 */
@Repository
public class InsuranceDebugStore {
    public record ConfigRow(long id, long revision, boolean enabled, String scope, String selectedInfnos, String retention,
                            int keepDays, Instant enabledUntil) {}

    public record LogRow(long id, String infno, Instant startedAt, long durationMs, Integer httpStatus, String infcode, String errMsg,
                         String outcome, String retention, Long userId, String actor, Long orgId, String correlationId,
                         String request, String response, Instant expiresAt, Long claimId, String claimNo) {}

    public record LogQuery(Instant from, Instant to, String infno, String outcome, String keyword, boolean failedOnly, Long claimId) {}

    private static final String COLUMNS = "ID_EXCH_LOG, CD_INFNO, DT_STARTED, QTY_ELAPSED_MS, QTY_HTTP_STATUS, CD_INFCODE, DES_ERR_MSG, "
            + "SD_OUTCOME, SD_RETAIN, ID_USER, NA_ACTOR, ID_ORG, ID_CORR, JSON_REQ, JSON_RESP, DT_EXPIRES, ID_INS_CLAIM, "
            + "(select c.CD_CLAIM_NO from RHN_INS_CLAIM c where c.ID_INS_CLAIM = l.ID_INS_CLAIM and c.ID_TNT = l.ID_TNT) as CLAIM_NO";

    private final JdbcTemplate jdbc;

    public InsuranceDebugStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Optional<ConfigRow> findConfig(long tenantId) {
        return jdbc.query("select ID_DBG_CFG, REVISION, FG_ENABLED, SD_SCOPE, CD_SEL_INFNO, SD_RETAIN, QTY_KEEP_DAYS, DT_ENABLED_UNTIL "
                + "from RHN_INS_DBG_CFG where ID_TNT = ?", (rs, i) -> new ConfigRow(rs.getLong(1), rs.getLong(2), rs.getBoolean(3),
                rs.getString(4), rs.getString(5), rs.getString(6), rs.getInt(7), instant(rs.getTimestamp(8))), tenantId)
                .stream().findFirst();
    }

    public void insertConfig(long id, long tenantId, ConfigRow row, Long userId, Instant now) {
        jdbc.update("insert into RHN_INS_DBG_CFG (ID_DBG_CFG, REVISION, ID_TNT, FG_ENABLED, SD_SCOPE, CD_SEL_INFNO, SD_RETAIN, "
                        + "QTY_KEEP_DAYS, DT_ENABLED_UNTIL, DT_UPDATED, ID_USER_UPDATED) values (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, tenantId, row.enabled(), row.scope(), row.selectedInfnos(), row.retention(), row.keepDays(),
                timestamp(row.enabledUntil()), timestamp(now), userId);
    }

    /** 乐观锁更新；返回受影响行数，0 表示版本已变化。 */
    public int updateConfig(long tenantId, long expectedRevision, ConfigRow row, Long userId, Instant now) {
        return jdbc.update("update RHN_INS_DBG_CFG set REVISION = REVISION + 1, FG_ENABLED = ?, SD_SCOPE = ?, CD_SEL_INFNO = ?, "
                        + "SD_RETAIN = ?, QTY_KEEP_DAYS = ?, DT_ENABLED_UNTIL = ?, DT_UPDATED = ?, ID_USER_UPDATED = ? "
                        + "where ID_TNT = ? and REVISION = ?",
                row.enabled(), row.scope(), row.selectedInfnos(), row.retention(), row.keepDays(), timestamp(row.enabledUntil()),
                timestamp(now), userId, tenantId, expectedRevision);
    }

    public void insertLog(long id, long tenantId, LogRow row, Instant createdAt) {
        jdbc.update("insert into RHN_INS_EXCH_LOG (ID_EXCH_LOG, ID_TNT, CD_INFNO, DT_STARTED, QTY_ELAPSED_MS, QTY_HTTP_STATUS, CD_INFCODE, "
                        + "DES_ERR_MSG, SD_OUTCOME, SD_RETAIN, ID_USER, NA_ACTOR, ID_ORG, ID_CORR, JSON_REQ, JSON_RESP, DT_EXPIRES, "
                        + "DT_CREATED, ID_INS_CLAIM) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, tenantId, row.infno(), timestamp(row.startedAt()), row.durationMs(), row.httpStatus(), row.infcode(), row.errMsg(),
                row.outcome(), row.retention(), row.userId(), row.actor(), row.orgId(), row.correlationId(), row.request(), row.response(),
                timestamp(row.expiresAt()), timestamp(createdAt), row.claimId());
    }

    public long count(long tenantId, LogQuery query) {
        var args = new ArrayList<Object>();
        String where = where(tenantId, query, args);
        Long value = jdbc.queryForObject("select count(*) from RHN_INS_EXCH_LOG " + where, Long.class, args.toArray());
        return value == null ? 0 : value;
    }

    public List<LogRow> page(long tenantId, LogQuery query, int page, int size) {
        var args = new ArrayList<Object>();
        String where = where(tenantId, query, args);
        args.add((long) page * size);
        args.add(size);
        return jdbc.query("select " + COLUMNS + " from RHN_INS_EXCH_LOG l " + where
                + " order by DT_STARTED desc, ID_EXCH_LOG desc offset ? rows fetch next ? rows only", this::read, args.toArray());
    }

    public Optional<LogRow> find(long tenantId, long id) {
        return jdbc.query("select " + COLUMNS + " from RHN_INS_EXCH_LOG l where ID_TNT = ? and ID_EXCH_LOG = ?", this::read, tenantId, id)
                .stream().findFirst();
    }

    public int purgeExpired(Instant now) {
        return jdbc.update("delete from RHN_INS_EXCH_LOG where DT_EXPIRES < ?", timestamp(now));
    }

    private static String where(long tenantId, LogQuery query, List<Object> args) {
        var sql = new StringBuilder("where ID_TNT = ?");
        args.add(tenantId);
        if (query.from() != null) { sql.append(" and DT_STARTED >= ?"); args.add(timestamp(query.from())); }
        if (query.to() != null) { sql.append(" and DT_STARTED < ?"); args.add(timestamp(query.to())); }
        if (query.infno() != null) { sql.append(" and CD_INFNO = ?"); args.add(query.infno()); }
        if (query.outcome() != null) { sql.append(" and SD_OUTCOME = ?"); args.add(query.outcome()); }
        if (query.claimId() != null) { sql.append(" and ID_INS_CLAIM = ?"); args.add(query.claimId()); }
        if (query.failedOnly()) sql.append(" and SD_OUTCOME <> 'OK'");
        if (query.keyword() != null) {
            sql.append(" and (lower(ID_CORR) like ? or lower(NA_ACTOR) like ? or lower(DES_ERR_MSG) like ? or lower(CD_INFCODE) like ?"
                    + " or ID_INS_CLAIM in (select k.ID_INS_CLAIM from RHN_INS_CLAIM k where k.ID_TNT = ? and lower(k.CD_CLAIM_NO) like ?))");
            String like = "%" + query.keyword().toLowerCase().replace("%", "").replace("_", "") + "%";
            for (int i = 0; i < 4; i++) args.add(like);
            args.add(tenantId); args.add(like);
        }
        return sql.toString();
    }

    private LogRow read(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        int status = rs.getInt(5);
        Integer httpStatus = rs.wasNull() ? null : status;
        long user = rs.getLong(10);
        Long userId = rs.wasNull() ? null : user;
        long org = rs.getLong(12);
        Long orgId = rs.wasNull() ? null : org;
        long claim = rs.getLong(17);
        Long claimId = rs.wasNull() ? null : claim;
        return new LogRow(rs.getLong(1), rs.getString(2), instant(rs.getTimestamp(3)), rs.getLong(4), httpStatus, rs.getString(6),
                rs.getString(7), rs.getString(8), rs.getString(9), userId, rs.getString(11), orgId, rs.getString(13),
                rs.getString(14), rs.getString(15), instant(rs.getTimestamp(16)), claimId, rs.getString(18));
    }

    private static Timestamp timestamp(Instant value) { return value == null ? null : Timestamp.from(value); }

    private static Instant instant(Timestamp value) { return value == null ? null : value.toInstant(); }
}
