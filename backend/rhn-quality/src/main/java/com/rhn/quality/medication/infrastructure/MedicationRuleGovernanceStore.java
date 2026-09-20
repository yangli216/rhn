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
    private final JdbcTemplate jdbc; private final JsonCodec json;
    public MedicationRuleGovernanceStore(JdbcTemplate jdbc, JsonCodec json) { this.jdbc=jdbc; this.json=json; }
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
    public void install(RuleVersion version) {
        if(jdbc.queryForObject("select count(*) from RHN_AUD_MED_RULE where ID_RULE=?",Integer.class,version.definition().id())==0)
            jdbc.update("insert into RHN_AUD_MED_RULE (ID_RULE,CD_RULE,CD_CATEGORY,NA_RULE) values (?,?,?,?)",
                    version.definition().id(),version.definition().code(),version.definition().category(),version.definition().title());
        jdbc.update("""
            insert into RHN_AUD_MED_RULE_VER (ID_RULE_VER,ID_RULE,NO_VERSION,CD_RULE_SET_VER,CD_IMPLEMENTATION,
              SD_STATUS,SD_SEVERITY,SD_DECISION,SD_OVERRIDE_POLICY,DT_EFFECTIVE_FROM,JSON_EVIDENCE)
            values (?,?,?,?,?,'APPROVED',?,?,?,?,?)
            """,version.id(),version.definition().id(),version.version(),version.ruleSetVersion(),version.implementationKey(),
                version.severity().name(),version.decision().name(),version.overridePolicy().name(),
                version.effectiveFrom().atOffset(ZoneOffset.UTC),json.write(version.evidence()));
    }
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void appendRun(Long tenant, RuntimeRecord record) {
        jdbc.update("""
            insert into RHN_AUD_MED_GOV_RUN (ID_RULE_RUN,ID_TNT,CD_RULE_KEY,CD_VERSION,SD_MODE,SD_DECISION,ID_PRESCRIPTION,DT_CREATED,JSON_RUN)
            values (?,?,?,?,?,?,?,?,?)
            """,record.id(),tenant,record.ruleKey(),record.versionId(),record.mode(),record.decision(),record.prescriptionId(),
                record.time().atOffset(ZoneOffset.UTC),json.write(record));
    }
    public boolean hasShadowRun(Long tenant,String key,String version) {
        return jdbc.queryForObject("""
            select count(*) from RHN_AUD_MED_GOV_RUN where ID_TNT=? and CD_RULE_KEY=? and CD_VERSION=?
            and SD_MODE='SHADOW' and SD_DECISION in ('PASS','WARN','REQUIRE_OVERRIDE','BLOCK')
            """,Integer.class,tenant,key,version)>0;
    }
    public List<RuntimeRecord> runs(Long tenant,String key) {
        return jdbc.query("select JSON_RUN from RHN_AUD_MED_GOV_RUN where ID_TNT=? and CD_RULE_KEY=? order by DT_CREATED desc fetch first 100 rows only",
                (rs,n)->json.read(rs.getString(1),RuntimeRecord.class),tenant,key);
    }
}
