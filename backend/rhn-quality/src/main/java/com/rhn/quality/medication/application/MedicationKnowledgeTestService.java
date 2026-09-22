package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.*;
import com.rhn.quality.medication.infrastructure.*;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;
import static com.rhn.quality.medication.application.MedicationKnowledgeReplayService.hash;

@Service
public class MedicationKnowledgeTestService {
    private final MedicationKnowledgeRuleStore candidates;private final MedicationKnowledgeTestStore store;
    private final ExecutionContextProvider contexts;private final JsonCodec json;
    private static final Set<String> OUTCOMES=Set.of("MATCH","NO_MATCH","NOT_APPLICABLE","UNAVAILABLE");
    public MedicationKnowledgeTestService(MedicationKnowledgeRuleStore candidates,MedicationKnowledgeTestStore store,ExecutionContextProvider contexts,JsonCodec json) {this.candidates=candidates;this.store=store;this.contexts=contexts;this.json=json;}
    private Long tenant() {var c=contexts.requireCurrent();if(!c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("QMED_KNOW_TEST_FORBIDDEN","需要药品主数据管理权限");return c.tenantId();}
    private KnowledgeRuleCandidate require(Long tenant,Long id) {
        var c=candidates.find(tenant,id).orElseThrow(()->notFound("QMED_KNOW_TEST_CANDIDATE","未找到当前租户的知识规则候选"));
        if(!Objects.equals(c.id(),id)||!c.programHash().equals(hash(json.write(c.program())))||!c.knowledgeHash().equals(hash(json.write(c.knowledge()))))
            throw conflict("QMED_KNOW_TEST_INTEGRITY","冻结候选身份或指纹不一致，请先核查原记录");
        return c;
    }
    public PageResult<SuiteSummary> suites(Long id,int page) {var t=tenant();require(t,id);page(page);return store.suites(t,id,page);}
    public SuiteDetail suite(Long id,int version) {var t=tenant();require(t,id);var s=suite(t,id,version);return new SuiteDetail(s,hash(json.write(s)));}
    private Suite suite(Long tenant,Long id,int version) {return store.suite(tenant,id,version).orElseThrow(()->notFound("QMED_KNOW_TEST_SUITE","未找到该候选的样例版本"));}
    public PageResult<RunSummary> runs(Long id,int page) {var t=tenant();require(t,id);page(page);return store.runs(t,id,page);}
    public Run run(Long id,Long runId) {var t=tenant();require(t,id);return store.run(t,id,runId).orElseThrow(()->notFound("QMED_KNOW_TEST_RUN","未找到该候选的验证记录"));}
    @Transactional public SuiteDetail save(Long id,Save input) {
        var t=tenant();var candidate=require(t,id);validate(input);
        if(!candidate.programHash().equals(input.programHash())) throw conflict("QMED_KNOW_TEST_STALE","候选表达指纹不一致，请重新打开该版本");
        store.lock(t,id);int latest=store.latestVersion(t,id);
        if(input.expectedVersion()!=latest) throw conflict("QMED_KNOW_TEST_STALE","样例已被修改，请刷新并核对最新版本");
        var c=contexts.requireCurrent();var value=new Suite(id,latest+1,candidate.programHash(),candidate.knowledgeHash(),List.copyOf(input.cases()),c.subjectId(),c.actor(),Instant.now(),input.reason().strip());
        store.append(t,value);return new SuiteDetail(value,hash(json.write(value)));
    }
    @Transactional public Run execute(Long id,Execute input) {
        var t=tenant();var candidate=require(t,id);
        if(input==null || input.suiteVersion()<1 || !fingerprint(input.suiteHash())) throw badRequest("QMED_KNOW_TEST_INPUT","请选择已保存的样例版本及指纹");
        reason(input.reason());store.lock(t,id);var suite=suite(t,id,input.suiteVersion());String digest=hash(json.write(suite));
        if(!digest.equals(input.suiteHash())||!suite.programHash().equals(candidate.programHash())||!suite.knowledgeHash().equals(candidate.knowledgeHash())) throw conflict("QMED_KNOW_TEST_STALE","样例版本或候选指纹不一致，请重新读取");
        if(!MedicationKnowledgeRuleCompiler.VERSION.equals(candidate.program().schemaVersion())) throw conflict("QMED_KNOW_TEST_ENGINE","当前执行器不支持该候选的表达版本，不能将执行器不兼容当作样例通过");
        var results=new ArrayList<CaseResult>();
        for(int i=0;i<suite.cases().size();i++) {
            var fixture=suite.cases().get(i);var f=fixture.input();
            var facts=new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Facts(f.age()==null?null:f.age().intValueExact(),f.ageUnit(),f.date(),f.medications());
            var actual=MedicationKnowledgeRuleEngine.evaluate(candidate.program(),facts);
            boolean passed=fixture.expectedOutcome().equals(actual.outcome())&&new HashSet<>(fixture.expectedOrderIds()).equals(new HashSet<>(actual.matchedOrderIds()));
            results.add(new CaseResult(i,actual,passed));
        }
        var missing=new ArrayList<>(List.of("MATCH","NO_MATCH","UNAVAILABLE"));var p=candidate.program();
        if(p.age().mode()==AgeMode.RANGE||p.effectiveFrom()!=null||p.effectiveTo()!=null) missing.add("NOT_APPLICABLE");
        missing.removeIf(outcome->suite.cases().stream().anyMatch(c->outcome.equals(c.expectedOutcome())));
        var c=contexts.requireCurrent();var value=new Run(GlobalIds.next(),id,candidate.programHash(),candidate.knowledgeHash(),MedicationKnowledgeRuleCompiler.VERSION,suite,digest,List.copyOf(results),!results.isEmpty()&&results.stream().allMatch(CaseResult::passed),List.copyOf(missing),c.subjectId(),c.actor(),Instant.now(),input.reason().strip());
        store.append(t,value);return value;
    }
    private void validate(Save input) {
        if(input==null||input.expectedVersion()<0||!fingerprint(input.programHash())||input.cases()==null||input.cases().isEmpty()||input.cases().size()>30||json.write(input).length()>150000) throw badRequest("QMED_KNOW_TEST_INPUT","请填写 1 至 30 个独立合成样例，内容最多 150000 字符");
        reason(input.reason());var names=new HashSet<String>();
        for(var c:input.cases()) {
            if(c==null||blank(c.title())||c.title().length()>200||!names.add(c.title().strip())||blank(c.rationale())||c.rationale().length()>2000||!OUTCOMES.contains(Objects.toString(c.expectedOutcome(),""))||c.input()==null||c.input().medications()==null||c.input().medications().size()>30||c.expectedOrderIds()==null||c.expectedOrderIds().size()>30)
                throw badRequest("QMED_KNOW_TEST_CASE","每个样例须有不同名称、预期依据、明确结果和输入，最多 30 条合成医嘱");
            var ids=c.expectedOrderIds();
            if(ids.stream().anyMatch(s->blank(s)||s.length()>100)||new HashSet<>(ids).size()!=ids.size()||("MATCH".equals(c.expectedOutcome())?ids.isEmpty():!ids.isEmpty())) throw badRequest("QMED_KNOW_TEST_EXPECTED","命中样例须指定不同的预期医嘱标识，其他结果不能填写命中医嘱");
            if(ids.stream().anyMatch(id->c.input().medications().stream().noneMatch(r->r!=null&&id.equals(r.orderId())))) throw badRequest("QMED_KNOW_TEST_EXPECTED","预期医嘱必须存在于该样例输入中");
            bounded(c.input().ageUnit(),20);
            if(c.medicationLabels()!=null) {
                if(c.medicationLabels().size()>30) throw badRequest("QMED_KNOW_TEST_SIZE","每个样例最多保留 30 项药品展示名称");
                c.medicationLabels().forEach((id,label)->{bounded(id,200);bounded(label,500);});
            }
            if(c.input().age()!=null) try {c.input().age().intValueExact();} catch(ArithmeticException ex) {throw badRequest("QMED_KNOW_TEST_AGE","合成年龄须为整数，不能截断小数或超出整数范围");}
            for(var r:c.input().medications()) if(r!=null) {
                bounded(r.orderId(),100);bounded(r.catalogId(),200);bounded(r.catalogVersion(),200);bounded(r.contentHash(),200);bounded(r.entryId(),200);bounded(r.specificationId(),200);bounded(r.routeCode(),100);bounded(r.status(),32);
            }
        }
    }
    private void bounded(String s,int max) {if(s!=null&&s.length()>max) throw badRequest("QMED_KNOW_TEST_SIZE","合成事实字段超过长度限制");}
    private boolean fingerprint(String s) {return s!=null&&s.matches("[a-f0-9]{64}");}
    private boolean blank(String s) {return s==null||s.isBlank();}
    private void reason(String s) {if(blank(s)||s.length()>2000) throw badRequest("QMED_KNOW_TEST_REASON","请填写操作原因（最多 2000 字）");}
    private void page(int page) {if(page<0) throw badRequest("QMED_KNOW_TEST_PAGE","分页参数无效");}
}
