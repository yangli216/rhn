package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.api.StandardCatalogReview.Event;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;

/** Immutable events; the unique revision key arbitrates concurrent review transitions. */
@Repository
public class StandardCatalogReviewStore {
    private final JdbcTemplate jdbc;
    private final JsonCodec json;
    public StandardCatalogReviewStore(JdbcTemplate jdbc, JsonCodec json) { this.jdbc = jdbc; this.json = json; }
    public List<Event> history(Long tenant, String identityHash, int limit) {
        return jdbc.query("""
                select JSON_EVENT from RHN_BD_STD_REVIEW where ID_TNT=? and HASH_IDTY=?
                order by REVISION desc fetch first ? rows only
                """, (rs, row) -> json.read(rs.getString(1), Event.class), tenant, identityHash, limit);
    }
    public void append(Long tenant, String identityHash, Event event) {
        jdbc.update("""
                insert into RHN_BD_STD_REVIEW (ID_STD_REVIEW, ID_TNT, CD_CATALOG, HASH_IDTY, REVISION, JSON_EVENT)
                values (?, ?, ?, ?, ?, ?)
                """, event.id(), tenant, event.identity().catalogId(), identityHash, event.revision(), json.write(event));
    }
    public List<Event> catalogHistory(Long tenant, String catalogId, int page, int size) {
        return jdbc.query("""
                select JSON_EVENT from RHN_BD_STD_REVIEW where ID_TNT=? and CD_CATALOG=?
                order by ID_STD_REVIEW desc offset ? rows fetch next ? rows only
                """, (rs, row) -> json.read(rs.getString(1), Event.class), tenant, catalogId, (long) page * size, size);
    }
    public int count(Long tenant, String catalogId) {
        return jdbc.queryForObject("select count(*) from RHN_BD_STD_REVIEW where ID_TNT=? and CD_CATALOG=?", Integer.class, tenant, catalogId);
    }
}
