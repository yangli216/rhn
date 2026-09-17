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
