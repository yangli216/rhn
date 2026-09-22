package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Release;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;
import static com.rhn.quality.medication.infrastructure.MedicationKnowledgeFeedbackStore.hash;

/** Explicit clinical activation with a fixed observation cohort. No score or model can activate a rule. */
@Service
public class MedicationKnowledgePublicationService {
    private final MedicationKnowledgeDeploymentService deployments;private final MedicationRuleGovernanceStore governance;
    private final MedicationKnowledgePublicationStore publications;private final MedicationKnowledgeFeedbackStore feedback;
    private final MedicationKnowledgeRuleStore candidates;private final MedicationKnowledgeTestStore tests;
    private final MedicationKnowledgeDraftValidator validator;private final ExecutionContextProvider contexts;private final JsonCodec json;
    public MedicationKnowledgePublicationService(MedicationKnowledgeDeploymentService deployments,MedicationRuleGovernanceStore governance,
            MedicationKnowledgePublicationStore publications,MedicationKnowledgeFeedbackStore feedback,MedicationKnowledgeRuleStore candidates,
            MedicationKnowledgeTestStore tests,MedicationKnowledgeDraftValidator validator,ExecutionContextProvider contexts,JsonCodec json) {
        this.deployments=deployments;this.governance=governance;this.publications=publications;this.feedback=feedback;this.candidates=candidates;this.tests=tests;this.validator=validator;this.contexts=contexts;this.json=json;
    }
    public static String fingerprint(Basis b,JsonCodec json) {
        return hash(json.write(new Basis(b.operation(),b.sourceDeploymentId(),b.shadowDeploymentId(),b.throughRunId(),b.approval(),b.observations(),new TreeMap<>(b.outcomes()),null)));
    }
    @Transactional(readOnly=true) public Preview preview(Long candidate,Long source,String operation) {return inspect(candidate,source,operation,null,false);}
    private Preview inspect(Long candidateId,Long sourceId,String operation,Long cutoff,boolean lock) {
        if(!Set.of("PROMOTE","ROLLBACK").contains(Objects.toString(operation,"")))throw badRequest("QMED_PUBLICATION_OPERATION","请选择正式启用或回退");
        var source=deployments.managedDeployment(candidateId,sourceId);var actor=contexts.requireCurrent();
        boolean rollback="ROLLBACK".equals(operation);
        if(!(rollback?"ENFORCED":"SHADOW").equals(source.mode())||source.knowledgeRelease()==null)throw badRequest("QMED_PUBLICATION_SOURCE","启用须选择该候选的旁路发布；回退须选择曾正式发布的版本");
        if(!MedicationKnowledgeRuntime.trusted(source,json))throw conflict("QMED_PUBLICATION_SOURCE","冻结发布材料不完整或指纹不一致");
        var approval=source.knowledgeRelease().approval();var candidate=approval.basis().candidate();String key="KNOWLEDGE:"+candidate.knowledgeId();
        var state=governance.read(actor.tenantId(),key);var gaps=new ArrayList<String>();var notices=new ArrayList<String>();Long shadow=sourceId;
        if(rollback) {
            var prior=publications.require(actor.tenantId(),source.knowledgeRelease().authorizationId());
            if(!MedicationKnowledgeRuntime.authorized(source,actor.tenantId(),prior,json))throw conflict("QMED_PUBLICATION_SOURCE","原正式发布缺少有效的独立启用材料");
            shadow=prior.basis().shadowDeploymentId();if(cutoff==null)cutoff=prior.basis().throughRunId();
            if("ACTIVE".equals(source.status())&&(source.effectiveTo()==null||source.effectiveTo().isAfter(Instant.now())))gaps.add("该发布仍在正式运行，无需回退；可先按需要暂停");
            notices.add("回退恢复指定旧版的冻结知识和策略，不回退当前知识草稿；将生成新发布记录并替换当前科室正式版本");
            var assessment=validator.assess(actor.tenantId(),candidate.knowledge().body());
            if(!assessment.structureComplete()||!MedicationKnowledgeRuleCompiler.VERSION.equals(candidate.program().schemaVersion())
                    ||!hash(json.write(MedicationKnowledgeRuleCompiler.compile(candidate.knowledge().body(),assessment))).equals(candidate.programHash()))gaps.add("旧版的标准、来源有效期或表达能力已变化，不能直接回退");
            var review=state.state().reviews().stream().filter(r->candidateId.toString().equals(r.versionId())).findFirst().orElse(null);
            if(review==null||!"APPROVED".equals(review.status())||!Objects.equals(review.knowledgeReviewId(),approval.id()))gaps.add("旧版的审核已变化或已废止，不能沿用原批准");
            var validation=tests.status(actor.tenantId(),candidateId);var approved=approval.basis().validation();
            if(approved==null||!Objects.equals(validation.runId(),approved.id())||validation.suiteVersion()!=approved.suite().version())gaps.add("旧版人工验证已有变化，须重新核对与审核");
        } else {
            var p=deployments.preview(candidateId);gaps.addAll(p.gaps());
            if(p.approval()==null||!Objects.equals(p.approval().id(),approval.id()))gaps.add("所选旁路与当前批准材料不一致");
            if("SUPERSEDED".equals(source.status()))gaps.add("该旁路已被替换，请选择当前候选最近的有效或已暂停旁路");
        }
        var shadowRelease=deployments.observationDeployment(candidateId,shadow);
        if(!Objects.equals(shadowRelease.knowledgeRelease().approval().id(),approval.id()))gaps.add("观察来源与本次批准版本不一致");
        var runs=governance.publicationRuns(actor.tenantId(),actor.organizationId(),actor.departmentId(),key,shadow,cutoff,lock);
        Long through=runs.isEmpty()?0L:runs.getLast().id();var observations=new ArrayList<Observation>();var outcomes=new TreeMap<String,Long>();
        List.of("MATCH","NO_MATCH","NOT_APPLICABLE","UNAVAILABLE").forEach(v->outcomes.put(v,0L));
        for(var run:runs) {
            if(!candidateId.toString().equals(run.versionId())||!Objects.equals(run.deploymentId(),shadow)||!Objects.equals(run.organizationId(),actor.organizationId())||!Objects.equals(run.departmentId(),actor.departmentId()))throw conflict("QMED_PUBLICATION_OBSERVATION","观察索引与内容不一致");
            String outcome=run.knowledgeResult()==null?"UNAVAILABLE":run.knowledgeResult().outcome();outcomes.merge(outcome,1L,Long::sum);
            var opinion=feedback.latest(actor.tenantId(),run.id());String runHash=hash(json.write(run));
            if(opinion==null||!"RECORD".equals(opinion.operation())||!"SUPPORTED".equals(opinion.verdict())||!Objects.equals(opinion.basis().runHash(),runHash))
                gaps.add("观察 "+run.id()+" 尚未形成与固定事实一致的最新研判，须先处理疑点或补充核对");
            observations.add(new Observation(run.id(),runHash,outcome,run.time(),opinion));
        }
        if(runs.isEmpty())gaps.add("所选旁路尚无观察记录");
        if(outcomes.get("MATCH")+outcomes.get("NO_MATCH")==0)gaps.add("至少需要一条可评价的旁路观察；不适用或不可评价不能替代");
        notices.add("本批材料包含截至观察编号 "+through+" 的全部记录；后续新增观察不纳入本批，既有研判的更正或撤回会使核对指纹失效");
        notices.add("首版要求本批每条观察有最新的一致性研判；这不是临床效果阈值，也不能替代机构对样本充分性及风险的判断");
        var raw=new Basis(operation,sourceId,shadow,through,approval,List.copyOf(observations),outcomes,null);
        var basis=new Basis(operation,sourceId,shadow,through,approval,raw.observations(),outcomes,fingerprint(raw,json));
        return new Preview(state.revision(),candidateId,actor.organizationId(),actor.departmentId(),basis,List.copyOf(gaps),List.copyOf(notices),state.state().deployments().stream().filter(d->"ENFORCED".equals(d.mode())&&Objects.equals(d.organizationId(),actor.organizationId())&&Objects.equals(d.departmentId(),actor.departmentId())).toList());
    }
    @Transactional public Deployment command(Long candidateId,Command command) {
        if(command==null||command.sourceDeploymentId()==null||command.throughRunId()==null||blank(command.reason(),2000)||blank(command.assessment(),4000)||blank(command.rollbackPlan(),4000)
                ||!command.observationsConfirmed()||!command.actionsConfirmed()||!command.rollbackConfirmed())throw badRequest("QMED_PUBLICATION_CONFIRM","须填写旁路验收结论、回退方案及原因，并确认观察、双处置策略与回退安排");
        var source=deployments.managedDeployment(candidateId,command.sourceDeploymentId());var actor=contexts.requireCurrent();
        if(source.knowledgeRelease()==null)throw badRequest("QMED_PUBLICATION_SOURCE","发布没有固定知识材料");
        var candidate=source.knowledgeRelease().approval().basis().candidate();candidates.lockKnowledge(actor.tenantId(),candidate.knowledgeId());tests.lock(actor.tenantId(),candidateId);
        var p=inspect(candidateId,source.id(),command.operation(),command.throughRunId(),true);
        if(p.revision()!=command.expectedRevision()||!Objects.equals(p.basis().fingerprint(),command.expectedFingerprint())||!Objects.equals(p.basis().throughRunId(),command.throughRunId()))throw conflict("QMED_PUBLICATION_STALE","发布或所选旁路研判已变化，请刷新核对");
        if(!p.gaps().isEmpty())throw conflict("QMED_PUBLICATION_GAPS",String.join("；",p.gaps()));
        var now=Instant.now();if(command.effectiveTo()!=null&&!command.effectiveTo().isAfter(now))throw badRequest("QMED_PUBLICATION_PERIOD","结束时间须晚于当前时间");
        String key="KNOWLEDGE:"+candidate.knowledgeId();var state=governance.read(actor.tenantId(),key);var releases=new ArrayList<>(state.state().deployments());
        Long deploymentId=GlobalIds.next(),authorizationId=GlobalIds.next();
        var authorization=new Authorization(authorizationId,actor.tenantId(),deploymentId,candidateId,actor.organizationId(),actor.departmentId(),p.basis(),command.assessment().strip(),command.rollbackPlan().strip(),command.reason().strip(),actor.subjectId(),actor.actor(),now);
        publications.append(authorization);
        for(int i=0;i<releases.size();i++) {
            var d=releases.get(i);if(!Objects.equals(d.organizationId(),actor.organizationId())||!Objects.equals(d.departmentId(),actor.departmentId()))continue;
            if("ENFORCED".equals(d.mode())&&(d.effectiveTo()==null||d.effectiveTo().isAfter(now)))releases.set(i,copy(d,"SUPERSEDED",now));
            else if("PROMOTE".equals(command.operation())&&Objects.equals(d.id(),p.basis().shadowDeploymentId())&&"ACTIVE".equals(d.status()))releases.set(i,copy(d,"PAUSED",d.effectiveTo()));
        }
        var release=new Deployment(deploymentId,candidateId.toString(),candidate.version(),"ENFORCED","ACTIVE",p.basis().approval().action(),actor.organizationId(),actor.departmentId(),now,command.effectiveTo(),actor.subjectId(),now,command.reason().strip(),null,source.executable(),new Release(p.basis().approval(),source.knowledgeRelease().factAdapterVersion(),source.knowledgeRelease().fingerprint(),authorizationId));
        releases.add(release);var history=new ArrayList<>(state.state().history());history.add(new AuditEvent(GlobalIds.next(),command.operation(),candidateId.toString(),actor.subjectId(),now,command.reason().strip()));
        governance.save(actor.tenantId(),key,state.revision(),new Governance(state.state().reviews(),List.copyOf(releases),List.copyOf(history)));return release;
    }
    public Authorization material(Long candidateId,Long deploymentId) {
        var release=deployments.managedDeployment(candidateId,deploymentId);
        if(!"ENFORCED".equals(release.mode())||release.knowledgeRelease()==null)throw notFound("QMED_PUBLICATION_MISSING","该记录不是知识正式发布");
        var tenant=contexts.requireCurrent().tenantId();var material=publications.require(tenant,release.knowledgeRelease().authorizationId());
        if(!MedicationKnowledgeRuntime.authorized(release,tenant,material,json))throw conflict("QMED_PUBLICATION_INTEGRITY","上线材料与所选发布不一致");
        return material;
    }
    private Deployment copy(Deployment d,String status,Instant to) {return new Deployment(d.id(),d.versionId(),d.version(),d.mode(),status,d.action(),d.organizationId(),d.departmentId(),d.effectiveFrom(),to,d.actorId(),d.createdAt(),d.reason(),d.candidate(),d.executable(),d.knowledgeRelease());}
    private boolean blank(String v,int max) {return v==null||v.isBlank()||v.length()>max;}
}
