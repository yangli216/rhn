package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeReviewContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Issue;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.AgeMode;
import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.Run;
import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.*;
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
public class MedicationKnowledgeReviewService {
    private final ExecutionContextProvider contexts;private final JsonCodec json;
    private final MedicationKnowledgeRuleStore candidates;private final MedicationKnowledgeDraftService drafts;
    private final MedicationKnowledgeTestStore tests;private final MedicationKnowledgeReviewStore events;private final MedicationRuleGovernanceStore governance;
    public MedicationKnowledgeReviewService(ExecutionContextProvider contexts,JsonCodec json,MedicationKnowledgeRuleStore candidates,MedicationKnowledgeDraftService drafts,MedicationKnowledgeTestStore tests,MedicationKnowledgeReviewStore events,MedicationRuleGovernanceStore governance) {this.contexts=contexts;this.json=json;this.candidates=candidates;this.drafts=drafts;this.tests=tests;this.events=events;this.governance=governance;}
    private Long tenant() {var c=contexts.requireCurrent();if(!c.hasAuthority("MASTER_DATA.MANAGE")||c.subjectId()==null) throw forbidden("QMED_KNOW_REVIEW_FORBIDDEN","需要药品主数据管理权限及明确的操作者身份");return c.tenantId();}
    private KnowledgeRuleCandidate require(Long tenant,Long id) {
        var c=candidates.find(tenant,id).orElseThrow(()->notFound("QMED_KNOW_REVIEW_CANDIDATE","未找到当前租户的知识候选"));
        if(!Objects.equals(c.id(),id)||!c.programHash().equals(hash(json.write(c.program())))||!c.knowledgeHash().equals(hash(json.write(c.knowledge())))) throw conflict("QMED_KNOW_REVIEW_INTEGRITY","候选身份或冻结指纹不一致");
        return c;
    }
    public Preview preview(Long id) {
        var tenant=tenant();var c=require(tenant,id);var gaps=new ArrayList<String>();var issues=new ArrayList<Issue>();
        var detail=drafts.detail(c.knowledgeId());issues.addAll(detail.currentAssessment().issues());
        if(detail.saved().version()!=c.knowledge().version()||!hash(json.write(detail.saved())).equals(c.knowledgeHash())) gaps.add("来源知识已有变化，请核对后生成新的候选版本");
        if(!issues.isEmpty()) gaps.add("当前标准或知识结构存在缺口");
        if(issues.isEmpty()&&detail.saved().version()==c.knowledge().version()&&!hash(json.write(MedicationKnowledgeRuleCompiler.compile(detail.saved().body(),detail.currentAssessment()))).equals(c.programHash())) gaps.add("当前编译表达与冻结候选不一致，请核查编译版本");
        if(!MedicationKnowledgeRuleCompiler.VERSION.equals(c.program().schemaVersion())) gaps.add("当前编译/执行版本已变化，请重新生成并验证候选");
        if(c.cases().isEmpty()||c.cases().stream().anyMatch(v->!v.passed())) gaps.add("候选结构样例未全部通过");
        Run run=null;var status=tests.status(tenant,id);
        if(status.runId()==null) gaps.add(status.suiteVersion()==0?"尚未编写人工验证样例":"最新人工样例尚未运行");
        else {
            run=tests.run(tenant,id,status.runId()).orElseThrow(()->conflict("QMED_KNOW_REVIEW_TEST","验证记录不存在"));
            var suite=tests.suite(tenant,id,status.suiteVersion()).orElseThrow(()->conflict("QMED_KNOW_REVIEW_TEST","样例记录不存在"));
            if(!Objects.equals(run.candidateId(),id)||!run.programHash().equals(c.programHash())||!run.knowledgeHash().equals(c.knowledgeHash())||!run.engineVersion().equals(c.program().schemaVersion())||!run.suiteHash().equals(hash(json.write(suite)))||!run.suite().equals(suite)) gaps.add("人工验证记录与候选或最新样例指纹不一致");
            if(!run.allPassed()||run.results().size()!=suite.cases().size()||run.results().isEmpty()||run.results().stream().anyMatch(r->!r.passed())) gaps.add("最新人工验证有失败项");
            var required=new LinkedHashSet<>(List.of("MATCH","NO_MATCH","UNAVAILABLE"));
            if(c.program().age().mode()==AgeMode.RANGE||c.program().effectiveFrom()!=null||c.program().effectiveTo()!=null) required.add("NOT_APPLICABLE");
            suite.cases().forEach(f->required.remove(f.expectedOutcome()));
            if(!required.isEmpty()) gaps.add("人工样例尚未覆盖主要预期结果："+String.join("、",required.stream().map(v->switch(v){case "MATCH"->"命中";case "NO_MATCH"->"未命中";case "UNAVAILABLE"->"不可评价";default->"不适用";}).toList()));
        }
        if(c.actorId()==null||c.knowledge().actorId()==null||run!=null&&(run.actorId()==null||run.suite().actorId()==null)) gaps.add("知识、候选或验证记录缺少作者身份，无法核验职责分离");
        var basis=new Basis(c,run,detail.possibleConflicts(),fingerprint(c,run,detail.possibleConflicts()));
        var stored=governance.read(tenant,key(c));var review=stored.state().reviews().stream().filter(r->r.versionId().equals(id.toString())).findFirst().orElse(null);
        String state=review==null?"DRAFT":review.status();Event submission=null;Event latest=null;
        if(review!=null&&review.knowledgeReviewId()!=null) {
            var record=event(tenant,id,review.knowledgeReviewId());latest=record;
            submission="SUBMIT".equals(record.operation())?record:record.submissionId()==null?null:event(tenant,id,record.submissionId());
        }
        if("IN_REVIEW".equals(state)&&submission==null) gaps.add("待审核状态缺少提交材料，请核查治理记录");
        boolean same=submission!=null&&submission.basis().fingerprint().equals(basis.fingerprint());
        var restrictions=restrictions(submission==null?basis:submission.basis(),submission);
        var allowed=new ArrayList<String>();
        if(Set.of("DRAFT","REJECTED").contains(state)&&gaps.isEmpty()) allowed.add("SUBMIT");
        if("IN_REVIEW".equals(state)&&submission!=null) {
            if(Objects.equals(contexts.requireCurrent().subjectId(),submission.actorId())) allowed.add("WITHDRAW");
            if(restrictions.isEmpty()) {allowed.add("REJECT");if(same&&gaps.isEmpty()) allowed.add("APPROVE");}
        }
        return new Preview(stored.revision(),state,basis,List.copyOf(issues),List.copyOf(gaps),submission,latest,same,List.copyOf(allowed),restrictions);
    }
    private List<String> restrictions(Basis basis,Event submission) {
        var actor=contexts.requireCurrent().subjectId();var c=basis.candidate();var reasons=new ArrayList<String>();
        if(Objects.equals(actor,c.knowledge().actorId())) reasons.add("当前人员是来源知识作者");
        if(Objects.equals(actor,c.actorId())) reasons.add("当前人员是候选生成人员");
        if(basis.validation()!=null) {
            if(Objects.equals(actor,basis.validation().suite().actorId())) reasons.add("当前人员是人工样例作者");
            if(Objects.equals(actor,basis.validation().actorId())) reasons.add("当前人员是验证执行人员");
        }
        if(submission!=null&&Objects.equals(actor,submission.actorId())) reasons.add("当前人员是本次提交人");
        return List.copyOf(reasons);
    }
    public PageResult<Summary> history(Long id,int page) {var tenant=tenant();require(tenant,id);if(page<0) throw badRequest("QMED_KNOW_REVIEW_PAGE","分页参数无效");return events.history(tenant,id,page);}
    public Event event(Long id,Long eventId) {var tenant=tenant();require(tenant,id);return event(tenant,id,eventId);}
    private Event event(Long tenant,Long id,Long eventId) {
        var e=events.get(tenant,id,eventId).orElseThrow(()->notFound("QMED_KNOW_REVIEW_EVENT","未找到该候选的审核记录"));var b=e.basis();
        if(!Objects.equals(e.id(),eventId)||!Objects.equals(e.candidateId(),id)||b==null||!Objects.equals(b.candidate().id(),id)||!Objects.equals(b.fingerprint(),fingerprint(b.candidate(),b.validation(),b.possibleConflicts()))) throw conflict("QMED_KNOW_REVIEW_INTEGRITY","审核材料身份或指纹不一致，请核查原记录");
        return e;
    }
    private String fingerprint(KnowledgeRuleCandidate c,Run run,List<com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Conflict> conflicts) {return hash(json.write(c)+"\n"+json.write(run)+"\n"+json.write(conflicts));}
    @Transactional public Event command(Long id,Command input) {
        var tenant=tenant();var c=require(tenant,id);
        if(input==null||!Set.of("SUBMIT","APPROVE","REJECT","WITHDRAW").contains(Objects.toString(input.operation(),""))||blank(input.reason())||input.reason().length()>2000||input.expectedBasisHash()==null||!input.expectedBasisHash().matches("[a-f0-9]{64}")||input.assessment()!=null&&input.assessment().length()>4000) throw badRequest("QMED_KNOW_REVIEW_INPUT","请核对材料指纹并填写操作原因；原因最多 2000 字，审核意见最多 4000 字");
        // Serialize knowledge edits and candidate suite/run writes while pinning review material.
        candidates.lockKnowledge(tenant,c.knowledgeId());tests.lock(tenant,id);
        var preview=preview(id);
        if(input.expectedRevision()!=preview.revision()) throw conflict("QMED_KNOW_REVIEW_STALE","审核状态已变化，请刷新");
        if(!preview.allowedOperations().contains(input.operation())) throw conflict("QMED_KNOW_REVIEW_OPERATION","当前不能执行此审核操作，请核对状态、依据缺口及职责分离要求");
        var submission=preview.submission();var basis="SUBMIT".equals(input.operation())?preview.current():submission.basis();
        if(!basis.fingerprint().equals(input.expectedBasisHash())) throw conflict("QMED_KNOW_REVIEW_STALE","审核材料已变化，请刷新并重新核对");
        boolean approve="APPROVE".equals(input.operation());
        if(approve&&(!Boolean.TRUE.equals(input.standardVerified())||!Boolean.TRUE.equals(input.evidenceVerified())||!Boolean.TRUE.equals(input.testsVerified())||blank(input.assessment())||!action(input.action())||!action(input.unavailableAction()))) throw badRequest("QMED_KNOW_REVIEW_CHECKS","须核对标准、原文与适用条件、人工验证，并明确命中及无法评价策略、填写药学审核意见");
        var actor=contexts.requireCurrent();var now=Instant.now();
        var record=new Event(GlobalIds.next(),id,input.operation(),"SUBMIT".equals(input.operation())?null:submission.id(),basis,approve?input.action():null,approve?input.unavailableAction():null,approve,approve,approve,approve?input.assessment().strip():null,actor.subjectId(),actor.actor(),now,input.reason().strip());
        String state=switch(input.operation()) {case "SUBMIT"->"IN_REVIEW";case "APPROVE"->"APPROVED";case "REJECT"->"REJECTED";case "WITHDRAW"->"DRAFT";default->throw badRequest("QMED_KNOW_REVIEW_OPERATION","不支持的审核操作");};
        var original=governance.read(tenant,key(c));var reviews=new ArrayList<>(original.state().reviews());reviews.removeIf(r->r.versionId().equals(id.toString()));
        var evidence=new ArrayList<com.rhn.outpatient.api.MedicationSafetyDecision.Evidence>();
        if(approve) {var e=c.knowledge().body().evidence();evidence.add(new com.rhn.outpatient.api.MedicationSafetyDecision.Evidence(e.sourceType(),e.title(),e.edition(),e.locator(),e.publisher(),e.excerpt(),"INSTITUTION_POLICY".equals(e.sourceType())?"INSTITUTION_POLICY":"CLINICAL_EVIDENCE"));}
        reviews.add(new Review(id.toString(),state,record.action(),List.copyOf(evidence),approve,approve,actor.subjectId(),now,record.reason(),record.id()));
        var history=new ArrayList<>(original.state().history());history.add(new AuditEvent(record.id(),input.operation(),id.toString(),actor.subjectId(),now,record.reason()));
        events.append(tenant,record);governance.save(tenant,key(c),input.expectedRevision(),new Governance(reviews,original.state().deployments(),history));
        return record;
    }
    private String key(KnowledgeRuleCandidate c) {return "KNOWLEDGE:"+c.knowledgeId();}
    private boolean blank(String s) {return s==null||s.isBlank();}
    private boolean action(String s) {return Set.of("WARN","REQUIRE_OVERRIDE","BLOCK").contains(Objects.toString(s,""));}
}
