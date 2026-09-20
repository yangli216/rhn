package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Repository
public class MedicationWorkbenchStore {
    private final JdbcTemplate jdbc; private final JsonCodec json;
    public MedicationWorkbenchStore(JdbcTemplate jdbc, JsonCodec json) { this.jdbc=jdbc; this.json=json; }
    public void append(Long tenant, Long actor, Candidate candidate) {
        jdbc.update("insert into RHN_AUD_MED_CAND (ID_CAND, ID_TNT, ID_USER_ACTOR, JSON_CONTENT) values (?, ?, ?, ?)",
                candidate.id(), tenant, actor, json.write(candidate));
    }
    public List<Candidate> all(Long tenant) {
        return jdbc.query("select JSON_CONTENT from RHN_AUD_MED_CAND where ID_TNT=? order by ID_CAND desc",
                (rs,n)->json.read(rs.getString(1),Candidate.class),tenant);
    }
    @org.springframework.transaction.annotation.Transactional
    public Candidate appendVersion(Long tenant, Long actor, Candidate value) {
        int version=1;
        if(value.parentId()!=null) {
            var root=require(tenant,value.parentId());
            while(root.parentId()!=null) root=require(tenant,root.parentId());
            jdbc.queryForObject("select ID_CAND from RHN_AUD_MED_CAND where ID_TNT=? and ID_CAND=? for update",Long.class,tenant,root.id());
            var members=new java.util.HashSet<Long>();members.add(root.id());var all=all(tenant);
            boolean changed=true;
            while(changed) { changed=false; for(var c:all) if(c.parentId()!=null && members.contains(c.parentId())) changed|=members.add(c.id()); }
            version=all.stream().filter(c->members.contains(c.id())).mapToInt(Candidate::version).max().orElse(0)+1;
        }
        var saved=new Candidate(value.id(),value.parentId(),version,value.requirement(),value.source(),value.model(),value.createdAt(),value.rule(),value.medications(),value.status());
        append(tenant,actor,saved);return saved;
    }
    public void update(Long tenant, Candidate candidate) {
        jdbc.update("update RHN_AUD_MED_CAND set JSON_CONTENT = ? where ID_TNT = ? and ID_CAND = ?",
                json.write(candidate), tenant, candidate.id());
    }
    public Candidate require(Long tenant, Long id) {
        return jdbc.query("select JSON_CONTENT from RHN_AUD_MED_CAND where ID_TNT=? and ID_CAND=?",
                (rs,n)->json.read(rs.getString(1),Candidate.class),tenant,id).stream().findFirst()
                .orElseThrow(()->notFound("QMED_CANDIDATE_NOT_FOUND","未找到当前租户的候选规则"));
    }
    public List<Candidate> list(Long tenant) {
        return jdbc.query("select JSON_CONTENT from RHN_AUD_MED_CAND where ID_TNT=? order by ID_CAND desc fetch first 50 rows only",
                (rs,n)->json.read(rs.getString(1),Candidate.class),tenant);
    }
    public void appendRun(Long tenant, Long actor, TrialRun run, String input) {
        jdbc.update("insert into RHN_AUD_MED_TRIAL (ID_TRIAL, ID_TNT, ID_CAND, ID_USER_ACTOR, JSON_INPUT, JSON_RESULT) values (?, ?, ?, ?, ?, ?)",
                run.id(),tenant,run.candidateId(),actor,input,json.write(run));
    }
    public List<TrialRun> syntheticRuns(Long tenant, Long id) {
        return jdbc.query("select JSON_RESULT from RHN_AUD_MED_TRIAL where ID_TNT=? and ID_CAND=? order by ID_TRIAL desc fetch first 30 rows only",
                (rs,n)->json.read(rs.getString(1),TrialRun.class),tenant,id).stream()
                .filter(r -> "SYNTHETIC".equals(r.mode())).toList();
    }
}
