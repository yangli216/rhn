package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.quality.medication.infrastructure.MedicationWorkbenchStore;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory.Knowledge;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.api.BusinessException;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.Instant;
import com.rhn.quality.medication.infrastructure.MedicationRuleRegistry;
import com.rhn.quality.medication.infrastructure.MedicationEvaluationStore;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MedicationWorkbenchService {
    private final MedicationRuleAuthoringAi ai;
    private final MedicationKnowledgeDirectory knowledge;
    private final ExecutionContextProvider contexts;
    private final MedicationWorkbenchStore store;
    private final MedicationRuleRegistry registry;
    private final MedicationEvaluationStore evaluationStore;
    private final JsonCodec json;
    private final MedicationCandidateEvaluator evaluator=new MedicationCandidateEvaluator();
    private final MedicationSafetyCategoryService safetyCategories;
    private final MedicationSafetyEngine activeRuleEngine;

    public MedicationWorkbenchService(MedicationRuleAuthoringAi ai, MedicationKnowledgeDirectory knowledge,
            ExecutionContextProvider contexts,
            MedicationWorkbenchStore store, JsonCodec json) {
        this(ai, knowledge, contexts, store, null, null, null, json);
    }

    @Autowired
    public MedicationWorkbenchService(MedicationRuleAuthoringAi ai, MedicationKnowledgeDirectory knowledge,
            ExecutionContextProvider contexts,
            MedicationWorkbenchStore store, MedicationRuleRegistry registry,
            MedicationEvaluationStore evaluationStore,
            @Autowired(required = false) MedicationSafetyCategoryService safetyCategories,
            JsonCodec json) {
        this.ai=ai; this.knowledge=knowledge; this.contexts=contexts;
        this.store=store; this.registry=registry; this.evaluationStore=evaluationStore;
        this.safetyCategories=safetyCategories; this.json=json;
        this.activeRuleEngine=MedicationSafetyEngine.standard(json, safetyCategories);
    }
    private void access() {
        if (!contexts.requireCurrent().hasAuthority("MASTER_DATA.MANAGE"))
            throw forbidden("QMED_WORKBENCH_FORBIDDEN","需要药品主数据管理权限才能使用规则工作台");
    }
    public MedicationRuleAuthoringAi.Status status() { access(); return ai.status(); }
    public List<MedicationKnowledgeDirectory.Knowledge> medications(String query) {
        access(); if(query!=null && query.length()>100) throw badRequest("QMED_QUERY_INVALID","搜索文本过长");
        return knowledge.search(query);
    }
    public List<ActiveRuleView> activeRules() {
        access();
        if (registry == null) return List.of();
        return registry.load(MedicationSafetyEngine.RULE_SET).stream()
                .map(v -> new ActiveRuleView(
                        v.definition().id(),
                        v.id(),
                        v.definition().code(),
                        v.definition().category(),
                        v.definition().title(),
                        v.version(),
                        v.ruleSetVersion(),
                        v.implementationKey(),
                        v.status(),
                        v.severity().name(),
                        v.decision().name(),
                        v.overridePolicy().name(),
                        v.effectiveFrom(),
                        v.effectiveTo(),
                        v.evidence()))
                .toList();
    }
    public List<EvaluationSummary> recentEvaluations() {
        access();
        if (evaluationStore == null) return List.of();
        return evaluationStore.findRecent(contexts.requireCurrent().tenantId(), 50);
    }

    public com.rhn.shared.api.PageResult<EvaluationSummary> evaluationPage(String mode,String decision,Long prescriptionId,Instant from,Instant to,int page,int size) {
        evaluationContext();
        if(page<0||page>100000||size<1||size>100)throw badRequest("QMED_EVAL_PAGE","分页参数无效");
        if(mode!=null&&!mode.isBlank()&&!Set.of("SHADOW","ENFORCED").contains(mode))throw badRequest("QMED_EVAL_MODE","审查模式无效");
        if(decision!=null&&!decision.isBlank()&&!Set.of("PASS","WARN","REQUIRE_OVERRIDE","BLOCK","UNAVAILABLE").contains(decision))throw badRequest("QMED_EVAL_DECISION","审查结论无效");
        if(from==null)from=Instant.now().minus(7,java.time.temporal.ChronoUnit.DAYS);
        if(to==null)to=Instant.now().plusSeconds(1);
        if(!from.isBefore(to)||java.time.Duration.between(from,to).compareTo(java.time.Duration.ofDays(90))>0)throw badRequest("QMED_EVAL_RANGE","请选择不超过90天的有效时间范围");
        return evaluationStore.page(contexts.requireCurrent(),mode,decision,prescriptionId,from,to,page,size);
    }
    public EvaluationDetail evaluationDetail(Long id) {
        evaluationContext();return evaluationStore.detail(contexts.requireCurrent(),id).orElseThrow(()->notFound("QMED_EVAL_NOT_FOUND","当前机构科室未找到该审查记录"));
    }
    private void evaluationContext() {
        access();var c=contexts.requireCurrent();
        if(c.organizationId()==null||c.departmentId()==null)throw badRequest("QMED_EVAL_CONTEXT","请先选择机构和科室");
        if(evaluationStore==null)throw badRequest("QMED_EVAL_UNAVAILABLE","审查记录服务不可用");
    }

    public ActiveRuleTrialRun activeRuleTrial(ActiveRuleTrialRequest request) {
        access();
        if (registry == null) throw badRequest("QMED_RULE_CATALOG_UNAVAILABLE", "在行规则目录不可用");
        if (request == null || request.items().isEmpty() || request.items().size() > 100
                || request.items().stream().anyMatch(Objects::isNull))
            throw badRequest("QMED_ACTIVE_TRIAL_INVALID", "请录入 1 至 100 条模拟处方明细");

        var allVersions = registry.load(MedicationSafetyEngine.RULE_SET);
        var requestedCodes = request.ruleCodes().stream().filter(Objects::nonNull).map(String::trim)
                .filter(value -> !value.isBlank()).distinct().toList();
        var versions = requestedCodes.isEmpty() ? allVersions : allVersions.stream()
                .filter(version -> requestedCodes.contains(version.definition().code())).toList();
        if (!requestedCodes.isEmpty() && versions.size() != requestedCodes.size())
            throw badRequest("QMED_ACTIVE_RULE_INVALID", "所选在行规则不存在或不属于当前规则集");

        var rows = new ArrayList<PrescriptionSafetySnapshot.MedicationItem>();
        for (int index = 0; index < request.items().size(); index++) {
            var item = request.items().get(index);
            if (item.medicationId() == null)
                throw badRequest("QMED_ACTIVE_TRIAL_INVALID", "第 " + (index + 1) + " 行请选择药品");
            Knowledge med;
            try { med = knowledge.require(item.medicationId()); }
            catch (BusinessException exception) {
                throw badRequest("QMED_ACTIVE_TRIAL_INVALID", "第 " + (index + 1) + " 行药品不存在、已停用或不属于当前租户");
            }
            rows.add(new PrescriptionSafetySnapshot.MedicationItem(
                    (long) index + 1, 0, item.medicationId(), null, null,
                    Objects.toString(item.status(), "DRAFT"), med.semanticStatus(), null, null,
                    null, item.routeCode(), null, item.routeCode() == null ? "UNRESOLVED" : "RESOLVED",
                    null, item.frequencyCode(), null, item.durationDays(), "DAY",
                    standardMedicationSnapshot(med), "{}", json.write(med.standardMappings()),
                    false, null, null));
        }

        var patient = request.patientContext();
        PrescriptionSafetySnapshot.PatientSafetyContext safetyContext = patient == null ? null
                : new PrescriptionSafetySnapshot.PatientSafetyContext(true, true, null,
                patient.activeAllergies().stream().map(value ->
                        new PrescriptionSafetySnapshot.AllergyFact(null, null, value, value, "ACTIVE")).toList(),
                patient.patientAgeYears(), patient.gender());
        var context = contexts.requireCurrent();
        var now = Instant.now();
        var snapshot = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION,
                context.tenantId(), GlobalIds.next(), 0, GlobalIds.next(), GlobalIds.next(), 1L, 1L,
                "DRAFT", rows, safetyContext);
        var result = activeRuleEngine.evaluateSelected(snapshot, versions, now);
        var cases = versions.stream().map(version -> {
            var execution = result.executions().stream()
                    .filter(value -> value.ruleCode().equals(version.definition().code())).findFirst().orElse(null);
            var findings = result.findings().stream()
                    .filter(value -> value.rule().definition().code().equals(version.definition().code())).toList();
            String failure = execution == null ? "RULE_EXECUTION_MISSING" : execution.failureCode();
            String decision = failure != null ? "UNAVAILABLE" : findings.isEmpty() ? "PASS" : version.decision().name();
            var matchedRows = findings.stream().flatMap(value -> value.medicationRequestIds().stream())
                    .map(Long::intValue).distinct().sorted().toList();
            var reasons = findings.stream().map(value -> value.message()).toList();
            return new ActiveRuleTrialCase(version.definition().code(), version.definition().title(), version.version(),
                    execution == null ? "UNAVAILABLE" : execution.outcome(), failure, decision, matchedRows, reasons);
        }).toList();
        return new ActiveRuleTrialRun("ACTIVE_RULE_SANDBOX", requestedCodes.isEmpty() ? "ALL" : "SELECTED", now,
                MedicationSafetyEngine.RULE_SET, result.decision().name(), cases);
    }
    private Candidate require(Long id) { access(); return store.require(contexts.requireCurrent().tenantId(),id); }
    public static void validateRule(RuleSpec rule) {
        if(rule==null || !Set.of("EXACT_GENERIC_DUPLICATE","ANTIMICROBIAL_MAX_DAYS","AGE_CONTRAINDICATION","CATEGORY_DUPLICATE","CATEGORY_CONFLICT").contains(Objects.toString(rule.template(),""))
                || !"WARN".equals(rule.decision()) || rule.maxAge()!=null
                || "AGE_CONTRAINDICATION".equals(rule.template()) && (rule.minAge()==null || rule.minAge()<0 || rule.minAge()>150)
                || rule.duplicateCount()<2 || rule.duplicateCount()>10
                || rule.name()==null || rule.name().isBlank() || rule.name().length()>120
                || rule.explanation()==null || rule.explanation().length()>2000
                || rule.message()==null || rule.message().isBlank() || rule.message().length()>500)
            throw badRequest("QMED_AI_RULE_INVALID","AI 候选规则未通过模板、动作或参数校验");
    }
    public TrialRun suite(Long id) {
        var candidate = require(id);
        validateRule(candidate.rule());
        var facts = facts(candidate);
        var med = candidate.medications().stream().map(m -> m.medication()).filter(m ->
                !"ANTIMICROBIAL_MAX_DAYS".equals(candidate.rule().template()) || m.antimicrobial() && m.antimicrobialMaxDays() != null && m.antimicrobialMaxDays() > 0)
                .findFirst().orElseThrow(() -> badRequest("QMED_KNOWLEDGE_MISSING", "缺少可试跑的药品事实"));
        var cases = new ArrayList<CaseResult>();
        var base = new TrialItem(med.id(), "DRAFT", BigDecimal.ONE, med.defaultRoute());

        switch (candidate.rule().template() != null ? candidate.rule().template() : "") {
            case "EXACT_GENERIC_DUPLICATE" -> {
                cases.add(runCase(candidate, "达到重复阈值", "WARN", Collections.nCopies(candidate.rule().duplicateCount(), base), facts));
                cases.add(runCase(candidate, "低于阈值（边界）", "PASS", Collections.nCopies(candidate.rule().duplicateCount() - 1, base), facts));
                var cancelled = new ArrayList<>(Collections.nCopies(candidate.rule().duplicateCount() - 1, base));
                cancelled.add(new TrialItem(med.id(), "CANCELLED", BigDecimal.ONE, med.defaultRoute()));
                cases.add(runCase(candidate, "撤销条目不计入", "PASS", cancelled, facts));
            }
            case "ANTIMICROBIAL_MAX_DAYS" -> {
                if (med.antimicrobialMaxDays() == null || med.antimicrobialMaxDays() <= 0) {
                    throw badRequest("QMED_KNOWLEDGE_MISSING", "所选药品主数据缺少抗菌药门诊疗程上限");
                }
                var limit = BigDecimal.valueOf(med.antimicrobialMaxDays());
                cases.add(runCase(candidate, "超过 HIS 疗程上限", "WARN", List.of(new TrialItem(med.id(), "DRAFT", limit.add(BigDecimal.ONE), med.defaultRoute())), facts));
                cases.add(runCase(candidate, "等于上限（边界）", "PASS", List.of(new TrialItem(med.id(), "DRAFT", limit, med.defaultRoute())), facts));
                cases.add(runCase(candidate, "缺少疗程", "UNAVAILABLE", List.of(new TrialItem(med.id(), "DRAFT", null, med.defaultRoute())), facts));
            }
            case "AGE_CONTRAINDICATION" -> {
                int limitAge = candidate.rule().minAge() != null ? candidate.rule().minAge() : 18;
                var childContext = new PatientSimulationContext(Math.max(0, limitAge - 2), "男", List.of());
                var adultContext = new PatientSimulationContext(limitAge + 2, "男", List.of());
                cases.add(runCase(candidate, "低于限制年龄（触发禁忌）", "WARN", List.of(base), facts, childContext));
                cases.add(runCase(candidate, "达到合规年龄（正常开立）", "PASS", List.of(base), facts, adultContext));
                cases.add(runCase(candidate, "缺少就诊年龄上下文", "UNAVAILABLE", List.of(base), facts, null));
            }
            case "CATEGORY_DUPLICATE" -> {
                int count = candidate.rule().duplicateCount() > 0 ? candidate.rule().duplicateCount() : 2;
                cases.add(runCase(candidate, "达到同类用药数量上限", "WARN", Collections.nCopies(count, base), facts));
                cases.add(runCase(candidate, "低于同类用药上限（边界）", "PASS", Collections.nCopies(Math.max(1, count - 1), base), facts));
                var cancelled = new ArrayList<>(Collections.nCopies(Math.max(1, count - 1), base));
                cancelled.add(new TrialItem(med.id(), "CANCELLED", BigDecimal.ONE, med.defaultRoute()));
                cases.add(runCase(candidate, "撤销条目不计入同类重复", "PASS", cancelled, facts));
            }
            default -> throw badRequest("QMED_TEMPLATE_UNSUPPORTED", "不支持的规则模板: " + candidate.rule().template());
        }
        cases.add(runCase(candidate, "缺少通用药标识", "UNAVAILABLE", List.of(new TrialItem(null, "DRAFT", BigDecimal.ONE, null)), facts));
        cases.add(runCase(candidate, "空处方", "UNAVAILABLE", List.of(), facts));
        return save(candidate, "SYNTHETIC", null, json.write(cases.stream().map(CaseResult::input).toList()), cases);
    }
    private CaseResult runCase(Candidate c, String name, String expected, List<TrialItem> input, Map<Long, MedicationSnapshot> facts) {
        return runCase(c, name, expected, input, facts, null);
    }
    private CaseResult runCase(Candidate c, String name, String expected, List<TrialItem> input, Map<Long, MedicationSnapshot> facts, PatientSimulationContext patientContext) {
        Long tenantId = contexts.requireCurrent().tenantId();
        var result = evaluator.evaluate(c.rule(), scope(c), input, facts, patientContext, identities(c), tenantId, safetyCategories);
        return new CaseResult(name, expected, result.decision(), expected.equals(result.decision()), result.matchedRows(), result.reasons(), input);
    }
    private String standardMedicationSnapshot(Knowledge knowledge) {
        var value = json.readObject(json.write(knowledge.medication()));
        value.put("clinicalSemantics", Map.of("standardReference", knowledge.standardReference()));
        return json.write(value);
    }
    private Map<Long, String> identities(Candidate candidate) {
        var result = new HashMap<Long,String>();
        for (var med : candidate.medications()) {
            var ref = med.standardReference();
            if (ref != null && ref.linked()) result.put(med.medication().id(),
                    String.join("|", ref.catalogId(), ref.catalogVersion(), ref.contentHash(), ref.specificationId()));
        }
        return result;
    }
    private List<Long> scope(Candidate c) { return c.medications().stream().map(m->m.medication().id()).toList(); }
    private Map<Long,MedicationSnapshot> facts(Candidate c) { return c.medications().stream().map(m->m.medication()).collect(Collectors.toMap(MedicationSnapshot::id,Function.identity())); }
    private TrialRun save(Candidate c,String mode,Long prescription,String input,List<CaseResult> cases) {
        String hash;
        try { hash=java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
        var run=new TrialRun(GlobalIds.next(),c.id(),mode,Instant.now(),prescription,hash,cases);
        var context=contexts.requireCurrent();store.appendRun(context.tenantId(),context.subjectId(),run,input);return run;
    }
}
