package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.Observation;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate;
import com.rhn.quality.medication.api.MedicationKnowledgeReplayContracts.Input;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.quality.medication.infrastructure.MedicationKnowledgeFeedbackStore.hash;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MedicationKnowledgeFeedbackService {
    private final MedicationKnowledgeDeploymentService deployments;private final MedicationRuleGovernanceStore governance;
    private final MedicationKnowledgeFeedbackStore store;private final ExecutionContextProvider contexts;private final JsonCodec json;
    public MedicationKnowledgeFeedbackService(MedicationKnowledgeDeploymentService deployments,MedicationRuleGovernanceStore governance,MedicationKnowledgeFeedbackStore store,ExecutionContextProvider contexts,JsonCodec json) {this.deployments=deployments;this.governance=governance;this.store=store;this.contexts=contexts;this.json=json;}
    private RuntimeRecord run(Long candidate,Long deployment,Long id,boolean lock) {
        var d=deployments.observationDeployment(candidate,deployment);var actor=contexts.requireCurrent();
        if(d.knowledgeRelease()==null)throw notFound("QMED_FEEDBACK_RELEASE","该发布没有知识规则冻结材料");
        var key="KNOWLEDGE:"+d.knowledgeRelease().approval().basis().candidate().knowledgeId();
        var run=governance.observationRun(actor.tenantId(),actor.organizationId(),actor.departmentId(),key,deployment,id,lock);
        if(!Objects.equals(run.id(),id)||!Objects.equals(run.deploymentId(),deployment)||!Objects.equals(run.versionId(),candidate.toString())
                ||!Objects.equals(run.organizationId(),actor.organizationId())||!Objects.equals(run.departmentId(),actor.departmentId())||!Objects.equals(run.ruleKey(),key)||!"SHADOW".equals(run.mode()))
            throw conflict("QMED_FEEDBACK_RUN_INTEGRITY","观察索引与冻结记录不一致，请核查运行审计");
        return run;
    }
    @Transactional(readOnly=true) public Detail detail(Long candidate,Long deployment,Long id,int page) {
        if(page<0)throw badRequest("QMED_FEEDBACK_PAGE","历史页码无效");
        return view(candidate,run(candidate,deployment,id,false),page);
    }
    Detail lockedDetail(Long candidate,Long deployment,Long id) {return view(candidate,run(candidate,deployment,id,true),0);}
    private Detail view(Long candidate,RuntimeRecord run,int page) {
        var actor=contexts.requireCurrent();var gaps=new ArrayList<String>();Input input=null;KnowledgeRuleCandidate frozen=null;String releaseHash=null;
        try {
            var details=json.readTree(run.details());var node=details.path("deployment");
            var d=json.read(json.write(node),Deployment.class);
            if(!Objects.equals(d.id(),run.deploymentId())||!Objects.equals(d.versionId(),run.versionId())||!Objects.equals(d.organizationId(),run.organizationId())||!Objects.equals(d.departmentId(),run.departmentId())||d.knowledgeRelease()==null)
                throw new IllegalArgumentException("unbound frozen release");
            var release=d.knowledgeRelease();frozen=release.approval().basis().candidate();releaseHash=release.fingerprint();
            if(!Objects.equals(frozen.id(),candidate)||!Objects.equals(releaseHash,MedicationKnowledgeRuntime.fingerprint(release.approval(),json))
                    ||!Objects.equals(frozen.programHash(),hash(json.write(frozen.program())))||!Objects.equals(frozen.knowledgeHash(),hash(json.write(frozen.knowledge()))))
                gaps.add("运行时冻结发布或知识表达的指纹不一致，仅可记录问题或待核实意见");
            if(!details.path("knowledgeInput").isNull()&&!details.path("knowledgeInput").isMissingNode()) input=json.read(json.write(details.path("knowledgeInput")),Input.class);
        } catch(RuntimeException invalid) {gaps.add("无法读取绑定本次观察的冻结发布或事实，请核查运行审计");input=null;frozen=null;}
        if(input==null)gaps.add("本次观察未保留可读取的最小评价事实，不以当前处方重建历史");
        var result=run.knowledgeResult();String outcome=result==null?"UNAVAILABLE":result.outcome();
        var rawBasis=new Basis(candidate,run.deploymentId(),run.id(),run.organizationId(),run.departmentId(),outcome,hash(json.write(run)),releaseHash,frozen==null?null:frozen.programHash(),frozen==null?null:frozen.knowledgeHash(),null);
        var basis=new Basis(rawBasis.candidateId(),rawBasis.deploymentId(),rawBasis.runId(),rawBasis.organizationId(),rawBasis.departmentId(),outcome,rawBasis.runHash(),rawBasis.releaseFingerprint(),rawBasis.programHash(),rawBasis.knowledgeHash(),hash(json.write(rawBasis)));
        var latest=store.latest(actor.tenantId(),run.id());var allowed=new ArrayList<>(List.of("DATA_ISSUE","RULE_ISSUE","UNCERTAIN"));
        if(gaps.isEmpty()) {allowed.addFirst("SUPPORTED");if("MATCH".equals(outcome))allowed.add("FALSE_POSITIVE");if(List.of("NO_MATCH","NOT_APPLICABLE").contains(outcome))allowed.add("POSSIBLE_MISS");}
        if(latest!=null&&!Objects.equals(latest.basis().runHash(),basis.runHash())) {gaps.add("原观察与既有研判引用的指纹不一致，暂停追加意见并核查历史");allowed.clear();}
        var observation=new Observation(run.id(),run.deploymentId(),run.prescriptionId(),run.time(),outcome,result==null?List.of("未保存可识别的知识评价结果"):result.reasons(),result==null?List.of():result.matchedOrderIds());
        boolean canWithdraw=latest!=null&&"RECORD".equals(latest.operation())&&Objects.equals(latest.actorId(),actor.subjectId());
        return new Detail(basis,observation,input,frozen,List.copyOf(gaps),List.copyOf(allowed),latest,canWithdraw,store.history(actor.tenantId(),run.id(),page));
    }
    @Transactional public Detail command(Long candidate,Long deployment,Long id,Command command) {
        var run=run(candidate,deployment,id,true);var actor=contexts.requireCurrent();
        if(command==null||command.expectedRevision()<0||!List.of("RECORD","WITHDRAW").contains(Objects.toString(command.operation(),""))||blank(command.reason(),2000))
            throw badRequest("QMED_FEEDBACK_COMMAND","请填写有效的操作及记录或更正原因（最多 2000 字）");
        var current=view(candidate,run,0);var latest=current.latest();int revision=latest==null?0:latest.revision();
        if(command.expectedRevision()!=revision||!Objects.equals(command.expectedBasisHash(),current.basis().fingerprint()))
            throw conflict("QMED_FEEDBACK_STALE","观察或研判已变化，请刷新核对后重新提交");
        Event event;
        if("WITHDRAW".equals(command.operation())) {
            if(!current.canWithdraw())throw forbidden("QMED_FEEDBACK_WITHDRAW","只有最新意见的记录人可以撤回自己的有效研判");
            event=new Event(GlobalIds.next(),revision+1,"WITHDRAW",null,null,null,null,command.reason().strip(),latest.basis(),actor.subjectId(),actor.actor(),Instant.now());
        } else {
            if(!current.allowedVerdicts().contains(Objects.toString(command.verdict(),""))||blank(command.assessment(),4000)||blank(command.evidence(),4000)||command.suggestion()!=null&&command.suggestion().length()>2000)
                throw badRequest("QMED_FEEDBACK_REQUIRED","请选择与观察结果相符的研判分类，填写研判说明与依据（各最多 4000 字）；建议最多 2000 字");
            event=new Event(GlobalIds.next(),revision+1,"RECORD",command.verdict(),command.assessment().strip(),command.evidence().strip(),command.suggestion()==null?null:command.suggestion().strip(),command.reason().strip(),current.basis(),actor.subjectId(),actor.actor(),Instant.now());
        }
        store.append(actor.tenantId(),event);return view(candidate,run,0);
    }
    private boolean blank(String value,int max) {return value==null||value.isBlank()||value.length()>max;}
}
