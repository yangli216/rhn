package com.rhn.quality.medication.application;

import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory;
import com.rhn.platform.masterdata.api.MedicationStandardImpactDirectory;
import com.rhn.platform.masterdata.api.MedicationStandardImpactDirectory.*;
import com.rhn.shared.json.JsonCodec;
import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope;
import com.rhn.quality.medication.api.MedicationStandardImpactContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Version;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.Candidate;
import com.rhn.quality.medication.infrastructure.MedicationKnowledgeDraftStore;
import com.rhn.quality.medication.infrastructure.MedicationRuleGovernanceStore;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
@Transactional(readOnly = true)
public class MedicationStandardImpactService implements MedicationStandardImpactDirectory {
    private final MedicationStandardDependencyDirectory standards;
    private final MedicationKnowledgeDraftStore knowledge;
    private final MedicationRuleCatalogService rules;
    private final MedicationRuleGovernanceStore governance;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    public MedicationStandardImpactService(MedicationStandardDependencyDirectory standards, MedicationKnowledgeDraftStore knowledge,
            MedicationRuleCatalogService rules, MedicationRuleGovernanceStore governance, ExecutionContextProvider contexts, JsonCodec json) {
        this.standards = standards; this.knowledge = knowledge; this.rules = rules; this.governance = governance; this.contexts = contexts; this.json = json;
    }
    @Override public List<Area> capture(List<Scope> scopes) {
        return scopes.stream().map(scope -> {
            var report = report(scope, "ALL", true, 0, Integer.MAX_VALUE, false);
            return new Area(scope,
                    List.of("当前租户保存的药品、产品、全部知识版本、规则版本及部署；动态作用域列为潜在影响", "不包含修订审计本身，避免提交或复核动作制造自引用变化"),
                    report.limitations(), report.content());
        }).toList();
    }
    public Report inspect(Scope scope, String kind, boolean includeHistory, int page, int size) {
        if (!List.of("ALL","MEDICATION","PRODUCT","KNOWLEDGE","RULE_VERSION","DEPLOYMENT","STANDARD_REVISION").contains(kind) || page < 0 || size < 1 || size > 100)
            throw badRequest("QMED_IMPACT_QUERY", "影响清单筛选或分页参数无效");
        return report(scope, kind, includeHistory, page, size, true);
    }
    private Report report(Scope scope, String kind, boolean includeHistory, int page, int size, boolean includeRevisions) {
        var c = contexts.requireCurrent();
        if (!c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("QMED_IMPACT_FORBIDDEN", "需要药品主数据管理权限");
        var snapshot = includeRevisions ? standards.inspect(scope) : standards.inspectDependencies(scope); var rows = new ArrayList<Item>();
        var byMedication = new HashMap<String,List<Trace>>();
        for (var med : snapshot.medications()) {
            var traces = med.references().stream().map(r -> new Trace("STORED_REFERENCE", "药品标准关联", r.catalogId(), r.catalogVersion(), r.entryId(), r.specificationId(), r.contentHash(), "持久化的标准关联；停用或失效关联也须核对")).toList();
            byMedication.put(med.id().toString(), traces);
            rows.add(item("MEDICATION", med.id().toString(), null, med.name(), null, med.status(), false, traces, med));
        }
        for (var product : snapshot.products()) rows.add(item("PRODUCT", product.id().toString(), product.medicationId().toString(), product.name(), null, product.status(), false,
                byMedication.get(product.medicationId().toString()).stream().map(t -> new Trace("VIA_MEDICATION", "产品 → 药品 " + product.medicationId(), t.catalogId(), t.catalogVersion(), t.entryId(), t.specificationId(), t.contentHash(), "通过药品档案间接依赖该标准")).toList(), product));
        for (var revision : snapshot.revisions()) {
            var traces = new ArrayList<Trace>();
            revision.previous().forEach(r -> traces.add(revisionTrace(r,"修订前关联",revision.actor(),revision.recordedAt())));
            if(revision.target()!=null) traces.add(revisionTrace(revision.target(),"提交的目标（是否应用见状态）",revision.actor(),revision.recordedAt()));
            revision.resulting().forEach(r -> traces.add(revisionTrace(r,"事件完成时的实际关联",revision.actor(),revision.recordedAt())));
            rows.add(item("STANDARD_REVISION",revision.id().toString(),revision.medicationId().toString(),revision.name()+" · 关联修订",null,revision.status(),revision.historical(),List.copyOf(traces), revision));
        }
        var versions = knowledge.allVersions(c.tenantId()); var latest = new HashMap<Long,Integer>();
        versions.forEach(v -> latest.merge(v.id(), v.version(), Math::max));
        for (var version : versions) {
            var traces = knowledgeTraces(scope, version);
            if (!traces.isEmpty()) rows.add(item("KNOWLEDGE", version.id().toString(), null, version.body().title(), Integer.toString(version.version()), version.status(), version.version() < latest.get(version.id()), traces, version));
        }
        var now = Instant.now();
        var entries = rules.catalog().rules();
        var names = new HashMap<String,String>();
        for (var entry : entries) {
            names.put(entry.key(), entry.name());
            int newest = entry.versions().stream().mapToInt(v -> v.version()).max().orElse(0);
            for (var version : entry.versions()) {
                var traces = version.knowledgeCandidate() != null ? knowledgeTraces(scope, version.knowledgeCandidate().knowledge()) : version.candidate() == null ? dynamic("规则 " + entry.code()) : candidateTraces(scope, version.candidate(), byMedication);
                if (!traces.isEmpty()) rows.add(item("RULE_VERSION", version.id(), entry.key(), version.name(), Integer.toString(version.version()), version.reviewStatus(), version.version() < newest, traces, version));
            }
        }
        // Governance may outlive a removed candidate or a retired registry definition.
        for (var stored : governance.all(c.tenantId())) {
            for (var deployment : stored.state().deployments()) {
                // Inspect the frozen deployment, never replace it with today's candidate snapshot.
                var traces = deployment.knowledgeRelease() != null ? knowledgeTraces(scope, deployment.knowledgeRelease().approval().basis().candidate().knowledge()) : deployment.candidate() == null ? dynamic("发布记录的内置规则") : candidateTraces(scope, deployment.candidate(), byMedication);
                if (traces.isEmpty()) continue;
                String status = !"ACTIVE".equals(deployment.status()) ? deployment.status()
                        : deployment.effectiveTo() != null && !now.isBefore(deployment.effectiveTo()) ? "EXPIRED"
                        : now.isBefore(deployment.effectiveFrom()) ? "SCHEDULED" : "ACTIVE";
                rows.add(new Item("DEPLOYMENT", deployment.id().toString(), stored.key(), names.getOrDefault(stored.key(), "目录记录缺失 · " + stored.key()), Integer.toString(deployment.version()), status,
                        List.of("EXPIRED","PAUSED","SUPERSEDED").contains(status), matchType(traces), traces, deployment.mode(), deployment.organizationId(), deployment.departmentId(), deployment.effectiveFrom(), deployment.effectiveTo(), fingerprint(deployment)));
            }
        }
        rows.sort(Comparator.comparing(Item::kind).thenComparing(Item::id).thenComparing(Comparator.comparingInt((Item i) -> i.version() == null ? 0 : Integer.parseInt(i.version())).reversed()));
        var totals = new LinkedHashMap<String,Integer>();
        List.of("MEDICATION","PRODUCT","KNOWLEDGE","RULE_VERSION","DEPLOYMENT","STANDARD_REVISION").forEach(k -> totals.put(k, (int) rows.stream().filter(r -> k.equals(r.kind())).count()));
        var filtered = rows.stream().filter(r -> "ALL".equals(kind) || kind.equals(r.kind())).filter(r -> includeHistory || !r.historical()).toList();
        return new Report(scope, now, totals, (int) rows.stream().filter(Item::historical).count(), (int) rows.stream().filter(r -> "POTENTIAL".equals(r.matchType())).count(),
                List.of("当前租户全部已保存药品标准关联和关联产品，包含停用、冲突及旧目录版本", "全部知识草稿版本、在行规则目录全部版本、全部发布快照及标准关联修订审计", "同条目通用知识和内置规则列为动态范围待复核，不冒充精确引用"),
                List.of("这是已存依赖盘点，不是拟变更内容的语义差异分析，也不自动修改、停用或迁移任何对象", "未扫描知识回放审计及人工验证样例/结果、历史处方、住院医嘱、库存、包装、价格及机构采用关系；不能据此宣称变更无风险", "未关联标准或只在自由文本中提到药品的对象无法精确归属；无匹配记录不等于无影响", "清单跨目录版本汇总；查看引用版本和内容指纹后再决定修订范围，历史快照须保持不变"),
                filtered.stream().skip((long) page * size).limit(size).toList(), filtered.size(), (int) (((long) filtered.size() + size - 1) / size), page, size);
    }
    private Trace revisionTrace(MedicationStandardDependencyDirectory.Reference r,String location,String actor,Instant time) {
        return new Trace("FROZEN_REFERENCE",location,r.catalogId(),r.catalogVersion(),r.entryId(),r.specificationId(),r.contentHash(),
                "不可变修订审计："+actor+" · "+time+"；保留历史引用，不代表该关系当前仍有效");
    }
    private List<Trace> knowledgeTraces(Scope scope, Version version) {
        if ("SAME_STANDARD_ENTRY".equals(version.body().matchMode())) return List.of(new Trace("DYNAMIC_SCOPE", "同一标准条目通用知识", null,null,null,null,null,"适用于全部标准药品；需复核变更对身份归组的影响"));
        var traces = new ArrayList<Trace>();
        appendTargets(scope, traces, "A 组", version.body().groupA(), version.assessment().groupA());
        appendTargets(scope, traces, "B 组", version.body().groupB(), version.assessment().groupB());
        return List.copyOf(traces);
    }
    private void appendTargets(Scope scope, List<Trace> out, String group,
            List<com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Target> targets,
            List<com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.ResolvedTarget> resolved) {
        if (targets == null) return;
        for (var target : targets) {
            if (target == null || !scope.catalogId().equals(target.catalogId())) continue;
            var frozen = resolved.stream().filter(r -> Objects.equals(r.reference().specificationId(), target.specificationId()) && Objects.equals(r.level(), target.level())).findFirst();
            String entry = frozen.map(r -> r.reference().entryId()).orElse(null);
            boolean unknownEntry = entry == null && scope.entryId() != null;
            boolean matches = scope.entryId() == null || Objects.equals(scope.entryId(), entry);
            if (scope.specificationId() != null) matches &= "ENTRY".equals(target.level()) || Objects.equals(scope.specificationId(), target.specificationId());
            boolean uncertain = unknownEntry && (scope.specificationId() == null || "ENTRY".equals(target.level()) || Objects.equals(scope.specificationId(), target.specificationId()));
            if (matches || uncertain) out.add(new Trace(uncertain ? "UNRESOLVED_REFERENCE" : "FROZEN_REFERENCE", group + " · " + ("ENTRY".equals(target.level()) ? "整个标准条目" : "具体规格"), target.catalogId(), target.catalogVersion(), entry, target.specificationId(), target.contentHash(),
                    uncertain ? "保存时未解析出标准条目，需人工复核是否属于本次范围" : "使用保存时的范围和身份，不以当前目录覆盖历史引用"));
        }
    }
    private List<Trace> candidateTraces(Scope scope, Candidate candidate, Map<String,List<Trace>> current) {
        var result = new ArrayList<Trace>();
        if (candidate.medications() == null || candidate.medications().isEmpty())
            return List.of(new Trace("UNRESOLVED_REFERENCE", "候选规则药品范围", null,null,null,null,null,"缺少显式药品范围，无法排除本次变更影响，请人工核对"));
        for (var med : candidate.medications()) {
            var r = med.standardReference();
            if (r != null && scope.catalogId().equals(r.catalogId()) && (scope.entryId() == null || scope.entryId().equals(r.entryId())) && (scope.specificationId() == null || scope.specificationId().equals(r.specificationId())))
                result.add(new Trace("FROZEN_REFERENCE", "候选规则药品 " + med.medication().id(), r.catalogId(), r.catalogVersion(), r.entryId(), r.specificationId(), r.contentHash(), "规则或发布快照中显式保存的标准身份"));
            else if (current.containsKey(med.medication().id().toString())) for (var t : current.get(med.medication().id().toString()))
                result.add(new Trace("CURRENT_MEDICATION", "候选规则药品 " + med.medication().id(), t.catalogId(), t.catalogVersion(), t.entryId(), t.specificationId(), t.contentHash(), "规则引用了当前关联药品；其冻结标准与现关联可能不同，需复核"));
        }
        return List.copyOf(result);
    }
    private List<Trace> dynamic(String location) {return List.of(new Trace("DYNAMIC_SCOPE", location, null,null,null,null,null,"内置规则动态读取处方事实，尚无逐标准依赖声明；列入潜在影响待复核"));}
    private String matchType(List<Trace> traces) {return traces.stream().anyMatch(t -> List.of("STORED_REFERENCE","VIA_MEDICATION","FROZEN_REFERENCE").contains(t.relation())) ? "REFERENCED" : "POTENTIAL";}
    private String fingerprint(Object value) { return MedicationKnowledgeReplayService.hash(json.write(canonical(json.readTree(json.write(value))))); }
    private Object canonical(tools.jackson.databind.JsonNode node) {
        if(node.isObject()) {
            var result=new TreeMap<String,Object>();node.properties().forEach(entry->result.put(entry.getKey(),canonical(entry.getValue())));return result;
        }
        if(node.isArray()) {var result=new ArrayList<Object>();node.forEach(value->result.add(canonical(value)));return result;}
        if(node.isNull())return null;
        if(node.isNumber())return node.decimalValue().stripTrailingZeros();
        if(node.isBoolean())return node.asBoolean();
        return node.asString();
    }
    private Item item(String kind, String id, String parent, String name, String version, String status, boolean historical, List<Trace> traces, Object basis) {
        return new Item(kind,id,parent,name,version,status,historical,matchType(traces),traces,null,null,null,null,null,fingerprint(basis));
    }
}
