package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.*;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static com.rhn.shared.api.BusinessErrors.*;

/** Append-only opinions. A withdrawal supersedes an opinion; neither edits the runtime result. */
@Repository
public class MedicationKnowledgeFeedbackStore {
    public static final List<String> VERDICTS=List.of("SUPPORTED","FALSE_POSITIVE","POSSIBLE_MISS","DATA_ISSUE","RULE_ISSUE","UNCERTAIN");
    private final JdbcTemplate jdbc;private final JsonCodec json;
    public MedicationKnowledgeFeedbackStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    public static String hash(String value) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException e) {throw new IllegalStateException(e);}
    }
    private Event read(ResultSet rs,int row) throws SQLException {
        String raw=rs.getString("JSON_EVENT");
        if(!Objects.equals(hash(raw),rs.getString("HASH_EVENT")))throw conflict("QMED_FEEDBACK_INTEGRITY","研判历史指纹不一致，请核查审计记录");
        var event=json.read(raw,Event.class);
        if(!Objects.equals(event.id(),rs.getLong("ID_FDBK"))||event.revision()!=rs.getInt("NO_REV")
                ||!Objects.equals(event.basis().runId(),rs.getLong("ID_RULE_RUN"))||!Objects.equals(event.basis().deploymentId(),rs.getLong("ID_DEPLOY"))
                ||!Objects.equals(event.basis().organizationId(),rs.getLong("ID_ORG"))||!Objects.equals(event.basis().departmentId(),rs.getLong("ID_DEPT"))
                ||!Objects.equals(event.operation(),rs.getString("SD_OPER"))||!Objects.equals(event.verdict(),rs.getString("SD_VERDICT")))
            throw conflict("QMED_FEEDBACK_INTEGRITY","研判历史索引与快照不一致，请核查审计记录");
        return event;
    }
    public Event latest(Long tenant,Long run) {return jdbc.query("select * from RHN_AUD_KNOW_FEEDBACK where ID_TNT=? and ID_RULE_RUN=? order by NO_REV desc fetch first 1 rows only",this::read,tenant,run).stream().findFirst().orElse(null);}
    public PageResult<Event> history(Long tenant,Long run,int page) {
        long count=jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_FEEDBACK where ID_TNT=? and ID_RULE_RUN=?",Long.class,tenant,run);
        var records=jdbc.query("select * from RHN_AUD_KNOW_FEEDBACK where ID_TNT=? and ID_RULE_RUN=? order by NO_REV desc offset ? rows fetch next 20 rows only",this::read,tenant,run,(long)page*20);
        return new PageResult<>(records,count,(int)((count+19)/20),page,20);
    }
    public void append(Long tenant,Event event) {
        var basis=event.basis();String raw=json.write(event);
        jdbc.update("""
            insert into RHN_AUD_KNOW_FEEDBACK (ID_TNT,ID_FDBK,ID_RULE_RUN,ID_DEPLOY,ID_ORG,ID_DEPT,NO_REV,SD_OPER,SD_VERDICT,JSON_EVENT,HASH_EVENT)
            values (?,?,?,?,?,?,?,?,?,?,?)
            """,tenant,event.id(),basis.runId(),basis.deploymentId(),basis.organizationId(),basis.departmentId(),event.revision(),event.operation(),event.verdict(),raw,hash(raw));
    }
    private String scope() {return " f.ID_TNT=? and f.ID_ORG=? and f.ID_DEPT=? and f.ID_DEPLOY=? and not exists (select 1 from RHN_AUD_KNOW_FEEDBACK n where n.ID_TNT=f.ID_TNT and n.ID_RULE_RUN=f.ID_RULE_RUN and n.NO_REV>f.NO_REV)";}
    public Summary summary(Long tenant,Long org,Long dept,Long deployment,long observed) {
        var counts=new LinkedHashMap<String,Long>();VERDICTS.forEach(v->counts.put(v,0L));
        jdbc.query("select f.SD_VERDICT,count(*) from RHN_AUD_KNOW_FEEDBACK f where "+scope()+" and f.SD_OPER='RECORD' group by f.SD_VERDICT",rs->{counts.put(rs.getString(1),rs.getLong(2));},tenant,org,dept,deployment);
        long recorded=counts.values().stream().mapToLong(Long::longValue).sum();
        return new Summary(recorded,Math.max(0,observed-recorded),Map.copyOf(counts));
    }
    public Map<Long,State> states(Long tenant,Long org,Long dept,Long deployment,List<Long> runs) {
        if(runs.isEmpty())return Map.of();
        var params=new ArrayList<Object>(List.of(tenant,org,dept,deployment));params.addAll(runs);
        var events=jdbc.query("select f.* from RHN_AUD_KNOW_FEEDBACK f where "+scope()+" and f.ID_RULE_RUN in ("+String.join(",",Collections.nCopies(runs.size(),"?"))+")",this::read,params.toArray());
        var result=new HashMap<Long,State>();events.forEach(e->result.put(e.basis().runId(),new State(e.id(),e.revision(),e.operation(),e.verdict(),e.actor(),e.time())));return Map.copyOf(result);
    }
}
