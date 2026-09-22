package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeDeploymentContracts.*;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.quality.medication.domain.*;
import com.rhn.outpatient.api.MedicationSafetyDecision.*;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** Explicit, department-scoped shadow release. Approval never implicitly activates a rule. */
@Service
public class MedicationKnowledgeDeploymentService {
    private final com.rhn.shared.json.JsonCodec json;private final ExecutionContextProvider contexts;private final MedicationKnowledgeReviewService reviews;
    private final MedicationKnowledgeRuleStore candidates;private final MedicationKnowledgeTestStore tests;private final MedicationRuleGovernanceStore store;
    public MedicationKnowledgeDeploymentService(ExecutionContextProvider contexts,MedicationKnowledgeReviewService reviews,MedicationKnowledgeRuleStore candidates,MedicationKnowledgeTestStore tests,MedicationRuleGovernanceStore store,com.rhn.shared.json.JsonCodec json) {this.json=json;this.contexts=contexts;this.reviews=reviews;this.candidates=candidates;this.tests=tests;this.store=store;}
    private Long tenant() {
        var c=contexts.requireCurrent();
        if(!c.hasAuthority("MASTER_DATA.MANAGE")||c.subjectId()==null) throw forbidden("QMED_KNOW_DEPLOY_FORBIDDEN","需要主数据管理权限及操作者身份");
        if(c.organizationId()==null||c.departmentId()==null||!c.canAccessOrganization(c.organizationId())||!c.canAccessDepartment(c.departmentId())) throw forbidden("QMED_KNOW_DEPLOY_SCOPE","请切换到可管理的机构和科室");
        return c.tenantId();
    }
    private KnowledgeRuleCandidate require(Long tenant,Long id) {return candidates.find(tenant,id).orElseThrow(()->notFound("QMED_KNOW_DEPLOY_CANDIDATE","未找到当前租户的知识候选"));}
    private String key(KnowledgeRuleCandidate c) {return "KNOWLEDGE:"+c.knowledgeId();}
    private boolean scope(Deployment d) {var c=contexts.requireCurrent();return Objects.equals(d.organizationId(),c.organizationId())&&Objects.equals(d.departmentId(),c.departmentId());}
    public Preview preview(Long id) {
        var tenant=tenant();var c=require(tenant,id);var p=reviews.preview(id);var gaps=new ArrayList<>(p.gaps());
        var approval=p.latest()!=null&&"APPROVE".equals(p.latest().operation())?p.latest():null;
        if(!"APPROVED".equals(p.status())||approval==null) gaps.add("该候选尚未审核通过");
        else if(!approval.basis().fingerprint().equals(p.current().fingerprint())) gaps.add("当前来源或验证材料与批准时不同，须重新生成并审核候选后部署");
        var actor=contexts.requireCurrent();
        return new Preview(p.revision(),actor.organizationId(),actor.departmentId(),approval,List.copyOf(gaps),store.read(tenant,key(c)).state().deployments().stream().filter(this::scope).toList());
    }
    @Transactional public Deployment command(Long id,Command input) {
        var tenant=tenant();var c=require(tenant,id);
        if(input==null||!Set.of("DEPLOY","PAUSE").contains(Objects.toString(input.operation(),""))||!("SHADOW".equals(input.mode())||"PAUSE".equals(input.operation())&&"ENFORCED".equals(input.mode()))||input.reason()==null||input.reason().isBlank()||input.reason().length()>2000) throw badRequest("QMED_KNOW_DEPLOY_INPUT","请选择旁路启用或指定模式的暂停，并填写原因；正式启用须使用独立发布入口");
        candidates.lockKnowledge(tenant,c.knowledgeId());tests.lock(tenant,id);
        var stored=store.read(tenant,key(c));
        if(stored.revision()!=input.expectedRevision()) throw conflict("QMED_KNOW_DEPLOY_STALE","规则目录已变化，请刷新后重试");
        var releases=new ArrayList<>(stored.state().deployments());var now=Instant.now();var actor=contexts.requireCurrent();Deployment release;
        if("PAUSE".equals(input.operation())) {
            // Pausing must remain possible even when standards, evidence or test preflight has become stale.
            var d=releases.stream().filter(v->Objects.equals(v.id(),input.deploymentId())&&v.versionId().equals(id.toString())&&scope(v)&&input.mode().equals(v.mode())).findFirst().orElseThrow(()->notFound("QMED_KNOW_DEPLOY_NOT_FOUND","未找到当前机构科室下的该候选发布记录"));
            if(!"ACTIVE".equals(d.status())) throw conflict("QMED_KNOW_DEPLOY_STATE","该发布记录已暂停或被替换");
            release=copy(d,"PAUSED",d.effectiveTo());releases.set(releases.indexOf(d),release);
        } else {
            var p=preview(id);
            if(!p.gaps().isEmpty()) throw conflict("QMED_KNOW_DEPLOY_GAPS","尚不能进入旁路："+String.join("；",p.gaps()));
            if(!Objects.equals(input.expectedBasisHash(),p.approval().basis().fingerprint())) throw conflict("QMED_KNOW_DEPLOY_STALE","批准材料指纹不一致，请重新核对");
            if(input.effectiveTo()!=null&&!input.effectiveTo().isAfter(now)) throw badRequest("QMED_KNOW_DEPLOY_PERIOD","结束时间须晚于当前时间");
            var approval=p.approval();var body=c.knowledge().body();var source=body.evidence();
            var evidence=new Evidence(source.sourceType(),source.title(),source.edition(),source.locator(),source.publisher(),source.excerpt(),"INSTITUTION_POLICY".equals(source.sourceType())?"INSTITUTION_POLICY":"CLINICAL_EVIDENCE");
            var action=Status.valueOf(approval.action());
            var executable=new RuleVersion(c.id(),new RuleDefinition(c.knowledgeId(),"QMED.KNOWLEDGE."+c.knowledgeId(),body.kind(),body.title()),c.version(),"qmed-knowledge-"+c.id(),c.program().schemaVersion(),"SHADOW",Severity.valueOf("MEDIUM".equals(body.severity())?"MODERATE":body.severity()),action,action==Status.BLOCK?OverridePolicy.NOT_ALLOWED:action==Status.REQUIRE_OVERRIDE?OverridePolicy.REASON_REQUIRED:OverridePolicy.ACKNOWLEDGE,approval.time(),null,List.of(evidence));
            store.installIfAbsent(executable);
            for(int i=0;i<releases.size();i++) {var d=releases.get(i);if(scope(d)&&"SHADOW".equals(d.mode())&&(d.effectiveTo()==null||d.effectiveTo().isAfter(now))) releases.set(i,copy(d,"SUPERSEDED",now));}
            release=new Deployment(GlobalIds.next(),id.toString(),c.version(),"SHADOW","ACTIVE",approval.action(),actor.organizationId(),actor.departmentId(),now,input.effectiveTo(),actor.subjectId(),now,input.reason().strip(),null,executable,new Release(approval,MedicationKnowledgeReplayAdapter.VERSION,MedicationKnowledgeRuntime.fingerprint(approval,json)));
            releases.add(release);
        }
        var history=new ArrayList<>(stored.state().history());history.add(new AuditEvent(GlobalIds.next(),input.operation(),id.toString(),actor.subjectId(),now,input.reason().strip()));
        store.save(tenant,key(c),stored.revision(),new Governance(stored.state().reviews(),List.copyOf(releases),List.copyOf(history)));
        return release;
    }
    private Deployment copy(Deployment d,String status,Instant to) {return new Deployment(d.id(),d.versionId(),d.version(),d.mode(),status,d.action(),d.organizationId(),d.departmentId(),d.effectiveFrom(),to,d.actorId(),d.createdAt(),d.reason(),d.candidate(),d.executable(),d.knowledgeRelease());}
    public Deployment managedDeployment(Long id,Long deploymentId) {
        var tenant=tenant();var c=require(tenant,id);
        return store.read(tenant,key(c)).state().deployments().stream().filter(d->Objects.equals(d.id(),deploymentId)&&d.versionId().equals(id.toString())&&scope(d))
            .findFirst().orElseThrow(()->notFound("QMED_KNOW_DEPLOY_NOT_FOUND","未找到当前机构科室下的该候选发布记录"));
    }
    public Deployment observationDeployment(Long id,Long deploymentId) {
        var d=managedDeployment(id,deploymentId);if(!"SHADOW".equals(d.mode()))throw notFound("QMED_KNOW_DEPLOY_NOT_FOUND","当前入口只支持旁路观察");return d;
    }
    public Observations observations(Long id,Long deploymentId,int page) {
        var tenant=tenant();var c=require(tenant,id);var actor=contexts.requireCurrent();
        if(page<0) throw badRequest("QMED_KNOW_DEPLOY_PAGE","分页参数无效");
        store.read(tenant,key(c)).state().deployments().stream().filter(d->Objects.equals(d.id(),deploymentId)&&d.versionId().equals(id.toString())&&scope(d)).findFirst().orElseThrow(()->notFound("QMED_KNOW_DEPLOY_NOT_FOUND","未找到当前机构科室下的该候选发布记录"));
        return store.observations(tenant,actor.organizationId(),actor.departmentId(),key(c),deploymentId,page);
    }
}
