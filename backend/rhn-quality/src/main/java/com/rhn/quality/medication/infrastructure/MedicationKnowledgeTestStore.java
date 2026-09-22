package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.*;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public class MedicationKnowledgeTestStore {
    private final JdbcTemplate jdbc;private final JsonCodec json;
    public MedicationKnowledgeTestStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    public void lock(Long tenant,Long candidate) {jdbc.queryForObject("select ID_KNOW_RULE from RHN_AUD_KNOW_RULE where ID_TNT=? and ID_KNOW_RULE=? for update",Long.class,tenant,candidate);}
    public ValidationStatus status(Long tenant,Long candidate) {
        var suite=jdbc.query("select JSON_SUITE from RHN_AUD_KNOW_SUITE where ID_TNT=? and ID_KNOW_RULE=? order by NO_VERSION desc fetch first 1 rows only",(r,n)->json.read(r.getString(1),Suite.class),tenant,candidate).stream().findFirst();
        if(suite.isEmpty()) return new ValidationStatus("NOT_AUTHORED",0,null,0,0);
        int version=suite.get().version();
        var latest=jdbc.query("select JSON_RUN from RHN_AUD_KNOW_TEST where ID_TNT=? and ID_KNOW_RULE=? and NO_SUITE_VERSION=? order by ID_KNOW_TEST desc fetch first 1 rows only",(r,n)->json.read(r.getString(1),Run.class),tenant,candidate,version).stream().findFirst();
        if(latest.isEmpty()) return new ValidationStatus("NOT_RUN",version,null,suite.get().cases().size(),0);
        var r=latest.get();return new ValidationStatus(r.allPassed()?"PASSED":"FAILED",version,r.id(),r.results().size(),(int)r.results().stream().filter(CaseResult::passed).count());
    }
    public int latestVersion(Long tenant,Long candidate) {return jdbc.queryForObject("select coalesce(max(NO_VERSION),0) from RHN_AUD_KNOW_SUITE where ID_TNT=? and ID_KNOW_RULE=?",Integer.class,tenant,candidate);}
    public Optional<Suite> suite(Long tenant,Long candidate,int version) {return jdbc.query("select JSON_SUITE from RHN_AUD_KNOW_SUITE where ID_TNT=? and ID_KNOW_RULE=? and NO_VERSION=?",(r,n)->json.read(r.getString(1),Suite.class),tenant,candidate,version).stream().findFirst();}
    public void append(Long tenant,Suite value) {jdbc.update("insert into RHN_AUD_KNOW_SUITE (ID_TNT,ID_KNOW_RULE,NO_VERSION,JSON_SUITE) values (?,?,?,?)",tenant,value.candidateId(),value.version(),json.write(value));}
    public PageResult<SuiteSummary> suites(Long tenant,Long candidate,int page) {
        long total=jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_SUITE where ID_TNT=? and ID_KNOW_RULE=?",Long.class,tenant,candidate);
        var rows=jdbc.query("select JSON_SUITE from RHN_AUD_KNOW_SUITE where ID_TNT=? and ID_KNOW_RULE=? order by NO_VERSION desc offset ? rows fetch next 20 rows only",(r,n)-> {
            var s=json.read(r.getString(1),Suite.class);return new SuiteSummary(s.version(),s.cases().size(),s.actor(),s.createdAt(),s.reason());
        },tenant,candidate,(long)page*20);
        return new PageResult<>(rows,total,(int)((total+19)/20),page,20);
    }
    public void append(Long tenant,Run value) {jdbc.update("insert into RHN_AUD_KNOW_TEST (ID_TNT,ID_KNOW_TEST,ID_KNOW_RULE,NO_SUITE_VERSION,JSON_RUN) values (?,?,?,?,?)",tenant,value.id(),value.candidateId(),value.suite().version(),json.write(value));}
    public Optional<Run> run(Long tenant,Long candidate,Long id) {return jdbc.query("select JSON_RUN from RHN_AUD_KNOW_TEST where ID_TNT=? and ID_KNOW_RULE=? and ID_KNOW_TEST=?",(r,n)->json.read(r.getString(1),Run.class),tenant,candidate,id).stream().findFirst();}
    public PageResult<RunSummary> runs(Long tenant,Long candidate,int page) {
        long total=jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_TEST where ID_TNT=? and ID_KNOW_RULE=?",Long.class,tenant,candidate);
        var rows=jdbc.query("select JSON_RUN from RHN_AUD_KNOW_TEST where ID_TNT=? and ID_KNOW_RULE=? order by ID_KNOW_TEST desc offset ? rows fetch next 20 rows only",(r,n)-> {
            var s=json.read(r.getString(1),Run.class);return new RunSummary(s.id(),s.suite().version(),s.results().size(),(int)s.results().stream().filter(CaseResult::passed).count(),s.allPassed(),s.actor(),s.createdAt());
        },tenant,candidate,(long)page*20);
        return new PageResult<>(rows,total,(int)((total+19)/20),page,20);
    }
}
