package com.rhn.quality.medication.application;

import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Result;
import com.rhn.quality.medication.api.MedicationKnowledgeReviewContracts.Event;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment;
import com.rhn.shared.json.JsonCodec;
import java.util.List;
import java.util.Objects;
import com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.Authorization;
import static com.rhn.quality.medication.application.MedicationKnowledgeReplayService.hash;

/** Frozen approval and frozen prescription facts only; no live master data or model calls. */
public final class MedicationKnowledgeRuntime {
    private MedicationKnowledgeRuntime() {}
    public static String fingerprint(Event approval,JsonCodec json) {return hash(json.write(approval)+"\n"+MedicationKnowledgeReplayAdapter.VERSION);}
    public record Evaluation(Result result,com.rhn.quality.medication.api.MedicationKnowledgeReplayContracts.Input input) {}
    public static boolean trusted(Deployment d,JsonCodec json) {
        try {
            var release=d.knowledgeRelease();var approval=release.approval();var basis=approval.basis();var c=basis.candidate();
            return !(!List.of("SHADOW","ENFORCED").contains(d.mode())||!"APPROVE".equals(approval.operation())||!approval.standardVerified()||!approval.evidenceVerified()||!approval.testsVerified()
                ||!MedicationKnowledgeReplayAdapter.VERSION.equals(release.factAdapterVersion())||!Objects.equals(release.fingerprint(),fingerprint(approval,json))
                ||!Objects.equals(d.versionId(),c.id().toString())||!Objects.equals(approval.candidateId(),c.id())||d.version()!=c.version()
                ||!MedicationKnowledgeRuleCompiler.VERSION.equals(c.program().schemaVersion())
                ||!Objects.equals(c.knowledgeHash(),hash(json.write(c.knowledge())))||!Objects.equals(c.programHash(),hash(json.write(c.program())))
                ||!Objects.equals(basis.fingerprint(),hash(json.write(c)+"\n"+json.write(basis.validation())+"\n"+json.write(basis.possibleConflicts())))
                ||!Objects.equals(d.action(),approval.action())||!Objects.equals(d.executable().decision().name(),approval.action())||!Objects.equals(d.executable().id(),c.id())) && List.of("WARN","REQUIRE_OVERRIDE","BLOCK").contains(approval.unavailableAction());
        } catch(RuntimeException e) {return false;}
    }
    public static boolean authorized(Deployment d,Long tenant,Authorization authorization,JsonCodec json) {
        try {
            var b=authorization.basis();
            return Objects.equals(authorization.id(),d.knowledgeRelease().authorizationId())&&Objects.equals(authorization.tenantId(),tenant)
                &&Objects.equals(authorization.deploymentId(),d.id())&&Objects.equals(authorization.candidateId().toString(),d.versionId())
                &&Objects.equals(authorization.organizationId(),d.organizationId())&&Objects.equals(authorization.departmentId(),d.departmentId())
                &&Objects.equals(b.approval(),d.knowledgeRelease().approval())&&Objects.equals(b.fingerprint(),MedicationKnowledgePublicationService.fingerprint(b,json))
                &&!b.observations().isEmpty()&&b.observations().stream().allMatch(o->o.feedback()!=null&&"RECORD".equals(o.feedback().operation())&&"SUPPORTED".equals(o.feedback().verdict())&&Objects.equals(o.runHash(),o.feedback().basis().runHash()));
        } catch(RuntimeException e) {return false;}
    }
    public static Evaluation evaluate(Deployment d,PrescriptionSafetySnapshot snapshot,JsonCodec json) {return evaluate(d,snapshot,json,null);}
    public static Evaluation evaluate(Deployment d,PrescriptionSafetySnapshot snapshot,JsonCodec json,Authorization authorization) {
        if(!PrescriptionSafetySnapshot.SCHEMA_VERSION.equals(snapshot.schemaVersion())||!trusted(d,json)||"ENFORCED".equals(d.mode())&&!authorized(d,snapshot.tenantId(),authorization,json))
            return new Evaluation(new Result("UNAVAILABLE",List.of("冻结发布材料、审核指纹或独立启用记录不一致"),List.of()),null);
        var c=d.knowledgeRelease().approval().basis().candidate();
        var input=MedicationKnowledgeReplayAdapter.adapt(c.knowledge(),snapshot,json);
        if(!input.gaps().isEmpty()) return new Evaluation(new Result("UNAVAILABLE",input.gaps(),List.of()),input);
        return new Evaluation(MedicationKnowledgeRuleEngine.evaluate(c.program(),input.facts()),input);
    }
}
