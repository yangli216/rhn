package com.rhn.quality.medication.infrastructure;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.quality.medication.domain.MedicationSafetyEvaluation;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.EvaluationSummary;

/** Append-only evaluation storage. All business reads include tenant and prescription identity. */
@Repository
public class MedicationEvaluationStore {
    private final JdbcTemplate jdbc;
    private final JsonCodec json;

    public MedicationEvaluationStore(JdbcTemplate jdbc, JsonCodec json) {
        this.jdbc = jdbc; this.json = json;
    }

    /** The evaluation survives a subsequent rollback of the caller's prescription transaction. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void append(MedicationSafetyEvaluation value) {
        var input = value.input();
        var result = value.decision();
        jdbc.update("""
                insert into RHN_AUD_MED_EVAL
                    (ID_EVAL, ID_TNT, ID_RX, NO_TARGET_REV, ID_ENC, ID_PAT, ID_ORG, ID_DEPT,
                     CD_INPUT_HASH, CD_RULE_SET_VER, CD_ENGINE_VER, SD_MODE, SD_DCSN,
                     JSON_INPUT, JSON_RESULT, DT_STARTED, DT_CMPLD, ID_USER_ACTOR)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, value.id(), input.tenantId(), input.prescriptionId(), input.prescriptionRevision(),
                input.encounterId(), input.residentId(), input.organizationId(), input.departmentId(),
                value.inputHash(), result.ruleSetVersion(), result.engineVersion(), result.mode(), result.decision().name(),
                json.write(input), json.write(result), value.startedAt().atOffset(ZoneOffset.UTC),
                value.completedAt().atOffset(ZoneOffset.UTC), value.actorId());
        for (var finding : value.findings()) {
            jdbc.update("""
                    insert into RHN_AUD_MED_FINDING
                        (ID_FINDING, ID_TNT, ID_EVAL, ID_RULE_VER, SD_SEV, SD_DCSN,
                         DES_MESSAGE, JSON_REQUEST_IDS, JSON_EVID, SD_OVRD_POLICY, DES_ACTION)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, finding.id(), input.tenantId(), value.id(), finding.rule().id(),
                    finding.rule().severity().name(), finding.rule().decision().name(), finding.message(),
                    json.write(finding.medicationRequestIds()), json.write(finding.rule().evidence()),
                    finding.rule().overridePolicy().name(), finding.suggestedAction());
        }
    }

    public Optional<StoredDecision> find(Long tenantId, Long prescriptionId, Long evaluationId) {
        return jdbc.query("""
                select ID_ORG, ID_DEPT, JSON_RESULT from RHN_AUD_MED_EVAL
                 where ID_TNT = ? and ID_RX = ? and ID_EVAL = ?
                """, (rs, row) -> new StoredDecision(rs.getLong("ID_ORG"), rs.getLong("ID_DEPT"),
                json.read(rs.getString("JSON_RESULT"), MedicationSafetyDecision.class)),
                tenantId, prescriptionId, evaluationId).stream().findFirst();
    }

    public List<EvaluationSummary> findRecent(Long tenantId, int limit) {
        return jdbc.query("""
                select e.ID_EVAL, e.ID_RX, e.ID_ENC, e.ID_PAT, e.ID_ORG, e.ID_DEPT,
                       e.CD_RULE_SET_VER, e.SD_MODE, e.SD_DCSN, e.DT_CMPLD,
                       (select count(1) from RHN_AUD_MED_FINDING f where f.ID_EVAL = e.ID_EVAL) as CNT_FINDINGS
                  from RHN_AUD_MED_EVAL e
                 where e.ID_TNT = ?
                 order by e.DT_CMPLD desc
                 fetch first ? rows only
                """, (rs, row) -> {
            var completedAt = rs.getObject("DT_CMPLD", OffsetDateTime.class);
            return new EvaluationSummary(
                    rs.getLong("ID_EVAL"), rs.getLong("ID_RX"), rs.getLong("ID_ENC"),
                    rs.getLong("ID_PAT"), rs.getLong("ID_ORG"), rs.getLong("ID_DEPT"),
                    rs.getString("CD_RULE_SET_VER"), rs.getString("SD_MODE"), rs.getString("SD_DCSN"),
                    completedAt == null ? null : completedAt.toInstant(),
                    rs.getInt("CNT_FINDINGS"));
        }, tenantId, limit);
    }

    public com.rhn.shared.api.PageResult<EvaluationSummary> page(com.rhn.shared.context.ExecutionContext c,String mode,String decision,
            Long prescriptionId,java.time.Instant from,java.time.Instant to,int page,int size) {
        var where=new StringBuilder(" where e.ID_TNT=? and e.ID_ORG=? and e.ID_DEPT=? and e.DT_CMPLD>=? and e.DT_CMPLD<?");
        var args=new java.util.ArrayList<Object>(java.util.List.of(c.tenantId(),c.organizationId(),c.departmentId(),from.atOffset(ZoneOffset.UTC),to.atOffset(ZoneOffset.UTC)));
        if(mode!=null&&!mode.isBlank()){where.append(" and e.SD_MODE=?");args.add(mode);}
        if(decision!=null&&!decision.isBlank()){where.append(" and e.SD_DCSN=?");args.add(decision);}
        if(prescriptionId!=null){where.append(" and e.ID_RX=?");args.add(prescriptionId);}
        long total=jdbc.queryForObject("select count(*) from RHN_AUD_MED_EVAL e"+where,Long.class,args.toArray());
        args.add(page*size);args.add(size);
        var rows=jdbc.query("""
            select e.ID_EVAL,e.ID_RX,e.ID_ENC,e.ID_PAT,e.ID_ORG,e.ID_DEPT,e.CD_RULE_SET_VER,e.SD_MODE,e.SD_DCSN,e.DT_CMPLD,
            (select count(*) from RHN_AUD_MED_FINDING f where f.ID_EVAL=e.ID_EVAL) CNT_FINDINGS
            from RHN_AUD_MED_EVAL e
            """+where+" order by e.ID_EVAL desc offset ? rows fetch next ? rows only",(r,n)->summary(r),args.toArray());
        return new com.rhn.shared.api.PageResult<>(rows,total,(int)((total+size-1)/size),page,size);
    }
    public Optional<com.rhn.quality.medication.api.MedicationWorkbenchContracts.EvaluationDetail> detail(com.rhn.shared.context.ExecutionContext c,Long id) {
        return jdbc.query("""
            select e.*,(select count(*) from RHN_AUD_MED_FINDING f where f.ID_EVAL=e.ID_EVAL) CNT_FINDINGS
            from RHN_AUD_MED_EVAL e where e.ID_TNT=? and e.ID_ORG=? and e.ID_DEPT=? and e.ID_EVAL=?
            """,(r,n)->new com.rhn.quality.medication.api.MedicationWorkbenchContracts.EvaluationDetail(summary(r),json.readTree(r.getString("JSON_INPUT")),json.readTree(r.getString("JSON_RESULT"))),
                c.tenantId(),c.organizationId(),c.departmentId(),id).stream().findFirst();
    }
    private EvaluationSummary summary(java.sql.ResultSet r) throws java.sql.SQLException {
        var time=r.getObject("DT_CMPLD",OffsetDateTime.class);
        return new EvaluationSummary(r.getLong("ID_EVAL"),r.getLong("ID_RX"),r.getLong("ID_ENC"),r.getLong("ID_PAT"),r.getLong("ID_ORG"),r.getLong("ID_DEPT"),r.getString("CD_RULE_SET_VER"),r.getString("SD_MODE"),r.getString("SD_DCSN"),time==null?null:time.toInstant(),r.getInt("CNT_FINDINGS"));
    }

    public record StoredDecision(Long organizationId, Long departmentId, MedicationSafetyDecision decision) {}
}
