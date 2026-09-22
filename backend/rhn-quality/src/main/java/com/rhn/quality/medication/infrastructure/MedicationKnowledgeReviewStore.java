package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationKnowledgeReviewContracts.*;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public class MedicationKnowledgeReviewStore {
    private final JdbcTemplate jdbc;private final JsonCodec json;
    public MedicationKnowledgeReviewStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    public Optional<Event> get(Long tenant,Long candidate,Long id) {return jdbc.query("select JSON_REVIEW from RHN_AUD_KNOW_REVIEW where ID_TNT=? and ID_KNOW_RULE=? and ID_KNOW_REVIEW=?",(r,n)->json.read(r.getString(1),Event.class),tenant,candidate,id).stream().findFirst();}
    public void append(Long tenant,Event event) {jdbc.update("insert into RHN_AUD_KNOW_REVIEW (ID_TNT,ID_KNOW_REVIEW,ID_KNOW_RULE,JSON_REVIEW) values (?,?,?,?)",tenant,event.id(),event.candidateId(),json.write(event));}
    public PageResult<Summary> history(Long tenant,Long candidate,int page) {
        long total=jdbc.queryForObject("select count(*) from RHN_AUD_KNOW_REVIEW where ID_TNT=? and ID_KNOW_RULE=?",Long.class,tenant,candidate);
        var rows=jdbc.query("select JSON_REVIEW from RHN_AUD_KNOW_REVIEW where ID_TNT=? and ID_KNOW_RULE=? order by ID_KNOW_REVIEW desc offset ? rows fetch next 20 rows only",(r,n)-> {
            var e=json.read(r.getString(1),Event.class);return new Summary(e.id(),e.operation(),e.submissionId(),e.actor(),e.time(),e.reason());
        },tenant,candidate,(long)page*20);
        return new PageResult<>(rows,total,(int)((total+19)/20),page,20);
    }
}
