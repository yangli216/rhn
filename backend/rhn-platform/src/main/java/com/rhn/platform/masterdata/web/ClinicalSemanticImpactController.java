package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor;
import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor.Impact;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.platform.masterdata.api.ClinicalUsageStandardDirectory;
import com.rhn.platform.masterdata.api.ClinicalSemanticDependencyReport;
import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor.Dependency;
import org.springframework.security.access.prepost.PreAuthorize;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.time.Instant;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@RestController
@RequestMapping("/api/platform/master-data/clinical-semantics/impact")
public class ClinicalSemanticImpactController {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(ClinicalSemanticImpactController.class);
    private final ObjectProvider<ClinicalSemanticImpactContributor> contributors;
    private final ExecutionContextProvider contexts;
    private final ClinicalUsageStandardDirectory standards;
    public ClinicalSemanticImpactController(ObjectProvider<ClinicalSemanticImpactContributor> contributors,
                                           ExecutionContextProvider contexts, ClinicalUsageStandardDirectory standards) {
        this.contributors = contributors; this.contexts = contexts; this.standards = standards;
    }

    @GetMapping
    public List<Impact> impact(@RequestParam String kind, @RequestParam String conceptId) {
        contexts.requireCurrent();
        if (!Set.of("MEDICATION", "FREQUENCY", "ROUTE", "UNIT").contains(kind)
                || (!"UNIT".equals(kind) && !conceptId.matches("[1-9][0-9]{0,17}"))) {
            throw badRequest("SEMANTIC_IMPACT_CONCEPT_INVALID", "请提供有效的概念类型与标识");
        }
        var result = new ArrayList<>(contributors.orderedStream().map(c -> c.describe(kind, conceptId)).toList());
        result.add(new Impact("ORDER_TEMPLATES", "UNAVAILABLE", null, List.of(), true,
                "模板尚未提供统一概念引用查询，不能据此判定没有模板受影响"));
        return List.copyOf(result);
    }
    @GetMapping("/references") @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    public ClinicalSemanticDependencyReport references(@RequestParam String kind,@RequestParam String conceptId,
            @RequestParam(defaultValue="ALL") String objectKind,@RequestParam(defaultValue="true") boolean includeHistory,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        if(!Set.of("ALL","MEDICATION","PRODUCT","FREQUENCY_CONFIGURATION","SEMANTIC_VERSION","KNOWLEDGE","RULE_VERSION","DEPLOYMENT").contains(objectKind)
                || page<0 || size<1 || size>100) throw badRequest("SEMANTIC_IMPACT_QUERY","筛选或分页参数无效");
        var scope=standards.resolve(kind,conceptId);var coverage=new ArrayList<Impact>();var rows=new ArrayList<Dependency>();
        for(var contributor:contributors.orderedStream().toList()) {
            try {var result=contributor.detail(kind,scope.conceptId());coverage.add(result.summary());rows.addAll(result.dependencies());}
            catch(RuntimeException unavailable) {
                log.warn("Clinical dependency source unavailable: contributor={}, kind={}, conceptId={}",contributor.getClass().getName(),kind,scope.conceptId(),unavailable);
                coverage.add(new Impact("DEPENDENCY_SOURCE_UNAVAILABLE","UNAVAILABLE",null,List.of(),true,"部分依赖来源读取失败，本次盘点不完整；请重试或人工补查"));
            }
        }
        coverage.add(new Impact("ORDER_TEMPLATES","UNAVAILABLE",null,List.of(),true,"模板尚无统一概念引用查询，不能判定没有影响"));
        rows.sort(Comparator.comparing(Dependency::kind).thenComparing(Dependency::id).thenComparing(d->java.util.Objects.toString(d.version(),"")));
        var totals=new LinkedHashMap<String,Integer>();
        for(String key:List.of("MEDICATION","PRODUCT","FREQUENCY_CONFIGURATION","SEMANTIC_VERSION","KNOWLEDGE","RULE_VERSION","DEPLOYMENT"))
            totals.put(key,(int)rows.stream().filter(r->key.equals(r.kind())).count());
        var filtered=rows.stream().filter(r->"ALL".equals(objectKind) || objectKind.equals(r.kind())).filter(r->includeHistory || !r.historical()).toList();
        return new ClinicalSemanticDependencyReport(scope,Instant.now(),contexts.requireCurrent().organizationId(),contexts.requireCurrent().departmentId(),coverage,
                List.of("当前是已存依赖盘点，不是拟修改内容的风险结论；不自动修改标准、药品、知识或发布记录",
                    "药品默认值不等于实际处方用法；历史冻结引用不等于正在使用；动态规则只标记潜在影响",
                    "在用医嘱仅统计当前工作机构/科室的草稿及有效项；未扫描全部历史处方或提供患者明细",
                    "模板、库存包装、价格、AI 抽取未采纳记录、知识回放审计和非结构化文本未纳入；单位未全量扫描复方成分映射及业务换算表；旧别名可能未精确归属",
                    "未返回明细的来源请查看覆盖状态；查询失败、未知或无匹配都不代表变更没有影响"),totals,
                (int)rows.stream().filter(Dependency::historical).count(),(int)rows.stream().filter(r->"POTENTIAL".equals(r.relation())).count(),
                filtered.stream().skip((long)page*size).limit(size).toList(),filtered.size(),(filtered.size()+size-1)/size,page,size);
    }

}
