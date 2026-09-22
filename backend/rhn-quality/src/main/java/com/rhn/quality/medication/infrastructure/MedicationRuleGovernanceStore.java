package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.ZoneOffset;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Repository
public class MedicationRuleGovernanceStore {
    private final JdbcTemplate jdbc; private final JsonCodec json; private final MedicationKnowledgeFeedbackStore feedback;
    public MedicationRuleGovernanceStore(JdbcTemplate jdbc, JsonCodec json,MedicationKnowledgeFeedbackStore feedback) { this.jdbc=jdbc; this.json=json; this.feedback=feedback; }
    public record Stored(String key, long revision, Governance state) {}
    public List<Stored> all(Long tenant) {
        return jdbc.query("select CD_RULE_KEY, REVISION, JSON_STATE from RHN_AUD_MED_GOV where ID_TNT=?",
                (rs,n)->new Stored(rs.getString(1),rs.getLong(2),json.read(rs.getString(3),Governance.class)),tenant);
    }
    public Stored read(Long tenant, String key) {
        return all(tenant).stream().filter(v->v.key().equals(key)).findFirst().orElse(new Stored(key,0,Governance.empty()));
    }
    public void save(Long tenant, String key, long revision, Governance state) {
        int count=jdbc.update("update RHN_AUD_MED_GOV set REVISION=REVISION+1, JSON_STATE=? where ID_TNT=? and CD_RULE_KEY=? and REVISION=?",
                json.write(state),tenant,key,revision);
        if(count==0 && revision==0) {
            try { jdbc.update("insert into RHN_AUD_MED_GOV (ID_RULE_GOV,ID_TNT,CD_RULE_KEY,REVISION,JSON_STATE) values (?,?,?,1,?)",
                    GlobalIds.next(),tenant,key,json.write(state)); return; }
            catch(org.springframework.dao.DuplicateKeyException ex) { throw conflict("QMED_CATALOG_STALE","规则已被其他人修改，请刷新后重试"); }
        }
        if(count!=1) throw conflict("QMED_CATALOG_STALE","规则已被其他人修改，请刷新后重试");
    }
    public void installIfAbsent(RuleVersion version) {
        // Knowledge-root row locks serialize multiple scoped deployments of the same immutable version.
        if(jdbc.queryForObject("select count(*) from RHN_AUD_MED_RULE_VER where ID_RULE_VER=?",Integer.class,version.id())==0) install(version);
    }
    public void install(RuleVersion version) {
        if(jdbc.queryForObject("select count(*) from RHN_AUD_MED_RULE where ID_RULE=?",Integer.class,version.definition().id())==0)
            jdbc.update("insert into RHN_AUD_MED_RULE (ID_RULE,CD_RULE,CD_CAT,NA_RULE) values (?,?,?,?)",
                    version.definition().id(),version.definition().code(),version.definition().category(),version.definition().title());
        jdbc.update("""
            insert into RHN_AUD_MED_RULE_VER (ID_RULE_VER,ID_RULE,NO_VERSION,CD_RULE_SET_VER,CD_IMPL,
              SD_STATUS,SD_SEV,SD_DCSN,SD_OVRD_POLICY,DT_EFF_FROM,JSON_EVID)
            values (?,?,?,?,?,'APPROVED',?,?,?,?,?)
            """,version.id(),version.definition().id(),version.version(),version.ruleSetVersion(),version.implementationKey(),
                version.severity().name(),version.decision().name(),version.overridePolicy().name(),
                version.effectiveFrom().atOffset(ZoneOffset.UTC),json.write(version.evidence()));
    }
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void appendRun(Long tenant, RuntimeRecord record) {
        jdbc.update("""
            insert into RHN_AUD_MED_GOV_RUN (ID_RULE_RUN,ID_TNT,CD_RULE_KEY,CD_VERSION,SD_MODE,SD_DCSN,ID_RX,DT_CREATED,JSON_RUN,ID_ORG,ID_DEPT,ID_DEPLOY,SD_OUTCOME)
            values (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,record.id(),tenant,record.ruleKey(),record.versionId(),record.mode(),record.decision(),record.prescriptionId(),
                record.time().atOffset(ZoneOffset.UTC),json.write(record),record.organizationId(),record.departmentId(),record.deploymentId(),record.knowledgeResult()==null?null:record.knowledgeResult().outcome());
    }
    public boolean hasShadowRun(Long tenant,String key,String version) {
        return jdbc.queryForObject("""
            select count(*) from RHN_AUD_MED_GOV_RUN where ID_TNT=? and CD_RULE_KEY=? and CD_VERSION=?
            and SD_MODE='SHADOW' and SD_DCSN in ('PASS','WARN','REQUIRE_OVERRIDE','BLOCK')
            """,Integer.class,tenant,key,version)>0;
    }
    public List<RuntimeRecord> runs(Long tenant,String key) {
        return jdbc.query("select JSON_RUN from RHN_AUD_MED_GOV_RUN where ID_TNT=? and CD_RULE_KEY=? order by DT_CREATED desc fetch first 100 rows only",
                (rs,n)->json.read(rs.getString(1),RuntimeRecord.class),tenant,key);
    }
    public List<RuntimeRecord> scopedRuns(Long tenant,Long org,Long dept,String key) {
        return jdbc.query("select JSON_RUN from RHN_AUD_MED_GOV_RUN where ID_TNT=? and ID_ORG=? and ID_DEPT=? and CD_RULE_KEY=? order by ID_RULE_RUN desc fetch first 100 rows only",(r,n)->json.read(r.getString(1),RuntimeRecord.class),tenant,org,dept,key);
    }
    public List<RuntimeRecord> publicationRuns(Long tenant,Long org,Long dept,String key,Long deployment,Long through,boolean lock) {
        return jdbc.query("select JSON_RUN from RHN_AUD_MED_GOV_RUN where ID_TNT=? and ID_ORG=? and ID_DEPT=? and CD_RULE_KEY=? and ID_DEPLOY=? and SD_MODE='SHADOW'"+(through==null?"":" and ID_RULE_RUN<=?")+" order by ID_RULE_RUN"+(lock?" for update":""),
            (r,n)->json.read(r.getString(1),RuntimeRecord.class),through==null?new Object[]{tenant,org,dept,key,deployment}:new Object[]{tenant,org,dept,key,deployment,through});
    }
    public RuntimeRecord observationRun(Long tenant,Long org,Long dept,String key,Long deployment,Long run,boolean lock) {
        return jdbc.query("select JSON_RUN from RHN_AUD_MED_GOV_RUN where ID_TNT=? and ID_ORG=? and ID_DEPT=? and CD_RULE_KEY=? and ID_DEPLOY=? and ID_RULE_RUN=? and SD_MODE='SHADOW'"+(lock?" for update":""),
            (r,n)->json.read(r.getString(1),RuntimeRecord.class),tenant,org,dept,key,deployment,run).stream().findFirst()
            .orElseThrow(()->notFound("QMED_FEEDBACK_RUN","未找到该候选发布在当前机构科室的旁路观察"));
    }
    public com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Observations observations(Long tenant,Long org,Long dept,String key,Long deployment,int page) {
        String where=" from RHN_AUD_MED_GOV_RUN where ID_TNT=? and ID_ORG=? and ID_DEPT=? and CD_RULE_KEY=? and ID_DEPLOY=? and SD_MODE='SHADOW'";
        var counts=new LinkedHashMap<String,Long>();for(String outcome:List.of("MATCH","NO_MATCH","NOT_APPLICABLE","UNAVAILABLE")) counts.put(outcome,0L);
        jdbc.query("select SD_OUTCOME,count(*)"+where+" group by SD_OUTCOME",rs->{counts.put(Objects.toString(rs.getString(1),"UNAVAILABLE"),rs.getLong(2));},tenant,org,dept,key,deployment);
        long total=counts.values().stream().mapToLong(Long::longValue).sum();
        var rows=jdbc.query("select JSON_RUN"+where+" order by ID_RULE_RUN desc offset ? rows fetch next 20 rows only",(r,n)->{
            var run=json.read(r.getString(1),RuntimeRecord.class);var result=run.knowledgeResult();
            return new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Observation(run.id(),run.deploymentId(),run.prescriptionId(),run.time(),result==null?"UNAVAILABLE":result.outcome(),result==null?List.of("未保存可识别的知识评价结果"):result.reasons(),result==null?List.of():result.matchedOrderIds());
        },tenant,org,dept,key,deployment,(long)page*20);
        var states=feedback.states(tenant,org,dept,deployment,rows.stream().map(r->r.id()).toList());
        var annotated=rows.stream().map(r->new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Observation(r.id(),r.deploymentId(),r.prescriptionId(),r.time(),r.outcome(),r.reasons(),r.matchedOrderIds(),states.get(r.id()))).toList();
        return new com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Observations(org,dept,Map.copyOf(counts),new com.rhn.shared.api.PageResult<>(annotated,total,(int)((total+19)/20),page,20),feedback.summary(tenant,org,dept,deployment,total));
    }

}
