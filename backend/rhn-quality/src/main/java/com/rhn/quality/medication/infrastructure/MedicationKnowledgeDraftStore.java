package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Version;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public class MedicationKnowledgeDraftStore {
    private final JdbcTemplate jdbc; private final JsonCodec json;
    public MedicationKnowledgeDraftStore(JdbcTemplate jdbc, JsonCodec json) { this.jdbc = jdbc; this.json = json; }
    public List<Version> allVersions(Long tenant) {
        return jdbc.query("select JSON_VERSION from RHN_AUD_MED_KNOW_DRAFT where ID_TNT=? order by ID_KNOW desc, NO_VERSION desc",
                (rs, row) -> json.read(rs.getString(1), Version.class), tenant);
    }
    public List<Version> latest(Long tenant) {
        return jdbc.query("""
            select v.JSON_VERSION from RHN_AUD_MED_KNOW_DRAFT v where v.ID_TNT=? and not exists (
              select 1 from RHN_AUD_MED_KNOW_DRAFT n where n.ID_TNT=v.ID_TNT and n.ID_KNOW=v.ID_KNOW and n.NO_VERSION>v.NO_VERSION)
            order by v.ID_KNOW desc
            """, (rs, row) -> json.read(rs.getString(1), Version.class), tenant);
    }
    public Optional<Version> latest(Long tenant, Long id) {
        return jdbc.query("select JSON_VERSION from RHN_AUD_MED_KNOW_DRAFT where ID_TNT=? and ID_KNOW=? order by NO_VERSION desc fetch first 1 rows only",
                (rs, row) -> json.read(rs.getString(1), Version.class), tenant, id).stream().findFirst();
    }
    public List<Version> history(Long tenant, Long id, int page) {
        return jdbc.query("select JSON_VERSION from RHN_AUD_MED_KNOW_DRAFT where ID_TNT=? and ID_KNOW=? order by NO_VERSION desc offset ? rows fetch next 20 rows only",
                (rs, row) -> json.read(rs.getString(1), Version.class), tenant, id, (long) page * 20);
    }
    public void lockRoot(Long tenant,Long id) {jdbc.queryForObject("select ID_KNOW from RHN_AUD_MED_KNOW_DRAFT where ID_TNT=? and ID_KNOW=? and NO_VERSION=1 for update",Long.class,tenant,id);}
    public void append(Long tenant, Version version) {
        jdbc.update("insert into RHN_AUD_MED_KNOW_DRAFT (ID_TNT, ID_KNOW, NO_VERSION, JSON_VERSION) values (?,?,?,?)",
                tenant, version.id(), version.version(), json.write(version));
    }
    public void append(Long tenant,Version version,Long intakeId) {
        jdbc.update("insert into RHN_AUD_MED_KNOW_DRAFT (ID_TNT,ID_KNOW,NO_VERSION,JSON_VERSION,ID_INTAKE) values (?,?,?,?,?)",tenant,version.id(),version.version(),json.write(version),intakeId);
    }
    public Long intakeId(Long tenant,Long id,int version) {
        var rows=jdbc.query("select ID_INTAKE from RHN_AUD_MED_KNOW_DRAFT where ID_TNT=? and ID_KNOW=? and NO_VERSION=?",(r,n)->r.getObject(1,Long.class),tenant,id,version);
        if(rows.isEmpty()) throw com.rhn.shared.api.BusinessErrors.notFound("QMED_KNOWLEDGE_VERSION","未找到当前租户的知识版本");return rows.getFirst();
    }

}
