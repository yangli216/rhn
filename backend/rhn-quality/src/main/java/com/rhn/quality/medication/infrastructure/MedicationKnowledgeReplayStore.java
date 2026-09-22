package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationKnowledgeReplayContracts.*;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.OffsetDateTime;
import java.util.Optional;

@Repository
public class MedicationKnowledgeReplayStore {
    private final JdbcTemplate jdbc; private final JsonCodec json;
    public MedicationKnowledgeReplayStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    public record StoredSource(Source source,String rawInput) {}
    private Source source(java.sql.ResultSet r) throws java.sql.SQLException {
        var time=r.getObject("DT_STARTED",OffsetDateTime.class);
        return new Source(r.getLong("ID_EVAL"),r.getLong("ID_RX"),r.getLong("ID_ENC"),r.getLong("NO_TARGET_REV"),
                r.getLong("ID_ORG"),r.getLong("ID_DEPT"),time==null?null:time.toInstant(),r.getString("CD_INPUT_HASH"),r.getString("SD_MODE"));
    }
    public PageResult<Source> sources(Long tenant,Long org,Long dept,int page) {
        String where=" from RHN_AUD_MED_EVAL where ID_TNT=? and ID_ORG=? and ID_DEPT=?";
        long total=jdbc.queryForObject("select count(*)"+where,Long.class,tenant,org,dept);
        var rows=jdbc.query("select ID_EVAL,ID_RX,ID_ENC,NO_TARGET_REV,ID_ORG,ID_DEPT,DT_STARTED,CD_INPUT_HASH,SD_MODE"+where+" order by ID_EVAL desc offset ? rows fetch next 20 rows only",(r,n)->source(r),tenant,org,dept,(long)page*20);
        return new PageResult<>(rows,total,(int)((total+19)/20),page,20);
    }
    public Optional<StoredSource> source(Long tenant,Long org,Long dept,Long id) {
        return jdbc.query("select ID_EVAL,ID_RX,ID_ENC,NO_TARGET_REV,ID_ORG,ID_DEPT,DT_STARTED,CD_INPUT_HASH,SD_MODE,JSON_INPUT from RHN_AUD_MED_EVAL where ID_TNT=? and ID_ORG=? and ID_DEPT=? and ID_EVAL=?",
                (r,n)->new StoredSource(source(r),r.getString("JSON_INPUT")),tenant,org,dept,id).stream().findFirst();
    }
    public void append(Long tenant,Run r) {
        jdbc.update("insert into RHN_AUD_KNOW_REPLAY (ID_TNT,ID_REPLAY,ID_KNOW,NO_VERSION,ID_ORG,ID_DEPT,JSON_RUN) values (?,?,?,?,?,?,?)",
                tenant,r.id(),r.knowledge().id(),r.knowledge().version(),r.source().organizationId(),r.source().departmentId(),json.write(r));
    }
    public Optional<Run> find(Long tenant,Long org,Long dept,Long knowledge,Long id) {
        return jdbc.query("select JSON_RUN from RHN_AUD_KNOW_REPLAY where ID_TNT=? and ID_ORG=? and ID_DEPT=? and ID_KNOW=? and ID_REPLAY=?",
                (r,n)->json.read(r.getString(1),Run.class),tenant,org,dept,knowledge,id).stream().findFirst();
    }
    public PageResult<Summary> history(Long tenant,Long org,Long dept,Long knowledge,int page) {
        String where=" from RHN_AUD_KNOW_REPLAY where ID_TNT=? and ID_ORG=? and ID_DEPT=? and ID_KNOW=?";
        long total=jdbc.queryForObject("select count(*)"+where,Long.class,tenant,org,dept,knowledge);
        var rows=jdbc.query("select JSON_RUN"+where+" order by ID_REPLAY desc offset ? rows fetch next 20 rows only",(r,n)->{
            var run=json.read(r.getString(1),Run.class);return new Summary(run.id(),run.knowledge().version(),run.source().evaluationId(),run.source().prescriptionId(),run.result().outcome(),run.actor(),run.createdAt());
        },tenant,org,dept,knowledge,(long)page*20);
        return new PageResult<>(rows,total,(int)((total+19)/20),page,20);
    }
}
