package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.*;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.Objects;
import static com.rhn.shared.api.BusinessErrors.*;
import static com.rhn.quality.medication.infrastructure.MedicationKnowledgeFeedbackStore.hash;

@Repository
public class MedicationRuleIntakeStore {
    private final JdbcTemplate jdbc;private final JsonCodec json;
    public MedicationRuleIntakeStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    public void append(Long tenant,Run run) {jdbc.update("insert into RHN_AUD_KNOW_INTAKE (ID_TNT,ID_INTAKE,JSON_RUN) values (?,?,?)",tenant,run.id(),json.write(run));}
    private static final String SCOPE="(ID_ORG is null or (ID_ORG=? and ID_DEPT=?))";
    public Optional<Run> find(Long tenant,Long id,Long org,Long dept) {
        var rows=jdbc.query("select JSON_RUN from RHN_AUD_KNOW_INTAKE where ID_TNT=? and ID_INTAKE=? and "+SCOPE,(r,n)->json.read(r.getString(1),Run.class),tenant,id,org,dept);
        if(!rows.isEmpty()) origin(tenant,id);
        return rows.stream().findFirst();
    }
    public FeedbackOrigin origin(Long tenant,Long id) {
        return jdbc.query("select ID_ORG,ID_DEPT,ID_FDBK,ID_PHARM_REVIEW,JSON_ORIGIN,HASH_ORIGIN from RHN_AUD_KNOW_INTAKE where ID_TNT=? and ID_INTAKE=?",(r,n)->{
            String raw=r.getString("JSON_ORIGIN");
            if(raw==null) {
                if(r.getObject("ID_ORG")!=null||r.getObject("ID_DEPT")!=null||r.getObject("ID_FDBK")!=null||r.getObject("ID_PHARM_REVIEW")!=null||r.getString("HASH_ORIGIN")!=null)throw conflict("QMED_INTAKE_ORIGIN_INTEGRITY","改进需求来源缺失，请核查记录");
                return null;
            }
            if(!Objects.equals(hash(raw),r.getString("HASH_ORIGIN")))throw conflict("QMED_INTAKE_ORIGIN_INTEGRITY","改进需求来源指纹不一致");
            var o=json.read(raw,FeedbackOrigin.class);
            if((o.feedback()==null)==(o.pharmacy()==null))throw conflict("QMED_INTAKE_ORIGIN_INTEGRITY","改进需求来源类型不一致");
            if(!Objects.equals(o.organizationId(),r.getObject("ID_ORG",Long.class))||!Objects.equals(o.departmentId(),r.getObject("ID_DEPT",Long.class))||!Objects.equals(o.feedback()==null?null:o.feedbackId(),r.getObject("ID_FDBK",Long.class))||!Objects.equals(o.pharmacy()==null?null:o.feedbackId(),r.getObject("ID_PHARM_REVIEW",Long.class)))throw conflict("QMED_INTAKE_ORIGIN_INTEGRITY","改进需求来源索引不一致");
            return o;
        },tenant,id).stream().filter(Objects::nonNull).findFirst().orElse(null);
    }
    public void appendImprovement(Long tenant,Run run,FeedbackOrigin origin) {
        String raw=json.write(origin);
        jdbc.update("insert into RHN_AUD_KNOW_INTAKE (ID_TNT,ID_INTAKE,JSON_RUN,ID_ORG,ID_DEPT,ID_FDBK,ID_PHARM_REVIEW,JSON_ORIGIN,HASH_ORIGIN) values (?,?,?,?,?,?,?,?,?)",tenant,run.id(),json.write(run),origin.organizationId(),origin.departmentId(),origin.feedback()==null?null:origin.feedbackId(),origin.pharmacy()==null?null:origin.feedbackId(),raw,hash(raw));
    }
    public PageResult<Summary> pharmacyPage(Long tenant,Long org,Long dept,Long review,int page) {
        String where="ID_TNT=? and ID_ORG=? and ID_DEPT=? and ID_PHARM_REVIEW=?";
        long total=jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_INTAKE where "+where,Long.class,tenant,org,dept,review);
        var rows=jdbc.query("select JSON_RUN from RHN_AUD_KNOW_INTAKE where "+where+" order by ID_INTAKE desc offset ? rows fetch next 20 rows only",(r,n)->{var v=json.read(r.getString(1),Run.class);return new Summary(v.id(),v.parentId(),v.input().requirement(),v.result().status(),v.actor(),v.createdAt());},tenant,org,dept,review,(long)page*20);
        return new PageResult<>(rows,total,(int)((total+19)/20),page,20);
    }
    public PageResult<Summary> feedbackPage(Long tenant,Long org,Long dept,Long run,int page) {
        String where="ID_TNT=? and ID_ORG=? and ID_DEPT=? and ID_FDBK in (select ID_FDBK from RHN_AUD_KNOW_FEEDBACK where ID_TNT=? and ID_RULE_RUN=?)";
        long total=jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_INTAKE where "+where,Long.class,tenant,org,dept,tenant,run);
        var rows=jdbc.query("select JSON_RUN from RHN_AUD_KNOW_INTAKE where "+where+" order by ID_INTAKE desc offset ? rows fetch next 20 rows only",(r,n)->{var value=json.read(r.getString(1),Run.class);return new Summary(value.id(),value.parentId(),value.input().requirement(),value.result().status(),value.actor(),value.createdAt());},tenant,org,dept,tenant,run,(long)page*20);
        return new PageResult<>(rows,total,(int)((total+19)/20),page,20);
    }
    public PageResult<Summary> page(Long tenant,Long org,Long dept,int page) {
        long total=jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_INTAKE where ID_TNT=? and "+SCOPE,Long.class,tenant,org,dept);
        var rows=jdbc.query("select JSON_RUN from RHN_AUD_KNOW_INTAKE where ID_TNT=? and "+SCOPE+" order by ID_INTAKE desc offset ? rows fetch next 20 rows only",(r,n)->{var run=json.read(r.getString(1),Run.class);return new Summary(run.id(),run.parentId(),run.input().requirement(),run.result().status(),run.actor(),run.createdAt());},tenant,org,dept,(long)page*20);
        return new PageResult<>(rows,total,(int)((total+19)/20),page,20);
    }
}
