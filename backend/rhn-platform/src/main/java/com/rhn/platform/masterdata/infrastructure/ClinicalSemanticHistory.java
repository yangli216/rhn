package com.rhn.platform.masterdata.infrastructure;

import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

/** Append-only publication/audit log. No update or delete operation is exposed. */
@Repository
public class ClinicalSemanticHistory {
    private final JdbcTemplate jdbc;
    public ClinicalSemanticHistory(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Version(Long revision, String kind, String conceptId, String semanticVersion,
                          String changeType, String source, String snapshot, Instant recordedAt) {}

    public Optional<Version> latest(Long tenant, String kind, String concept) {
        return history(tenant, kind, concept, 1).stream().findFirst();
    }

    public List<Version> history(Long tenant, String kind, String concept, int limit) {
        return jdbc.query("""
                select ID_CLIN_SEM_VER, SD_CONCEPT_KIND, CD_CONCEPT, HASH_SEM_VER,
                       SD_CHANGE_TYPE, DES_SOURCE, JSON_SNAPSHOT, DT_RECORDED
                from RHN_BD_CLIN_SEM_VER where ID_TNT = ? and SD_CONCEPT_KIND = ? and CD_CONCEPT = ?
                order by ID_CLIN_SEM_VER desc fetch first ? rows only
                """, (rs, row) -> new Version(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4),
                rs.getString(5), rs.getString(6), rs.getString(7), rs.getObject(8, OffsetDateTime.class).toInstant()),
                tenant, kind, concept, limit);
    }

    public long count(Long tenant, String kind, String concept) {
        return jdbc.queryForObject("select count(*) from RHN_BD_CLIN_SEM_VER where ID_TNT=? and SD_CONCEPT_KIND=? and CD_CONCEPT=?", Long.class, tenant, kind, concept);
    }
    public List<Version> historyPage(Long tenant, String kind, String concept, int page, int size) {
        return jdbc.query("""
                select ID_CLIN_SEM_VER, SD_CONCEPT_KIND, CD_CONCEPT, HASH_SEM_VER,
                       SD_CHANGE_TYPE, DES_SOURCE, JSON_SNAPSHOT, DT_RECORDED
                from RHN_BD_CLIN_SEM_VER where ID_TNT=? and SD_CONCEPT_KIND=? and CD_CONCEPT=?
                order by ID_CLIN_SEM_VER desc offset ? rows fetch next ? rows only
                """, (rs, row) -> new Version(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4),
                rs.getString(5), rs.getString(6), rs.getString(7), rs.getObject(8, OffsetDateTime.class).toInstant()),
                tenant, kind, concept, (long) page * size, size);
    }

    public List<Version> eventsOfKind(Long tenant, String kind) {
        return jdbc.query("""
                select ID_CLIN_SEM_VER, SD_CONCEPT_KIND, CD_CONCEPT, HASH_SEM_VER,
                       SD_CHANGE_TYPE, DES_SOURCE, JSON_SNAPSHOT, DT_RECORDED
                from RHN_BD_CLIN_SEM_VER where ID_TNT=? and SD_CONCEPT_KIND=? order by ID_CLIN_SEM_VER desc
                """, (rs, row) -> new Version(rs.getLong(1),rs.getString(2),rs.getString(3),rs.getString(4),
                rs.getString(5),rs.getString(6),rs.getString(7),rs.getObject(8,OffsetDateTime.class).toInstant()), tenant,kind);
    }

    public List<Version> ingredients(Long tenant) {
        return jdbc.query("""
                select ID_CLIN_SEM_VER, SD_CONCEPT_KIND, CD_CONCEPT, HASH_SEM_VER,
                       SD_CHANGE_TYPE, DES_SOURCE, JSON_SNAPSHOT, DT_RECORDED
                from RHN_BD_CLIN_SEM_VER where ID_TNT = ? and SD_CONCEPT_KIND = 'INGREDIENT'
                order by ID_CLIN_SEM_VER
                """, (rs, row) -> new Version(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4),
                rs.getString(5), rs.getString(6), rs.getString(7), rs.getObject(8, OffsetDateTime.class).toInstant()), tenant);
    }

    public Version append(Long tenant, Long actor, String kind, String concept, String hash,
                          String change, String source, String snapshot) {
        var value = new Version(GlobalIds.next(), kind, concept, hash, change, source, snapshot, Instant.now());
        jdbc.update("""
                insert into RHN_BD_CLIN_SEM_VER
                (ID_CLIN_SEM_VER, ID_TNT, SD_CONCEPT_KIND, CD_CONCEPT, HASH_SEM_VER,
                 SD_CHANGE_TYPE, DES_SOURCE, JSON_SNAPSHOT, DT_RECORDED, ID_USER_RECORDED, CD_IDENTITY_KEY)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, value.revision(), tenant, kind, concept, hash, change, source, snapshot,
                value.recordedAt().atOffset(ZoneOffset.UTC), actor, "INGREDIENT".equals(kind) ? concept : null);
        return value;
    }
}
