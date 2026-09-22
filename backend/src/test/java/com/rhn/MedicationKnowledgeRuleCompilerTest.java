package com.rhn;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.*;
import com.rhn.quality.medication.application.*;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import static com.rhn.MedicationKnowledgeDraftModelTest.*;
import static org.assertj.core.api.Assertions.*;

class MedicationKnowledgeRuleCompilerTest {
    @Test void compiled_pair_keeps_group_identity_routes_age_and_date_boundaries() {
        var fixture=new MedicationKnowledgeDraftModelTest();fixture.references();var b=interaction();var e=b.evidence();
        var from=LocalDate.of(2026,1,1);var to=LocalDate.of(2026,12,31);
        var body=new Body(b.title(),b.kind(),b.matchMode(),b.groupA(),b.groupB(),b.minimumOrders(),b.exposureScope(),
                new Conditions("RANGE","MONTH",1,12,new RouteCondition("LIST",List.of("PO")),new RouteCondition("LIST",List.of("IV")),""),
                new Evidence(e.sourceType(),e.title(),e.publisher(),e.edition(),e.locator(),e.excerpt(),e.documentHash(),from,to),b.clinicalMeaning(),b.severity(),b.proposedAction());
        var program=MedicationKnowledgeRuleCompiler.compile(body,fixture.validator.assess(1L,body));
        assertThat(program.operator()).isEqualTo(Operator.GROUP_PAIR);
        assertThat(program.groupA().targets().getFirst().level()).isEqualTo("ENTRY");
        assertThat(program.groupB().targets().getFirst().level()).isEqualTo("SPECIFICATION");
        assertThat(program.groupB().routes().getFirst().systemVersion()).isEqualTo("1");
        var rows=List.of(row("A","E1","S3","PO"),row("B","E2","S2","IV"));
        assertThat(MedicationKnowledgeRuleEngine.evaluate(program,new Facts(1,"MONTH",from,rows)).matchedOrderIds()).containsExactly("A","B");
        assertThat(MedicationKnowledgeRuleEngine.evaluate(program,new Facts(11,"MONTH",to,rows)).outcome()).isEqualTo("MATCH");
        assertThat(MedicationKnowledgeRuleEngine.evaluate(program,new Facts(12,"MONTH",from,rows)).outcome()).isEqualTo("NOT_APPLICABLE");
        assertThat(MedicationKnowledgeRuleEngine.evaluate(program,new Facts(1,"YEAR",from,rows)).outcome()).isEqualTo("UNAVAILABLE");
        assertThat(MedicationKnowledgeRuleEngine.evaluate(program,new Facts(1,"MONTH",to.plusDays(1),rows)).outcome()).isEqualTo("NOT_APPLICABLE");
        assertThat(MedicationKnowledgeRuleEngine.evaluate(program,new Facts(1,"MONTH",null,rows)).outcome()).isEqualTo("UNAVAILABLE");
        assertThat(MedicationKnowledgeRuleEngine.evaluate(program,new Facts(1,"MONTH",from,List.of(rows.getFirst(),row("B","E2","S2","PO")))).outcome()).isEqualTo("NO_MATCH");
        assertThat(program.requiredFacts()).hasSize(5);
    }
    @Test void duplicate_does_not_require_unused_b_route_but_unsupported_scope_and_conditions_cannot_compile() {
        var fixture=new MedicationKnowledgeDraftModelTest();fixture.references();var b=conditions(duplicate(),new Conditions("ALL",null,null,null,ALL,null,""));
        var a=fixture.validator.assess(1L,b);assertThat(a.structureComplete()).isTrue();
        assertThat(MedicationKnowledgeRuleCompiler.compile(b,a).groupB().routeMode()).isEqualTo(RangeMode.ALL);
        var unsupported=conditions(b,new Conditions("ALL",null,null,null,ALL,null,"需未结构化的检验值"));
        assertThatThrownBy(()->MedicationKnowledgeRuleCompiler.compile(unsupported,fixture.validator.assess(1L,unsupported))).isInstanceOf(IllegalArgumentException.class);
        var invalid=new Body(b.title(),b.kind(),b.matchMode(),b.groupA(),b.groupB(),b.minimumOrders(),"CROSS_PRESCRIPTION",b.conditions(),b.evidence(),b.clinicalMeaning(),b.severity(),b.proposedAction());
        assertThatThrownBy(()->MedicationKnowledgeRuleCompiler.compile(invalid,a)).isInstanceOf(IllegalArgumentException.class);
    }
}
