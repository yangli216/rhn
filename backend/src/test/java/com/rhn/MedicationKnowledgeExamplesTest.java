package com.rhn;

import com.rhn.quality.medication.application.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.Create;
import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.Execute;
import com.rhn.shared.context.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationKnowledgeExamplesTest extends RhnIntegrationTestSupport {
    @Autowired MedicationKnowledgeExamples examples;
    @Autowired MedicationKnowledgeDraftService drafts;
    @Autowired MedicationKnowledgeRuleService rules;
    @Autowired MedicationKnowledgeTestService tests;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean ExecutionContextProvider contexts;
    @BeforeEach void context() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(Long.valueOf(TENANT),7L,"example-author","test",
                Set.of("MASTER_DATA.MANAGE"),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));
    }
    @Test void examples_resolve_current_standards_and_expected_outcomes_without_persisting_clinical_data() throws Exception {
        int before=jdbc.queryForObject("select count(*) from RHN_AUD_MED_KNOW_DRAFT",Integer.class);
        var values=examples.list();
        assertThat(values).hasSize(2);
        assertThat(values.stream().flatMap(v->v.results().stream()).toList()).hasSize(18).allMatch(value->value.passed());
        for(var example:values) {
            assertThat(example.assessment().structureComplete()).isTrue();
            assertThat(example.body().proposedAction()).isEqualTo("WARN");
            assertThat(example.body().evidence().documentHash()).isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(example.sourceMaterial().getBytes(StandardCharsets.UTF_8))));
            assertThat(example.sourceMaterial()).contains("验收设计",example.sourceUrl());
        }
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_MED_KNOW_DRAFT",Integer.class)).isEqualTo(before);
        mockMvc.perform(get("/api/quality/medication-knowledge-drafts/examples").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
    }
    @Test void both_examples_can_be_saved_compiled_and_tested_through_the_existing_business_services() {
        for(var example:examples.list()) {
            var saved=drafts.save(null,new Save(0,example.body(),"隔离验收样例，尚未临床批准"));
            var preview=rules.preview(saved.saved().id(),1);
            var candidate=rules.create(saved.saved().id(),new Create(1,preview.programHash(),"验收规则编译"));
            var suite=tests.save(candidate.id(),new com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.Save(
                    0,candidate.programHash(),"预先定义的验收样例",example.manualCases()));
            var run=tests.execute(candidate.id(),new Execute(1,suite.suiteHash(),"运行验收样例"));
            assertThat(run.allPassed()).isTrue();
            assertThat(run.missingOutcomeKinds()).isEmpty();
        }
    }
}
