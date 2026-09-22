package com.rhn.quality.medication.application;

import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory;
import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory.Reference;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.forbidden;

/** Read-only acceptance material. Loading an example neither saves nor publishes a clinical rule. */
@Service
public class MedicationKnowledgeExamples {
    private final StandardMedicationReferenceDirectory standards;
    private final MedicationKnowledgeDraftValidator validator;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    public MedicationKnowledgeExamples(StandardMedicationReferenceDirectory standards, MedicationKnowledgeDraftValidator validator,
            ExecutionContextProvider contexts, JsonCodec json) {
        this.standards=standards; this.validator=validator; this.contexts=contexts; this.json=json;
    }
    public record Example(String id, String purpose, List<String> notes, String sourceUrl, String sourceMaterial,
            Body body, Assessment assessment, Map<String,String> medicationLabels,
            List<MedicationKnowledgeTestContracts.Case> manualCases, List<TestCase> results) {}

    public List<Example> list() {
        var context=contexts.requireCurrent();
        if(!context.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("QMED_KNOWLEDGE_FORBIDDEN","需要药品主数据管理权限");
        try {
            var source=json.readTree(new ClassPathResource("medication-knowledge-example-sources.json").getContentAsString(StandardCharsets.UTF_8));
            return List.of(build(false,source.get(0),context.tenantId()),build(true,source.get(1),context.tenantId()));
        } catch(java.io.IOException e) { throw new IllegalStateException("验收依据文件不可读取",e); }
    }

    private Example build(boolean interaction, tools.jackson.databind.JsonNode source, Long tenant) {
        // Explicitly selected specifications; a catalog change is resolved and validated on every read.
        var sim10=reference("STD-78B889C4166435361ACEB31E","辛伐他汀","10mg");
        var sim20=reference("STD-D4691543A9AC285BFF194ADC","辛伐他汀","20mg");
        var clar=reference("STD-CE0B9F77222F0E14AC9A121A","克拉霉素","0.25g(25万单位)");
        var notes=interaction ? List.of(
                "说明书的合用禁忌是医学依据；年龄≥18岁、仅口服、克拉霉素0.25g片与辛伐他汀10mg片是本次验收范围设计，并非说明书限定的全部风险范围。",
                "当前只能发现同张处方配对，尚不判断实际用药时间是否重叠，也不查询跨处方在用药。样例建议提醒核对，不能把同处方直接认定为实际合用或自动批准继续合用。",
                "英文药名与中文标准条目的对应及国内产品适用性仍须药师确认；这是人工编写的验收样例，不是 AI 生成结果，也不是已获批准的机构规则。")
            : List.of(
                "处方管理办法要求审核重复给药；两条医嘱、同标准条目、所有年龄及途径、提醒动作是本次验收策略设计，并非法规给出的判定阈值。",
                "同条目的不同规格合并计数；同一医嘱重复传入不重复计数。不同条目不按活性成分自动合并，不覆盖复方成分重复或跨处方重复。",
                "命中只提示核对有意分次或分组开立，不能单凭医嘱条数认定不合理用药。机构策略尚待确认，样例不会自动生效。");
        String design=interaction
                ? "【验收范围设计，非说明书原文】仅演示成人（年龄≥18岁），A组口服克拉霉素片0.25g(25万单位)，B组口服辛伐他汀片10mg；同一处方出现两条不同有效医嘱时提醒核对实际合用。该筛查尚不能确定疗程重叠。"
                : "【验收策略草案，非法规原文】在同一处方中，所有年龄及途径的有效医嘱按同一标准条目分组；不同医嘱达到2条时提醒核对。不同规格合并，同一医嘱不重复计数；提醒不等于不合理用药判定。";
        String excerpt=source.path("excerpt").asString()+"\n\n"+design;
        String material="# "+source.path("title").asString()+"：验收来源摘录与范围设计\n\n"
                +"发布者："+source.path("publisher").asString()+"\n版次："+source.path("edition").asString()
                +"\n定位："+source.path("section").asString()+"\n链接："+source.path("url").asString()
                +"\n查阅日期："+source.path("retrieved").asString()+"\n\n## 已核对原文摘录\n\n"+source.path("excerpt").asString()
                +"\n\n## 验收设计（不属于上述原文）\n\n"+design+"\n\n"+String.join("\n\n",notes)
                +"\n\n本文件为摘录及验收方案，SHA-256 对应本文件 UTF-8 字节，不是原始官方说明书或法规全文文件。\n";
        var evidence=new Evidence(interaction?"LABEL":"INSTITUTION_POLICY",
                interaction?"克拉霉素说明书摘录＋验收范围设计":"重复开立核对验收策略草案（参考处方管理办法）",
                source.path("publisher").asString()+"；验收设计：本项目待确认方案",source.path("edition").asString(),
                source.path("url").asString()+"；"+source.path("section").asString()+"；指纹对应可下载的摘录与方案文件",excerpt,sha(material),null,null);
        var all=new RouteCondition("ALL",List.of()); var oral=new RouteCondition("LIST",List.of("ORAL"));
        var body=new Body(interaction?"验收：克拉霉素片与辛伐他汀片合用禁忌核对":"验收：同标准条目重复开立核对",
                interaction?"DRUG_INTERACTION":"DUPLICATE_THERAPY",interaction?"GROUP_PAIR":"SAME_STANDARD_ENTRY",
                interaction?List.of(target(clar)):List.of(),interaction?List.of(target(sim10)):List.of(),interaction?null:2,
                "SAME_PRESCRIPTION",new Conditions(interaction?"RANGE":"ALL","YEAR",interaction?18:null,null,interaction?oral:all,interaction?oral:all,""),
                evidence,interaction?"同处方出现目标配对，需要核对是否实际合用；说明书列为合用禁忌，应联系医师处理。当前筛查不判断疗程重叠；不得将提醒确认视为允许合用。"
                    :"发现同标准条目重复开立，核对是否有意分次或分组；不得仅凭条数判为不合理用药。",
                interaction?"HIGH":"MEDIUM","WARN");
        var labels=new LinkedHashMap<String,String>();
        for(var ref:List.of(sim10,sim20,clar)) labels.put(ref.specificationId(),ref.name()+" · "+ref.preparationSpec()+" · 片剂");
        var assessment=validator.assess(tenant,body);
        var a=row("A",interaction?clar:sim10,"ORAL","ACTIVE");var b=row("B",interaction?sim10:sim20,"ORAL","ACTIVE");
        var cases=new ArrayList<MedicationKnowledgeTestContracts.Case>();
        add(cases,labels,"正例：两条目标医嘱",30,"MATCH",List.of("A","B"),a,b);
        add(cases,labels,"顺序反转仍命中",30,"MATCH",List.of("A","B"),b,a);
        add(cases,labels,"反例：只有一条",30,"NO_MATCH",List.of(),a);
        add(cases,labels,"反例：重复传入同一医嘱",30,"NO_MATCH",List.of(),a,a);
        add(cases,labels,"反例：第二条已撤销",30,"NO_MATCH",List.of(),a,row("B",interaction?sim10:sim20,"ORAL","CANCELLED"));
        add(cases,labels,"信息不足：标准身份缺失",30,"UNAVAILABLE",List.of(),a,new Row("B",null,null,null,null,null,"ORAL","ACTIVE"));
        if(interaction) {
            add(cases,labels,"范围边界：其他规格未纳入本次样例",30,"NO_MATCH",List.of(),a,row("B",sim20,"ORAL","ACTIVE"));
            add(cases,labels,"年龄边界：18岁纳入",18,"MATCH",List.of("A","B"),a,b);
            add(cases,labels,"年龄边界：17岁不在样例范围",17,"NOT_APPLICABLE",List.of(),a,b);
            add(cases,labels,"信息不足：年龄未知",null,"UNAVAILABLE",List.of(),a,b);
            add(cases,labels,"信息不足：B组途径未知",30,"UNAVAILABLE",List.of(),a,row("B",sim10,null,"ACTIVE"));
        } else add(cases,labels,"反例：不同标准条目",30,"NO_MATCH",List.of(),a,row("B",clar,"ORAL","ACTIVE"));
        var results=cases.stream().map(c->{
            var f=c.input();var facts=new Facts(f.age()==null?null:f.age().intValueExact(),f.ageUnit(),f.date(),f.medications());
            var actual=MedicationKnowledgeDraftPreview.evaluate(body,assessment,facts);
            return new TestCase(c.title(),facts,c.expectedOutcome(),actual,c.expectedOutcome().equals(actual.outcome())
                    && new HashSet<>(c.expectedOrderIds()).equals(new HashSet<>(actual.matchedOrderIds())));
        }).toList();
        return new Example(interaction?"interaction":"duplicate",interaction?"核对明确药品配对的相互作用风险":"核对标准身份下的重复开立",
                notes,source.path("url").asString(),material,body,assessment,labels,List.copyOf(cases),results);
    }
    private Reference reference(String id,String name,String specification) {
        var r=standards.requireSpecification(id);
        if(!name.equals(r.name())||!specification.equals(r.preparationSpec())||!"TABLET".equals(r.doseForm()))
            throw new IllegalStateException("验收药品与当前标准不一致，请重新核对："+name);
        return r;
    }
    private static Target target(Reference r) {return new Target("SPECIFICATION",r.specificationId(),r.catalogId(),r.catalogVersion(),r.contentHash());}
    private static Row row(String id,Reference r,String route,String status) {return new Row(id,r.catalogId(),r.catalogVersion(),r.contentHash(),r.entryId(),r.specificationId(),route,status);}
    private static void add(List<MedicationKnowledgeTestContracts.Case> cases,Map<String,String> labels,String title,Integer age,String outcome,List<String> ids,Row...rows) {
        cases.add(new MedicationKnowledgeTestContracts.Case(title,"人工预先定义的验收期望，仅验证上述范围；不构成真实处方或临床结论。",
                new MedicationKnowledgeTestContracts.FixtureInput(age==null?null:BigDecimal.valueOf(age),"YEAR",LocalDate.of(2026,9,21),List.of(rows)),outcome,ids,labels));
    }
    private static String sha(String text) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException e) {throw new IllegalStateException(e);}
    }
}
