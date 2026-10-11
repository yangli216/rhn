package com.rhn.ai.infrastructure;

import com.rhn.ai.api.DecisionObservationContracts.*;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;

@Repository
public class DecisionObservationStore {
    private final JdbcTemplate jdbc;
    private final JsonCodec json;
    public DecisionObservationStore(JdbcTemplate jdbc, JsonCodec json) { this.jdbc=jdbc; this.json=json; }
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void append(ExecutionContext c, DecisionRun run) {
        jdbc.update("""
            insert into RHN_AUD_AI_DCSN_RUN
            (ID_RUN,ID_TNT,ID_ORG,ID_DEPT,SD_SCENE,SD_MODE,SD_OUTCOME,DT_CREATED,SD_COMPARE,FG_EQUAL,NO_LATENCY,FG_CALL,FG_JUDGED,FG_UNCERT,JSON_RUN)
            values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,run.id(),c.tenantId(),c.organizationId(),c.departmentId(),run.scene(),run.mode(),run.outcome(),
                run.time().atOffset(ZoneOffset.UTC),run.comparison(),run.equal()==null?null:run.equal()?1:0,run.latencyMs(),run.modelCalled()?1:0,run.judged()?1:0,run.uncertain()?1:0,json.write(run));
    }
    public record Filter(String scene,String mode,String outcome,Instant from,Instant to) {}
    private record Query(String where,Object[] args) {}
    private Query query(ExecutionContext c,Filter f) {
        var where=new StringBuilder(" where ID_TNT=? and ID_ORG=? and ID_DEPT=?");
        var args=new ArrayList<Object>(List.of(c.tenantId(),c.organizationId(),c.departmentId()));
        if(f.scene()!=null){where.append(" and SD_SCENE=?");args.add(f.scene());}
        if(f.mode()!=null){where.append(" and SD_MODE=?");args.add(f.mode());}
        if(f.outcome()!=null){where.append(" and SD_OUTCOME=?");args.add(f.outcome());}
        if(f.from()!=null){where.append(" and DT_CREATED>=?");args.add(f.from().atOffset(ZoneOffset.UTC));}
        if(f.to()!=null){where.append(" and DT_CREATED<?");args.add(f.to().atOffset(ZoneOffset.UTC));}
        return new Query(where.toString(),args.toArray());
    }
    public List<DecisionRun> page(ExecutionContext c,Filter f,int page,int size) {
        var q=query(c,f);var args=new ArrayList<>(Arrays.asList(q.args()));args.add(page*size);args.add(size);
        return jdbc.query("select JSON_RUN from RHN_AUD_AI_DCSN_RUN"+q.where()+" order by ID_RUN desc offset ? rows fetch next ? rows only",
                (r,n)->json.read(r.getString(1),DecisionRun.class),args.toArray());
    }
    public Optional<DecisionRun> find(ExecutionContext c,Long id) {
        return jdbc.query("select JSON_RUN from RHN_AUD_AI_DCSN_RUN where ID_TNT=? and ID_ORG=? and ID_DEPT=? and ID_RUN=?",
                (r,n)->json.read(r.getString(1),DecisionRun.class),c.tenantId(),c.organizationId(),c.departmentId(),id).stream().findFirst();
    }
    public DecisionStatistics statistics(ExecutionContext c,Filter f) {
        var q=query(c,f);
        var outcomes=new LinkedHashMap<String,Integer>();
        jdbc.query("select SD_OUTCOME,count(*) from RHN_AUD_AI_DCSN_RUN"+q.where()+" group by SD_OUTCOME",
                r->{outcomes.put(r.getString(1),r.getInt(2));},q.args());
        return jdbc.queryForObject("""
            select count(*),sum(case when SD_COMPARE='COMPARABLE' then 1 else 0 end),
            sum(case when FG_EQUAL=1 then 1 else 0 end),avg(NO_LATENCY),
            percentile_disc(0.95) within group (order by NO_LATENCY),
            sum(case when exists (select 1 from RHN_AUD_AI_DCSN_REVIEW r where r.ID_TNT=v.ID_TNT and r.ID_RUN=v.ID_RUN) then 1 else 0 end),sum(FG_CALL),sum(FG_JUDGED),sum(FG_UNCERT)
            from RHN_AUD_AI_DCSN_RUN v
            """+q.where(),(r,n)->new DecisionStatistics(r.getInt(1),Map.copyOf(outcomes),r.getInt(2),r.getInt(3),r.getInt(6),
                r.getObject(4)==null?null:r.getDouble(4),r.getObject(5)==null?null:r.getInt(5),r.getInt(7),r.getInt(8),r.getInt(9)),q.args());
    }
    public Optional<Instant> latest(ExecutionContext c,String scene) {
        return page(c,new Filter(scene,null,null,null,null),0,1).stream().map(DecisionRun::time).findFirst();
    }
    public List<DecisionReview> reviews(ExecutionContext c,Long runId) {
        return jdbc.query("select JSON_REVIEW from RHN_AUD_AI_DCSN_REVIEW where ID_TNT=? and ID_RUN=? order by ID_REVIEW desc",
                (r,n)->json.read(r.getString(1),DecisionReview.class),c.tenantId(),runId);
    }
    public Optional<DecisionReview> latestReview(ExecutionContext c,Long runId) {
        return jdbc.query("select JSON_REVIEW from RHN_AUD_AI_DCSN_REVIEW where ID_TNT=? and ID_RUN=? order by ID_REVIEW desc fetch first 1 rows only",
                (r,n)->json.read(r.getString(1),DecisionReview.class),c.tenantId(),runId).stream().findFirst();
    }
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void appendReview(ExecutionContext c,DecisionReview review) {
        jdbc.update("insert into RHN_AUD_AI_DCSN_REVIEW (ID_REVIEW,ID_TNT,ID_RUN,DT_CREATED,JSON_REVIEW) values (?,?,?,?,?)",
                review.id(),c.tenantId(),review.runId(),review.time().atOffset(ZoneOffset.UTC),json.write(review));
    }
}
