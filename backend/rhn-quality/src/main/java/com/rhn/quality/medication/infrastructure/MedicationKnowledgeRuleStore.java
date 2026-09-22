package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public class MedicationKnowledgeRuleStore {
    private final JdbcTemplate jdbc;private final JsonCodec json;
    public MedicationKnowledgeRuleStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    public void lockKnowledge(Long tenant,Long knowledge) {
        jdbc.queryForObject("select ID_KNOW from RHN_AUD_MED_KNOW_DRAFT where ID_TNT=? and ID_KNOW=? and NO_VERSION=1 for update",Long.class,tenant,knowledge);
    }
    public List<KnowledgeRuleCandidate> all(Long tenant) {return jdbc.query("select JSON_CONTENT from RHN_AUD_KNOW_RULE where ID_TNT=? order by ID_KNOW,NO_VERSION desc",(r,n)->json.read(r.getString(1),KnowledgeRuleCandidate.class),tenant);}
    public java.util.Optional<KnowledgeRuleCandidate> find(Long tenant,Long candidate) {return jdbc.query("select JSON_CONTENT from RHN_AUD_KNOW_RULE where ID_TNT=? and ID_KNOW_RULE=?",(r,n)->json.read(r.getString(1),KnowledgeRuleCandidate.class),tenant,candidate).stream().findFirst();}
    public List<KnowledgeRuleCandidate> versions(Long tenant,Long knowledge) {return jdbc.query("select JSON_CONTENT from RHN_AUD_KNOW_RULE where ID_TNT=? and ID_KNOW=? order by NO_VERSION desc",(r,n)->json.read(r.getString(1),KnowledgeRuleCandidate.class),tenant,knowledge);}
    public void append(Long tenant,KnowledgeRuleCandidate value) {
        jdbc.update("insert into RHN_AUD_KNOW_RULE (ID_TNT,ID_KNOW_RULE,ID_KNOW,NO_VERSION,NO_KNOW_VERSION,CD_CMPLR_VER,JSON_CONTENT) values (?,?,?,?,?,?,?)",
                tenant,value.id(),value.knowledgeId(),value.version(),value.knowledge().version(),value.program().schemaVersion(),json.write(value));
    }
}
