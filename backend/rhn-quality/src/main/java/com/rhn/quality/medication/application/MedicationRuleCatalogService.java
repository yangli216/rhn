package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.quality.medication.domain.*;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory;
import com.rhn.outpatient.api.MedicationSafetyDecision.*;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import java.util.stream.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MedicationRuleCatalogService {
    private final ExecutionContextProvider contexts;
    private final MedicationRuleRegistry registry;
    private final MedicationWorkbenchStore candidates;
    private final MedicationRuleGovernanceStore governance;
    private final MedicationKnowledgeDirectory knowledge;
    public MedicationRuleCatalogService(ExecutionContextProvider contexts, MedicationRuleRegistry registry,
            MedicationWorkbenchStore candidates, MedicationRuleGovernanceStore governance, MedicationKnowledgeDirectory knowledge) {
        this.contexts=contexts;this.registry=registry;this.candidates=candidates;this.governance=governance;this.knowledge=knowledge;
    }
    private void access() {
        if(!contexts.requireCurrent().hasAuthority("MASTER_DATA.MANAGE"))
            throw forbidden("QMED_CATALOG_FORBIDDEN","需要药品主数据管理权限");
    }
    public Catalog catalog() {
        access();var c=contexts.requireCurrent();return new Catalog(c.organizationId(),c.departmentId(),entries(c.tenantId()));
    }
    private List<CatalogEntry> entries(Long tenant) {
        var states=governance.all(tenant).stream().collect(Collectors.toMap(MedicationRuleGovernanceStore.Stored::key,v->v));
        var result=new ArrayList<CatalogEntry>();
        var builtins=Stream.concat(registry.load(MedicationSafetyEngine.LEGACY_RULE_SET).stream(),registry.load(MedicationSafetyEngine.RULE_SET).stream())
                .collect(Collectors.groupingBy(v->v.definition().code(),TreeMap::new,Collectors.toList()));
        builtins.forEach((code,versions)-> {
            String key="BUILTIN:"+code;var stored=states.getOrDefault(key,new MedicationRuleGovernanceStore.Stored(key,0,Governance.empty()));
            var views=versions.stream().sorted(Comparator.comparingInt(RuleVersion::version).reversed()).map(v-> {
                var review=review(stored.state(),v.id().toString());
                return new CatalogVersion(v.id().toString(),v.version(),v.definition().title(),review==null?"DRAFT":review.status(),true,"BUILTIN",null,v,review);
            }).toList();
            result.add(new CatalogEntry(key,code,views.getFirst().name(),"BUILTIN",stored.revision(),views,stored.state().deployments(),stored.state().history()));
        });
        var all=candidates.all(tenant);var index=all.stream().collect(Collectors.toMap(Candidate::id,v->v));
        all.stream().collect(Collectors.groupingBy(v->root(v,index),TreeMap::new,Collectors.toList())).forEach((root,versions)-> {
            String key="CANDIDATE:"+root;var stored=states.getOrDefault(key,new MedicationRuleGovernanceStore.Stored(key,0,Governance.empty()));
            var views=versions.stream().sorted(Comparator.comparingInt(Candidate::version).reversed()).map(v-> {
                var review=review(stored.state(),v.id().toString());
                var suite=candidates.syntheticRuns(tenant,v.id()).stream().filter(r->!r.cases().isEmpty() && r.cases().stream().allMatch(x->x.expected()!=null)).findFirst();
                boolean passed=suite.isPresent() && suite.get().cases().size()>=5 && suite.get().cases().stream().allMatch(CaseResult::passed);
                return new CatalogVersion(v.id().toString(),v.version(),v.rule().name(),review==null?"DRAFT":review.status(),passed,
                        "MANUAL".equals(v.model())?"MANUAL":"AI",v,null,review);
            }).toList();
            result.add(new CatalogEntry(key,"QMED.CUSTOM."+root,views.getFirst().name(),views.getFirst().origin(),stored.revision(),views,stored.state().deployments(),stored.state().history()));
        });
        return List.copyOf(result);
    }
    private Long root(Candidate value,Map<Long,Candidate> index) {
        var visited=new HashSet<Long>();
        while(value.parentId()!=null) {
            if(!visited.add(value.id()) || !index.containsKey(value.parentId())) throw conflict("QMED_VERSION_CHAIN_INVALID","候选规则版本链不完整，请先核对历史记录");
            value=index.get(value.parentId());
        }
        return value.id();
    }
    private Review review(Governance state,String id) { return state.reviews().stream().filter(v->v.versionId().equals(id)).findFirst().orElse(null); }
    private CatalogEntry require(String key) { return entries(contexts.requireCurrent().tenantId()).stream().filter(v->v.key().equals(key)).findFirst()
            .orElseThrow(()->notFound("QMED_RULE_NOT_FOUND","未找到当前租户的规则")); }
    public List<RuntimeRecord> runs(String key) {access();require(key);return governance.runs(contexts.requireCurrent().tenantId(),key);}

    public Candidate draft(DraftCommand input) {
        access();
        if(input==null || input.medicationIds()==null || input.medicationIds().isEmpty() || input.medicationIds().size()>10
                || input.requirement()==null || input.requirement().isBlank() || input.requirement().length()>4000
                || input.source()!=null && input.source().length()>8000)
            throw badRequest("QMED_DRAFT_INVALID","请填写规则需求并选择 1 至 10 个标准药品");
        MedicationWorkbenchService.validateRule(input.rule());
        var c=contexts.requireCurrent();
        var parent=input.parentId()==null?null:candidates.require(c.tenantId(),input.parentId());
        var meds=input.medicationIds().stream().distinct().map(knowledge::require).toList();
        if(meds.stream().anyMatch(m->m.standardReference()==null || !m.standardReference().linked()))
            throw badRequest("QMED_STANDARD_REFERENCE_REQUIRED","草稿必须绑定有效标准规格");
        var rule=input.rule();
        var frozen=new RuleSpec(rule.template(),rule.name(),rule.explanation(),rule.duplicateCount(),rule.message(),"WARN",rule.effectiveExpression(),rule.categoryName(),rule.minAge(),null);
        return candidates.appendVersion(c.tenantId(),c.subjectId(),new Candidate(GlobalIds.next(),parent==null?null:parent.id(),1,
                input.requirement(),Objects.toString(input.source(),""),"MANUAL",Instant.now(),frozen,meds,"CANDIDATE"));
    }

    @Transactional
    public CatalogEntry command(String key,CatalogCommand input) {
        access();var c=contexts.requireCurrent();
        if(input==null || input.reason()==null || input.reason().isBlank() || input.reason().length()>2000)
            throw badRequest("QMED_REASON_REQUIRED","请填写操作原因（最多 2000 字）");
        var entry=require(key);var stored=governance.read(c.tenantId(),key);
        if(input.expectedRevision()!=stored.revision()) throw conflict("QMED_CATALOG_STALE","规则已被修改，请刷新后重试");
        var version=entry.versions().stream().filter(v->v.id().equals(input.versionId())).findFirst()
                .orElseThrow(()->notFound("QMED_VERSION_NOT_FOUND","规则版本不存在"));
        var reviews=new ArrayList<>(stored.state().reviews());var releases=new ArrayList<>(stored.state().deployments());
        var events=new ArrayList<>(stored.state().history());var now=Instant.now();String operation=Objects.toString(input.operation(),"");
        switch(operation) {
            case "SUBMIT" -> {
                if(!Set.of("DRAFT","REJECTED").contains(version.reviewStatus())) throw conflict("QMED_REVIEW_TRANSITION_INVALID","当前版本不能重复提交审核");
                validateVersion(version);
                if(!version.testsPassed()) throw conflict("QMED_TESTS_REQUIRED","请先完成当前版本的回归套件，全部用例通过后提交审核");
                replace(reviews,new Review(version.id(),"IN_REVIEW",null,List.of(),false,false,c.subjectId(),now,input.reason()));
            }
            case "APPROVE", "REJECT" -> {
                if(!"IN_REVIEW".equals(version.reviewStatus())) throw conflict("QMED_REVIEW_TRANSITION_INVALID","只有待审核版本可以审核");
                if("REJECT".equals(operation)) replace(reviews,new Review(version.id(),"REJECTED",null,List.of(),false,false,c.subjectId(),now,input.reason()));
                else {
                    validateVersion(version);
                    if(!version.testsPassed()) throw conflict("QMED_TESTS_REQUIRED","当前版本的回归套件尚未通过");
                    if(!Boolean.TRUE.equals(input.standardVerified()) || !Boolean.TRUE.equals(input.evidenceVerified()))
                        throw badRequest("QMED_REVIEW_VERIFICATION_REQUIRED","审核人须确认已核对标准身份与规则证据");
                    if(!Set.of("WARN","REQUIRE_OVERRIDE","BLOCK").contains(Objects.toString(input.action(),"")))
                        throw badRequest("QMED_ACTION_INVALID","请选择正式执行动作");
                    validateEvidence(input.evidence());
                    var approval=new Review(version.id(),"APPROVED",input.action(),List.copyOf(input.evidence()),true,true,c.subjectId(),now,input.reason());
                    if(version.candidate()!=null) governance.install(executable(entry,version,approval));
                    replace(reviews,approval);
                }
            }
            case "DEPLOY", "ROLLBACK" -> {
                if(!"APPROVED".equals(version.reviewStatus())) throw conflict("QMED_APPROVAL_REQUIRED","请先审核通过当前版本");
                validateVersion(version);checkScope(input.organizationId(),input.departmentId());
                if(!Set.of("SHADOW","ENFORCED").contains(Objects.toString(input.mode(),""))) throw badRequest("QMED_MODE_INVALID","请选择旁路或正式运行模式");
                if("ENFORCED".equals(input.mode()) && !governance.hasShadowRun(c.tenantId(),key,version.id()))
                    throw conflict("QMED_SHADOW_OBSERVATION_REQUIRED","正式发布前须启用旁路，并完成至少一次可评价的真实处方观察；请同时审核观察结果");
                if("ROLLBACK".equals(operation) && releases.stream().noneMatch(d->d.versionId().equals(version.id()) && d.mode().equals(input.mode())
                        && Objects.equals(d.organizationId(),input.organizationId()) && Objects.equals(d.departmentId(),input.departmentId())))
                    throw conflict("QMED_ROLLBACK_TARGET_INVALID","目标版本未在所选范围发布过");
                Instant from=input.effectiveFrom()==null?now:input.effectiveFrom();
                if(from.isBefore(now.minusSeconds(60)) || input.effectiveTo()!=null && !input.effectiveTo().isAfter(from))
                    throw badRequest("QMED_DEPLOYMENT_PERIOD_INVALID","生效时间不能追溯，失效时间须晚于生效时间");
                // A future replacement ends the previous release at that future boundary, not immediately.
                for(int i=0;i<releases.size();i++) {
                    var d=releases.get(i);
                    if(d.mode().equals(input.mode()) && Objects.equals(d.organizationId(),input.organizationId())
                            && Objects.equals(d.departmentId(),input.departmentId()) && "ACTIVE".equals(d.status())
                            && (d.effectiveTo()==null || d.effectiveTo().isAfter(from))) {
                        releases.set(i,new Deployment(d.id(),d.versionId(),d.version(),d.mode(),d.effectiveFrom().isBefore(from)?"ACTIVE":"SUPERSEDED",d.action(),
                                d.organizationId(),d.departmentId(),d.effectiveFrom(),from,d.actorId(),d.createdAt(),d.reason(),d.candidate(),d.executable()));
                    }
                }
                releases.add(new Deployment(GlobalIds.next(),version.id(),version.version(),input.mode(),"ACTIVE",version.review().action(),
                        input.organizationId(),input.departmentId(),from,input.effectiveTo(),c.subjectId(),now,input.reason(),version.candidate(),executable(entry,version,version.review())));
            }
            case "PAUSE" -> {
                if(input.deploymentId()==null) {
                    if(version.builtin()==null || !MedicationSafetyEngine.RULE_SET.equals(version.builtin().ruleSetVersion()))
                        throw badRequest("QMED_DEPLOYMENT_REQUIRED","请选择需要暂停的发布记录");
                    checkScope(input.organizationId(),input.departmentId());
                    releases.add(new Deployment(GlobalIds.next(),version.id(),version.version(),"SHADOW","PAUSED",version.builtin().decision().name(),
                            input.organizationId(),input.departmentId(),now,null,c.subjectId(),now,input.reason(),null,version.builtin()));
                } else {
                    var d=releases.stream().filter(v->v.id().equals(input.deploymentId()) && v.versionId().equals(version.id())).findFirst()
                            .orElseThrow(()->notFound("QMED_DEPLOYMENT_NOT_FOUND","发布记录不存在"));
                    checkScope(d.organizationId(),d.departmentId());
                    if(!"ACTIVE".equals(d.status())) throw conflict("QMED_DEPLOYMENT_TRANSITION_INVALID","该发布记录已暂停或被替换");
                    releases.set(releases.indexOf(d),new Deployment(d.id(),d.versionId(),d.version(),d.mode(),"PAUSED",d.action(),d.organizationId(),d.departmentId(),
                            d.effectiveFrom(),d.effectiveTo(),d.actorId(),d.createdAt(),d.reason(),d.candidate(),d.executable()));
                }
            }
            case "RETIRE" -> {
                if(releases.stream().anyMatch(d->d.versionId().equals(version.id()) && "ACTIVE".equals(d.status()) && (d.effectiveTo()==null||d.effectiveTo().isAfter(now))))
                    throw conflict("QMED_PAUSE_REQUIRED","请先暂停该版本尚未结束的发布记录");
                replace(reviews,new Review(version.id(),"RETIRED",null,List.of(),false,false,c.subjectId(),now,input.reason()));
            }
            default -> throw badRequest("QMED_OPERATION_INVALID","不支持的目录操作");
        }
        events.add(new AuditEvent(GlobalIds.next(),operation,version.id(),c.subjectId(),now,input.reason()));
        governance.save(c.tenantId(),key,stored.revision(),new Governance(reviews,releases,events));
        return require(key);
    }
    private void replace(List<Review> reviews,Review next) { reviews.removeIf(v->v.versionId().equals(next.versionId()));reviews.add(next); }
    private void checkScope(Long organization,Long department) {
        var c=contexts.requireCurrent();
        if(organization==null || !c.canAccessOrganization(organization) || department!=null && !c.canAccessDepartment(department))
            throw forbidden("QMED_DEPLOYMENT_SCOPE_INVALID","发布范围须属于当前可管理的机构和科室");
    }
    private void validateEvidence(List<Evidence> evidence) {
        if(evidence==null || evidence.isEmpty() || evidence.size()>20 || evidence.stream().anyMatch(e->e==null
                || blank(e.sourceType()) || blank(e.sourceTitle()) || blank(e.sourceVersion()) || blank(e.sourceLocator()) || blank(e.excerpt())
                || !"CLINICAL_EVIDENCE".equals(e.usageScope()) || e.excerpt().length()>8000 || e.sourceLocator().length()>2000))
            throw badRequest("QMED_EVIDENCE_REQUIRED","请提供已核验的规则证据：来源类型、标题、版本、定位和支持条款；工程基线不能作为正式证据");
    }
    private boolean blank(String value) {return value==null || value.isBlank();}
    private void validateVersion(CatalogVersion version) {
        if(version.candidate()==null) return;
        MedicationWorkbenchService.validateRule(version.candidate().rule());
        for(var med:version.candidate().medications()) {
            var ref=med.standardReference();var current=knowledge.require(med.medication().id()).standardReference();
            if(ref==null || current==null || !ref.linked() || !current.linked() || !Objects.equals(ref.specificationId(),current.specificationId())
                    || !Objects.equals(ref.catalogVersion(),current.catalogVersion()) || !Objects.equals(ref.contentHash(),current.contentHash()))
                throw conflict("QMED_STANDARD_REFERENCE_STALE","标准关联已变化或缺失，请生成新版本重新验证");
        }
    }
    private RuleVersion executable(CatalogEntry entry,CatalogVersion version,Review approval) {
        var builtin=version.builtin();
        var definition=builtin!=null?builtin.definition():new RuleDefinition(Long.valueOf(entry.key().substring("CANDIDATE:".length())),entry.code(),version.candidate().rule().template(),version.name());
        return new RuleVersion(Long.valueOf(version.id()),definition,version.version(),builtin!=null?builtin.ruleSetVersion():"qmed-candidate-"+version.id(),
                builtin!=null?builtin.implementationKey():"template:"+version.candidate().rule().template()+":1","SHADOW",
                builtin!=null?builtin.severity():Severity.MODERATE,Status.valueOf(approval.action()),
                "BLOCK".equals(approval.action())?OverridePolicy.NOT_ALLOWED:"REQUIRE_OVERRIDE".equals(approval.action())?OverridePolicy.REASON_REQUIRED:OverridePolicy.ACKNOWLEDGE,
                approval.recordedAt(),null,approval.evidence());
    }
}
