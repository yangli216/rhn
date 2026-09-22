package com.rhn.quality.medication.application;

import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor;
import com.rhn.platform.masterdata.api.ClinicalUsageStandardDirectory;
import com.rhn.platform.masterdata.api.ClinicalUsageStandardDirectory.Scope;
import com.rhn.platform.masterdata.api.ClinicalDoseUnits;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.Candidate;
import com.rhn.quality.medication.infrastructure.MedicationKnowledgeDraftStore;
import com.rhn.quality.medication.infrastructure.MedicationRuleGovernanceStore;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

@Service
@Transactional(readOnly=true)
public class MedicationRuleImpactService implements ClinicalSemanticImpactContributor {
    private final MedicationRuleCatalogService rules; private final MedicationKnowledgeDraftStore knowledge;
    private final MedicationRuleGovernanceStore governance; private final ClinicalUsageStandardDirectory standards;
    private final ExecutionContextProvider contexts;
    public MedicationRuleImpactService(MedicationRuleCatalogService rules,MedicationKnowledgeDraftStore knowledge,
            MedicationRuleGovernanceStore governance,ClinicalUsageStandardDirectory standards,ExecutionContextProvider contexts) {
        this.rules=rules;this.knowledge=knowledge;this.governance=governance;this.standards=standards;this.contexts=contexts;
    }
    @Override public Impact describe(String kind,String conceptId) {
        if(!contexts.requireCurrent().hasAuthority("MASTER_DATA.MANAGE")) return unavailable("需要基础数据管理权限查看知识及规则依赖；不能据此判定没有影响");
        try {return detail(kind,conceptId).summary();} catch(RuntimeException ex) {return unavailable("知识或规则依赖暂不可查询，请保留规则回归检查");}
    }
    private Impact unavailable(String note) {return new Impact("RULE_VERSIONS","UNAVAILABLE",null,List.of(),true,note);}
    @Override public DetailImpact detail(String kind,String conceptId) {
        var scope=standards.resolve(kind,conceptId);var context=contexts.requireCurrent();var rows=new ArrayList<Dependency>();
        var versions=knowledge.allVersions(context.tenantId());var latest=new HashMap<Long,Integer>();
        versions.forEach(v->latest.merge(v.id(),v.version(),Math::max));
        if("ROUTE".equals(kind)) for(var version:versions) {
            var refs=new ArrayList<Reference>();var conditions=version.body().conditions();
            if(conditions==null) refs.add(dynamic(scope,"知识适用条件","草稿未填写结构化条件，无法排除途径影响"));
            else {
                routes(scope,refs,"A 组途径",conditions.groupARoutes(),version.assessment().groupARoutes());
                if("DRUG_INTERACTION".equals(version.body().kind())) routes(scope,refs,"B 组途径",conditions.groupBRoutes(),version.assessment().groupBRoutes());
            }
            if(!refs.isEmpty()) rows.add(new Dependency("KNOWLEDGE",version.id().toString(),null,version.body().title(),Integer.toString(version.version()),version.status(),version.version()<latest.get(version.id()),
                    refs.stream().anyMatch(r->r.conceptId()!=null)?"FROZEN_REFERENCE":"POTENTIAL",refs));
        }
        var catalog=rules.catalog();var names=new HashMap<String,String>();
        for(var entry:catalog.rules()) {
            names.put(entry.key(),entry.name());int newest=entry.versions().stream().mapToInt(v->v.version()).max().orElse(0);
            for(var version:entry.versions()) {
                var refs=new ArrayList<>(candidate(scope,version.candidate()));
                if(version.knowledgeCandidate()!=null && "ROUTE".equals(kind)) {
                    var frozen=version.knowledgeCandidate().knowledge();var conditions=frozen.body().conditions();
                    routes(scope,refs,"规则冻结 A 组途径",conditions.groupARoutes(),frozen.assessment().groupARoutes());
                    if("DRUG_INTERACTION".equals(frozen.body().kind())) routes(scope,refs,"规则冻结 B 组途径",conditions.groupBRoutes(),frozen.assessment().groupBRoutes());
                }
                rows.add(new Dependency("RULE_VERSION",version.id(),entry.key(),version.name(),Integer.toString(version.version()),version.reviewStatus(),version.version()<newest,
                        refs.stream().anyMatch(r->r.conceptId()!=null)?"FROZEN_REFERENCE":"POTENTIAL",refs.isEmpty()?List.of(dynamic(scope,"规则执行依赖","尚无逐概念依赖声明，可能动态读取处方事实；列入回归待复核，不等于条件直接引用该标准")):refs));
            }
        }
        var now=Instant.now();
        // Releases remain discoverable when the rule's current catalog entry is absent.
        for(var stored:governance.all(context.tenantId())) for(var release:stored.state().deployments()) {
            String status=!"ACTIVE".equals(release.status())?release.status():release.effectiveTo()!=null && !now.isBefore(release.effectiveTo())?"EXPIRED":now.isBefore(release.effectiveFrom())?"SCHEDULED":"ACTIVE";
            var refs=new ArrayList<>(candidate(scope,release.candidate()));
            if(release.knowledgeRelease()!=null && "ROUTE".equals(kind)) {
                var frozen=release.knowledgeRelease().approval().basis().candidate().knowledge();var conditions=frozen.body().conditions();
                routes(scope,refs,"发布冻结 A 组途径",conditions.groupARoutes(),frozen.assessment().groupARoutes());
                if("DRUG_INTERACTION".equals(frozen.body().kind())) routes(scope,refs,"发布冻结 B 组途径",conditions.groupBRoutes(),frozen.assessment().groupBRoutes());
            }
            boolean precise=refs.stream().anyMatch(r->r.conceptId()!=null);
            if(refs.isEmpty()) refs.add(dynamic(scope,"发布冻结规则","发布未声明逐概念依赖，保留为潜在影响待复核，不用当前候选替换冻结内容"));
            refs.add(new Reference("发布范围与时间",null,null,null,null,null,
                    modeName(release.mode())+"；机构 "+release.organizationId()+" / 科室 "+Objects.toString(release.departmentId(),"全部")+"；"+release.effectiveFrom()+" 至 "+Objects.toString(release.effectiveTo(),"长期")));
            rows.add(new Dependency("DEPLOYMENT",release.id().toString(),stored.key(),names.getOrDefault(stored.key(),"目录条目缺失 · "+stored.key()),Integer.toString(release.version()),status,
                    Set.of("EXPIRED","PAUSED","SUPERSEDED").contains(status),precise?"FROZEN_REFERENCE":"POTENTIAL",refs));
        }
        return new DetailImpact(new Impact("RULE_VERSIONS","KNOWLEDGE_AND_GOVERNANCE",null,rows.stream().filter(r->"RULE_VERSION".equals(r.kind())).map(r->r.id()+":"+r.version()).toList(),true,
                "包含全部已存知识版本、规则目录版本和发布快照；知识目前仅有结构化途径依赖，频次与单位的自由文本不作精确匹配。无依赖声明的规则均列潜在影响；冻结药品默认值的引用不证明规则条件使用了该字段。"),rows);
    }
    private void routes(Scope scope,List<Reference> refs,String location,RouteCondition condition,List<RouteSnapshot> frozen) {
        var saved=frozen==null?List.<RouteSnapshot>of():frozen;
        for(var route:saved) if(scope.conceptId().equals(route.id().toString())) refs.add(new Reference(location,route.id().toString(),route.code(),route.systemCode(),route.systemVersion(),null,"保存知识时已解析的标准途径身份与版本"));
        if(condition==null || !"LIST".equals(condition.mode())) {refs.add(dynamic(scope,location,condition!=null && "ALL".equals(condition.mode())?"不限途径的动态范围；需核对标准变更是否影响适用范围":"途径条件尚未结构化，无法精确排除影响"));return;}
        if(scope.code()!=null && condition.codes()!=null && condition.codes().contains(scope.code()) && saved.stream().noneMatch(r->scope.conceptId().equals(r.id().toString())))
            refs.add(new Reference(location,null,scope.code(),null,null,null,"保存了相同途径编码，但未解析为本次标准身份；需复核术语来源和版本"));
    }
    private List<Reference> candidate(Scope s,Candidate candidate) {
        if(candidate==null || candidate.medications()==null) return List.of();var refs=new ArrayList<Reference>();
        for(var k:candidate.medications()) {
            var m=k.medication();String location="冻结药品 "+m.name()+"（"+m.id()+"）";
            if("MEDICATION".equals(s.kind()) && s.conceptId().equals(m.id().toString())) refs.add(new Reference(location,m.id().toString(),m.code(),null,null,null,"候选或发布中冻结的药品身份"));
            if("FREQUENCY".equals(s.kind()) && (s.conceptId().equals(Objects.toString(m.defaultFrequencyId(),"")) || s.code()!=null && s.code().equalsIgnoreCase(Objects.toString(m.defaultFrequency(),""))))
                refs.add(new Reference(location+" · 默认频次",Objects.toString(m.defaultFrequencyId(),null),m.defaultFrequency(),null,null,null,"冻结的默认频次引用；不等于实际医嘱频次，也不证明规则直接以它为条件"));
            if("ROUTE".equals(s.kind()) && s.code()!=null && s.code().equals(m.defaultRoute())) refs.add(new Reference(location+" · 默认途径",null,m.defaultRoute(),null,null,null,"冻结的途径字面编码，未锁定术语来源版次，需人工核对"));
            if("UNIT".equals(s.kind())) {
                for(String raw:List.of(Objects.toString(m.defaultDoseUnit(),""),Objects.toString(m.strengthUnit(),"")))
                    if(ClinicalDoseUnits.resolve(raw).map(u->u.id().equals(s.conceptId())).orElse(false)) refs.add(new Reference(location+" · 单位",null,raw,"UCUM",null,null,"冻结默认剂量/规格单位按当前词汇识别；不能自动迁移旧数值或推定规则直接依赖此单位"));
            }
        }
        return List.copyOf(refs);
    }
    private Reference dynamic(Scope scope,String location,String note) {return new Reference(location,null,null,null,null,null,note);}
    private String modeName(String mode) {return "SHADOW".equals(mode)?"旁路监控":Set.of("ENFORCED","LIVE").contains(mode)?"正式执行":mode;}
}
