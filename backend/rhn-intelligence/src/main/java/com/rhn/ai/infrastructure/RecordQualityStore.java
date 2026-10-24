package com.rhn.ai.infrastructure;

import com.rhn.ai.api.RecordQualityContracts.*;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Repository
public class RecordQualityStore {
    public record Binding(Long encounterId, String actor, Long practitionerId,
                          Map<String,String> fieldHashes, RecordQualityResult assessment) {}
    public record StoredFeedback(String requestHash, RecordQualityFeedback feedback) {}
    private final JdbcTemplate jdbc;
    private final JsonCodec json;
    public RecordQualityStore(JdbcTemplate jdbc, JsonCodec json) { this.jdbc=jdbc; this.json=json; }

    public void bind(ExecutionContext c, Binding binding) {
        jdbc.update("""
                insert into RHN_AUD_AI_REC_DCSN (ID_RUN,ID_TNT,ID_ORG,ID_DEPT,ID_ENC,ID_USER_ACTOR,JSON_BINDING)
                values (?,?,?,?,?,?,?)
                """,binding.assessment().runId(),c.tenantId(),c.organizationId(),c.departmentId(),binding.encounterId(),
                binding.actor(),json.write(binding));
    }
    public Optional<Binding> find(ExecutionContext c, Long id, boolean lock) {
        return jdbc.query("select JSON_BINDING from RHN_AUD_AI_REC_DCSN where ID_TNT=? and ID_ORG=? and ID_DEPT=? and ID_RUN=?"
                        +(lock?" for update":""), (r,n)->json.read(r.getString(1),Binding.class),
                c.tenantId(),c.organizationId(),c.departmentId(),id).stream().findFirst();
    }
    public Optional<Binding> latest(ExecutionContext c, Long encounterId) {
        return jdbc.query("""
                select JSON_BINDING from RHN_AUD_AI_REC_DCSN
                where ID_TNT=? and ID_ORG=? and ID_DEPT=? and ID_ENC=? and ID_USER_ACTOR=?
                order by ID_RUN desc fetch first 1 rows only
                """,(r,n)->json.read(r.getString(1),Binding.class),c.tenantId(),c.organizationId(),c.departmentId(),encounterId,c.actor())
                .stream().findFirst();
    }
    public Optional<Binding> pending(ExecutionContext c,Long encounterId) {
        return jdbc.query("""
                select b.JSON_BINDING from RHN_AUD_AI_REC_DCSN b
                where b.ID_TNT=? and b.ID_ORG=? and b.ID_DEPT=? and b.ID_ENC=? and b.ID_USER_ACTOR=?
                  and exists (select 1 from RHN_AUD_AI_REC_FB f where f.ID_RUN=b.ID_RUN and f.ID_TNT=b.ID_TNT and f.SD_ACTION='ADOPTED'
                    and not exists (select 1 from RHN_AUD_AI_REC_FB n where n.ID_RUN=f.ID_RUN and n.ID_TNT=f.ID_TNT
                                    and n.CD_FINDING=f.CD_FINDING and n.ID_FB>f.ID_FB))
                order by b.ID_RUN desc fetch first 1 rows only
                """,(r,n)->json.read(r.getString(1),Binding.class),c.tenantId(),c.organizationId(),c.departmentId(),encounterId,c.actor())
                .stream().findFirst();
    }
    public List<RecordQualityFeedback> feedback(ExecutionContext c, Long runId) {
        return jdbc.query("""
                select f.JSON_FB from RHN_AUD_AI_REC_FB f join RHN_AUD_AI_REC_DCSN b on b.ID_RUN=f.ID_RUN and b.ID_TNT=f.ID_TNT
                where b.ID_TNT=? and b.ID_ORG=? and b.ID_DEPT=? and b.ID_RUN=? order by f.ID_FB
                """,(r,n)->json.read(r.getString(1),RecordQualityFeedback.class),c.tenantId(),c.organizationId(),c.departmentId(),runId);
    }
    public List<StoredFeedback> replay(ExecutionContext c,Long runId,String command) {
        return jdbc.query("select CD_REQUEST_HASH,JSON_FB from RHN_AUD_AI_REC_FB where ID_TNT=? and ID_RUN=? and CD_COMMAND=? order by ID_FB",
                (r,n)->new StoredFeedback(r.getString(1),json.read(r.getString(2),RecordQualityFeedback.class)),c.tenantId(),runId,command);
    }
    public void append(ExecutionContext c,String command,String hash,RecordQualityFeedback f) {
        jdbc.update("""
                insert into RHN_AUD_AI_REC_FB (ID_FB,ID_TNT,ID_RUN,CD_FINDING,CD_COMMAND,CD_REQUEST_HASH,SD_ACTION,JSON_FB)
                values (?,?,?,?,?,?,?,?)
                """,f.id(),c.tenantId(),f.runId(),f.findingCode(),command,hash,f.action(),json.write(f));
    }

    /** Latest state per finding, restricted to the exact same filtered run population as observation statistics. */
    public DecisionFeedbackStatistics statistics(ExecutionContext c, DecisionObservationStore.Filter f) {
        var where=new StringBuilder(" where r.ID_TNT=? and r.ID_ORG=? and r.ID_DEPT=?");
        var args=new ArrayList<Object>(List.of(c.tenantId(),c.organizationId(),c.departmentId()));
        if(f.scene()!=null){where.append(" and r.SD_SCENE=?");args.add(f.scene());}
        if(f.mode()!=null){where.append(" and r.SD_MODE=?");args.add(f.mode());}
        if(f.outcome()!=null){where.append(" and r.SD_OUTCOME=?");args.add(f.outcome());}
        if(f.from()!=null){where.append(" and r.DT_CREATED>=?");args.add(f.from().atOffset(java.time.ZoneOffset.UTC));}
        if(f.to()!=null){where.append(" and r.DT_CREATED<?");args.add(f.to().atOffset(java.time.ZoneOffset.UTC));}
        return jdbc.queryForObject("""
                select sum(case when SD_ACTION in ('ADOPTED','MODIFIED','UNCHANGED') then 1 else 0 end),
                       sum(case when SD_ACTION='DISMISSED' then 1 else 0 end),
                       sum(case when SD_ACTION='MODIFIED' then 1 else 0 end),
                       sum(case when SD_ACTION='UNCHANGED' then 1 else 0 end)
                from (select f.SD_ACTION,row_number() over (partition by f.ID_RUN,f.CD_FINDING order by f.ID_FB desc) as RN
                      from RHN_AUD_AI_REC_FB f join RHN_AUD_AI_DCSN_RUN r on r.ID_RUN=f.ID_RUN and r.ID_TNT=f.ID_TNT
                """+where+") ranked where RN=1", (r,n)->new DecisionFeedbackStatistics(r.getInt(1),r.getInt(2),r.getInt(3),r.getInt(4)),args.toArray());
    }
}
