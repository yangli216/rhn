package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.quality.medication.domain.*;
import com.rhn.quality.medication.infrastructure.MedicationRuleGovernanceStore;
import com.rhn.outpatient.api.*;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.math.BigDecimal;
import java.util.*;
import static com.rhn.outpatient.api.MedicationSafetyDecision.*;

/** Runtime only consumes frozen, explicitly deployed versions. It never invokes AI or current drug master data. */
@Service
public class MedicationRuleRuntime {
    private final MedicationRuleGovernanceStore store; private final JsonCodec json; private final com.rhn.quality.medication.infrastructure.MedicationKnowledgePublicationStore publications;
    private final MedicationSafetyEngine engine; private final MedicationCandidateEvaluator templates=new MedicationCandidateEvaluator();
    public MedicationRuleRuntime(MedicationRuleGovernanceStore store,JsonCodec json,com.rhn.quality.medication.infrastructure.MedicationKnowledgePublicationStore publications) {this.store=store;this.json=json;this.publications=publications;this.engine=MedicationSafetyEngine.standard(json);}
    public record Selected(String key,Deployment deployment) {}
    public record Plan(List<RuleVersion> baseline,List<Selected> shadow,List<Selected> enforced) {}
    public Plan plan(PrescriptionSafetySnapshot input,List<RuleVersion> baseline,Instant now) {
        var shadow=new ArrayList<Selected>();var enforced=new ArrayList<Selected>();var suppressed=new HashSet<String>();
        for(var rule:store.all(input.tenantId())) {
            if(rule.key().startsWith("BUILTIN:") && rule.state().reviews().stream().anyMatch(r->"RETIRED".equals(r.status())
                    && baseline.stream().anyMatch(v->v.id().toString().equals(r.versionId())))) suppressed.add(rule.key().substring(8));
            var scoped=rule.state().deployments().stream().filter(d->Objects.equals(d.organizationId(),input.organizationId())
                    && (d.departmentId()==null || Objects.equals(d.departmentId(),input.departmentId()))).toList();
            if(rule.key().startsWith("BUILTIN:") && scoped.stream().anyMatch(d->!d.effectiveFrom().isAfter(now))) suppressed.add(rule.key().substring(8));
            for(String mode:List.of("SHADOW","ENFORCED")) {
                var selected=scoped.stream().filter(d->mode.equals(d.mode()) && !"SUPERSEDED".equals(d.status()) && !d.effectiveFrom().isAfter(now)
                        && (d.effectiveTo()==null||d.effectiveTo().isAfter(now)))
                        .max(Comparator.<Deployment>comparingInt(d->d.departmentId()==null?0:1).thenComparing(Deployment::createdAt));
                if(selected.isPresent() && "ACTIVE".equals(selected.get().status()))
                    ("SHADOW".equals(mode)?shadow:enforced).add(new Selected(rule.key(),selected.get()));
            }
        }
        return new Plan(baseline.stream().filter(v->!suppressed.contains(v.definition().code())).toList(),shadow,enforced);
    }
    public MedicationSafetyEngine.Result evaluate(PrescriptionSafetySnapshot snapshot,List<Selected> selected,Instant now) {
        var findings=new ArrayList<MedicationSafetyFinding>();var executions=new ArrayList<RuleExecution>();var failures=new ArrayList<String>();
        for(var chosen:selected) {
            var d=chosen.deployment();MedicationSafetyEngine.Result result;MedicationKnowledgeRuntime.Evaluation knowledgeEvaluation=null;com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Result knowledgeResult=null;
            try {
                if(d.knowledgeRelease()!=null) {knowledgeEvaluation=MedicationKnowledgeRuntime.evaluate(d,snapshot,json,"ENFORCED".equals(d.mode())?publications.require(snapshot.tenantId(),d.knowledgeRelease().authorizationId()):null);knowledgeResult=knowledgeEvaluation.result();result=knowledge(d,knowledgeResult,knowledgeEvaluation.input()!=null);}
                else result=d.candidate()==null?engine.evaluateSelected(snapshot,List.of(d.executable()),now):candidate(snapshot,d);
            }
            catch(RuntimeException e) {if(d.knowledgeRelease()!=null) knowledgeResult=new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Result("UNAVAILABLE",List.of("知识规则执行失败，请核查运行版本及冻结事实"),List.of());result=new MedicationSafetyEngine.Result(List.of(),List.of(new RuleExecution(chosen.key(),d.version(),"UNAVAILABLE","RULE_EXECUTION_FAILED")),List.of("RULE_EXECUTION_FAILED"));}
            findings.addAll(result.findings());executions.addAll(result.executions());failures.addAll(result.failureCodes());
            String decision=result.executions().stream().allMatch(r->"NOT_APPLICABLE".equals(r.outcome()))?"NOT_APPLICABLE":result.decision().name();
            try {
                var details = new LinkedHashMap<String,Object>();
                details.put("deployment", d);
                if(d.knowledgeRelease()==null) details.put("input", snapshot);
                else {details.put("inputHash",MedicationKnowledgeReplayService.hash(json.write(snapshot)));details.put("knowledgeResult",knowledgeResult);details.put("knowledgeInput",knowledgeEvaluation==null?null:knowledgeEvaluation.input());}
                details.put("executions", result.executions());
                details.put("findings", result.findings().stream().map(MedicationSafetyFinding::snapshot).toList()); details.put("failures", result.failureCodes());
                store.appendRun(snapshot.tenantId(),new RuntimeRecord(GlobalIds.next(),chosen.key(),d.versionId(),d.id(),snapshot.prescriptionId(),d.mode(),decision,now,json.write(details),snapshot.organizationId(),snapshot.departmentId(),knowledgeResult));
            }
            catch(RuntimeException e) {failures.add("RULE_RUN_NOT_PERSISTED");}
        }
        return new MedicationSafetyEngine.Result(findings,executions,failures);
    }
    private MedicationSafetyEngine.Result knowledge(Deployment d,com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Result result,boolean validFacts) {
        var rule=d.executable();boolean unavailable="UNAVAILABLE".equals(result.outcome());
        if(unavailable&&"ENFORCED".equals(d.mode())&&validFacts) {
            var action=Status.valueOf(d.knowledgeRelease().approval().unavailableAction());
            var policy=new RuleVersion(rule.id(),rule.definition(),rule.version(),rule.ruleSetVersion(),rule.implementationKey(),rule.status(),rule.severity(),action,
                action==Status.BLOCK?OverridePolicy.NOT_ALLOWED:action==Status.REQUIRE_OVERRIDE?OverridePolicy.REASON_REQUIRED:OverridePolicy.ACKNOWLEDGE,rule.effectiveFrom(),rule.effectiveTo(),rule.evidence());
            return new MedicationSafetyEngine.Result(List.of(new MedicationSafetyFinding(GlobalIds.next(),policy,"本条规则无法评价："+String.join("；",result.reasons()),List.of(),"请核对缺失事实；按该版本已审核的不可评价策略处理。")),
                List.of(new RuleExecution(rule.definition().code(),rule.version(),"UNAVAILABLE","KNOWLEDGE_FACTS_UNAVAILABLE")),List.of());
        }
        var findings="MATCH".equals(result.outcome())?List.of(new MedicationSafetyFinding(GlobalIds.next(),rule,
                d.knowledgeRelease().approval().basis().candidate().knowledge().body().clinicalMeaning()+"；"+String.join("；",result.reasons()),result.matchedOrderIds().stream().map(Long::valueOf).toList(),"SHADOW".equals(d.mode())?"旁路观察：请核对审核依据及适用条件，本记录不改变处方提交结果。":"请核对审核依据及适用条件，按已批准的正式策略处理。")):List.<MedicationSafetyFinding>of();
        return new MedicationSafetyEngine.Result(findings,List.of(new RuleExecution(rule.definition().code(),rule.version(),unavailable?"UNAVAILABLE":"NOT_APPLICABLE".equals(result.outcome())?"NOT_APPLICABLE":"COMPLETED",unavailable?"KNOWLEDGE_FACTS_UNAVAILABLE":null)),unavailable?List.of("KNOWLEDGE_FACTS_UNAVAILABLE"):List.of());
    }
    private MedicationSafetyEngine.Result candidate(PrescriptionSafetySnapshot snapshot,Deployment release) {
        var c=release.candidate();var rule=release.executable();
        var selected=new HashSet<String>();var identitiesByLocalId=new HashMap<Long,String>();
        for(var med:c.medications()) {
            var ref=med.standardReference();
            String key=String.join("|",ref.catalogId(),ref.catalogVersion(),ref.contentHash(),ref.specificationId());
            selected.add(key);identitiesByLocalId.put(med.medication().id(),key);
        }
        var rows=new ArrayList<PrescriptionSafetySnapshot.MedicationItem>();var trial=new ArrayList<TrialItem>();
        var facts=new HashMap<Long,MedicationSnapshot>();var identities=new HashMap<Long,String>();var missing=new ArrayList<String>();
        if(!List.of("DRAFT","ACTIVE").contains(snapshot.prescriptionStatus())) missing.add("PRESCRIPTION_STATUS_UNSUPPORTED");
        for(var row:snapshot.medications()) {
            if("CANCELLED".equals(row.status())) continue;
            if(!row.activeForEvaluation()) {missing.add("MEDICATION_STATUS_UNSUPPORTED");continue;}
            try {
                var ref=json.readTree(row.medicationSnapshot()).path("clinicalSemantics").path("standardReference");
                if(!"LINKED".equals(ref.path("status").asString())) {missing.add("STANDARD_REFERENCE_MISSING");continue;}
                String identity=String.join("|",ref.path("catalogId").asString(),ref.path("catalogVersion").asString(),ref.path("contentHash").asString(),ref.path("specificationId").asString());
                if(!selected.contains(identity)) {
                    if(identitiesByLocalId.containsKey(row.medicationId())) missing.add("STANDARD_REFERENCE_VERSION_MISMATCH");
                    continue;
                }
                var med=json.read(row.medicationSnapshot(),MedicationSnapshot.class);
                if(med==null || !Objects.equals(med.id(),row.medicationId())) {missing.add("MEDICATION_SNAPSHOT_INVALID");continue;}
                // Use row identity so two historical facts for the same local drug never overwrite one another.
                rows.add(row);facts.put(row.medicationRequestId(),med);identities.put(row.medicationRequestId(),identity);
                trial.add(new TrialItem(row.medicationRequestId(),row.status(),"DAY".equals(row.durationUnit())?row.durationValue():null,row.routeCode()));
            } catch(RuntimeException e) {missing.add("MEDICATION_SNAPSHOT_INVALID");}
        }
        if(!missing.isEmpty()) return new MedicationSafetyEngine.Result(List.of(),List.of(new RuleExecution(rule.definition().code(),rule.version(),"UNAVAILABLE",missing.getFirst())),missing.stream().distinct().toList());
        if(trial.isEmpty()) return new MedicationSafetyEngine.Result(List.of(),List.of(new RuleExecution(rule.definition().code(),rule.version(),"NOT_APPLICABLE",null)),List.of());
        var patient=snapshot.patientContext();var context=patient==null?null:new PatientSimulationContext(patient.patientAgeYears(),patient.gender(),List.of());
        var result=templates.evaluate(c.rule(),List.of(),trial,facts,context,identities);
        if("UNAVAILABLE".equals(result.decision())) return new MedicationSafetyEngine.Result(List.of(),List.of(new RuleExecution(rule.definition().code(),rule.version(),"UNAVAILABLE","REQUIRED_INPUT_MISSING")),List.of("REQUIRED_INPUT_MISSING"));
        var findings=result.matchedRows().isEmpty()?List.<MedicationSafetyFinding>of():List.of(new MedicationSafetyFinding(GlobalIds.next(),rule,
                c.rule().message()+"；"+String.join("；",result.reasons()),result.matchedRows().stream().map(i->rows.get(i-1).medicationRequestId()).toList(),"请核对规则证据及处方；按已审核的执行动作处理。"));
        return new MedicationSafetyEngine.Result(findings,List.of(new RuleExecution(rule.definition().code(),rule.version(),"COMPLETED",null)),List.of());
    }
}
