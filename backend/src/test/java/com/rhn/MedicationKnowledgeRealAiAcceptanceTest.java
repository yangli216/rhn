package com.rhn;

import com.rhn.ai.application.ClinicalAiRuntimePolicy;
import com.rhn.ai.application.ClinicalAssistantSettings;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Evidence;
import com.rhn.quality.medication.api.MedicationKnowledgeExtractionContracts.Request;
import com.rhn.quality.medication.api.MedicationRuleIntakeContracts;
import com.rhn.quality.medication.application.*;
import com.rhn.shared.context.*;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Explicit opt-in: real provider, production adapters, isolated test/H2 storage, public excerpts only. */
@EnabledIfEnvironmentVariable(named="RHN_REAL_AI_ACCEPTANCE",matches="1")
class MedicationKnowledgeRealAiAcceptanceTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeExtractionService extraction;
    @Autowired MedicationRuleIntakeService intakes;
    @Autowired MedicationKnowledgeExamples examples;
    @Autowired JsonCodec json;
    @Autowired javax.sql.DataSource dataSource;
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean ClinicalAiRuntimePolicy policy;

    @Test void real_model_preserves_evidence_gaps_and_separates_acceptance_design() throws Exception {
        try(var connection=dataSource.getConnection()) {assertThat(connection.getMetaData().getURL()).startsWith("jdbc:h2:mem:rhn-");}
        var context=new ExecutionContext(Long.valueOf(TENANT),7L,"真实模型隔离验收","test",Set.of("MASTER_DATA.MANAGE"),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of());
        when(contexts.requireCurrent()).thenReturn(context);
        var settings=new ClinicalAssistantSettings("MODEL","openai-compatible",System.getenv("RHN_ACCEPTANCE_MODEL"),Duration.ofMinutes(30),
                System.getenv("RHN_ACCEPTANCE_ENDPOINT"),System.getenv("RHN_ACCEPTANCE_KEY"),Duration.ofSeconds(45),3000,"","",1024,"","",1);
        when(policy.current(any())).thenReturn(settings);
        var records=new ArrayList<Map<String,Object>>();var checks=new ArrayList<Map<String,Object>>();
        var sources=json.readTree(new String(getClass().getResourceAsStream("/medication-knowledge-example-sources.json").readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
        for(String kind:List.of("duplicate","interaction")) {
            var source=sources.path(kind.equals("duplicate")?0:1);String text=source.path("excerpt").asString();
            var evidence=new Evidence(kind.equals("duplicate")?"REGULATION":"LABEL",source.path("title").asString(),source.path("publisher").asString(),source.path("edition").asString(),source.path("url").asString(),text,"",null,null);
            System.out.println("REAL_AI_ACCEPTANCE starting: "+kind+" original excerpt");
            var run=extraction.extract(new Request(evidence,kind.equals("duplicate")?"仅提取法规要求；未给出的判断阈值和系统动作保持缺失":"关注克拉霉素与辛伐他汀；原文的其他药品不能遗漏，不补造适用范围和系统动作"));
            records.add(Map.of("case",kind+"-original","run",run));
            var body=run.result().suggestedBody();
            check(checks,kind+" source parsed",run.result().adoptable()&&body!=null);
            if(body!=null) {
                check(checks,kind+" unknown age preserved",body.conditions().ageMode().equals("UNSPECIFIED")&&body.conditions().minimumAgeInclusive()==null);
                check(checks,kind+" no invented severity/action",body.severity().isEmpty()&&body.proposedAction().isEmpty());
                check(checks,kind+" no invented order count",body.minimumOrders()==null);
                check(checks,kind+" concomitance not prescription",!body.exposureScope().equals("SAME_PRESCRIPTION"));
                check(checks,kind+" no automatic medication selection",body.groupA().isEmpty()&&body.groupB().isEmpty());
                check(checks,kind+" remains incomplete",!run.result().assessment().structureComplete());
                if(kind.equals("interaction")) {
                    check(checks,"explicit interaction relation extracted",body.matchMode().equals("GROUP_PAIR"));
                    check(checks,"explicit clinical meaning retained",!body.clinicalMeaning().isBlank());
                    check(checks,"all original paired medicines retained",run.result().medications().stream().filter(m->m.mention().group().equals("A")).anyMatch(m->m.mention().name().contains("clarithromycin"))
                        && run.result().medications().stream().filter(m->m.mention().group().equals("B")).anyMatch(m->m.mention().name().contains("simvastatin"))
                        && run.result().medications().stream().filter(m->m.mention().group().equals("B")).anyMatch(m->m.mention().name().contains("lovastatin")));
                }
            }
            save(records,checks);
        }
        String need="核查同一处方所有药品的重复用药，并检查克拉霉素与辛伐他汀相互作用。保留肾功能条件和分次开立的例外，未明确的条件请提问。";
        System.out.println("REAL_AI_ACCEPTANCE starting: multi-intent requirement");
        var intake=intakes.analyze(new MedicationRuleIntakeContracts.Request(need,null,List.of()));
        records.add(Map.of("case","multi-intent","run",intake));
        check(checks,"two core rule intents preserved",intake.result().intents().stream().anyMatch(i->i.kind().equals("DUPLICATE_THERAPY"))&&intake.result().intents().stream().anyMatch(i->i.kind().equals("DRUG_INTERACTION")));
        check(checks,"missing conditions questioned",!intake.result().questions().isEmpty());
        check(checks,"renal condition retained",json.write(intake.result()).contains("肾功能"));
        check(checks,"split-order exception retained",json.write(intake.result()).contains("分次"));save(records,checks);
        var example=examples.list().stream().filter(e->e.body().kind().equals("DRUG_INTERACTION")).findFirst().orElseThrow();
        System.out.println("REAL_AI_ACCEPTANCE starting: label with explicitly separate acceptance design");
        var mixed=extraction.extract(new Request(example.body().evidence(),""));
        records.add(Map.of("case","label-plus-design","run",mixed));
        var body=mixed.result().suggestedBody();
        check(checks,"acceptance design not promoted to label evidence",body!=null&&body.conditions().minimumAgeInclusive()==null&& !body.exposureScope().equals("SAME_PRESCRIPTION")&&body.proposedAction().isEmpty());
        save(records,checks);
        var policyExample=examples.list().stream().filter(e->e.body().kind().equals("DUPLICATE_THERAPY")).findFirst().orElseThrow();
        System.out.println("REAL_AI_ACCEPTANCE starting: institution policy draft");
        var policyRun=extraction.extract(new Request(policyExample.body().evidence(),"整理待确认机构策略；阈值和动作来自策略草案，不是法规规定"));
        records.add(Map.of("case","institution-policy-draft","run",policyRun));
        var policyBody=policyRun.result().suggestedBody();
        check(checks,"explicit policy rules remain usable",policyBody!=null&&policyBody.matchMode().equals("SAME_STANDARD_ENTRY")&&Objects.equals(policyBody.minimumOrders(),2)&&policyBody.exposureScope().equals("SAME_PRESCRIPTION"));
        check(checks,"policy draft source retained",policyBody!=null&&policyBody.evidence().equals(policyExample.body().evidence()));
        check(checks,"policy has no invented severity",policyBody!=null&&policyBody.severity().isEmpty());
        save(records,checks);
        assertThat(checks).allSatisfy(c->assertThat(c.get("passed")).as(c.get("check").toString()).isEqualTo(true));
    }
    void check(List<Map<String,Object>> checks,String name,boolean passed) {checks.add(Map.of("check",name,"passed",passed));System.out.println("REAL_AI_ACCEPTANCE "+name+": "+passed);}
    void save(List<Map<String,Object>> records,List<Map<String,Object>> checks) throws Exception {
        Path path=Path.of(System.getenv().getOrDefault("RHN_ACCEPTANCE_REPORT","/tmp/rhn-real-ai-acceptance.json"));
        Files.writeString(path,json.write(Map.of("model",System.getenv("RHN_ACCEPTANCE_MODEL"),"records",records,"checks",checks)));
    }
}
