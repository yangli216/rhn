package com.rhn.diagnostics.application;

import com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class LaboratoryRuleEvaluatorTest {
    @Test void exact_values_use_inclusive_reference_bounds_and_strict_critical_bounds() {
        var indicator = number(List.of(rule("adult", "FEMALE", 6570, null)));
        var person = new LaboratoryRuleEvaluator.PatientConditions("FEMALE", 12000L, null, null);
        assertEquals("N", evaluate(indicator,"3.9","EQ",person).interpretationCode());
        assertEquals("L", evaluate(indicator,"2.8","EQ",person).interpretationCode());
        assertEquals("LL", evaluate(indicator,"2.79","EQ",person).interpretationCode());
        assertEquals("HH", evaluate(indicator,"22.21","EQ",person).interpretationCode());
    }
    @Test void age_upper_bound_and_unknown_sex_never_use_an_adult_reference() {
        var adult = number(List.of(rule("adult", "FEMALE", 6570, null)));
        assertEquals("NO_RULE", evaluate(adult,"5","EQ",new LaboratoryRuleEvaluator.PatientConditions("FEMALE",6569L,null,null)).status());
        assertEquals("NO_RULE", evaluate(adult,"5","EQ",new LaboratoryRuleEvaluator.PatientConditions(null,10000L,null,null)).status());
        assertEquals("NO_RULE", evaluate(adult,"5","EQ",new LaboratoryRuleEvaluator.PatientConditions("FEMALE",null,null,null)).status());
        var child = number(List.of(rule("child",null,0,6570)));
        assertEquals("NO_RULE", evaluate(child,"5","EQ",new LaboratoryRuleEvaluator.PatientConditions("FEMALE",6570L,null,null)).status());
    }
    @Test void censored_values_do_not_become_exact_values_or_normal_results() {
        var indicator = number(List.of(rule("all",null,null,null)));
        var person = new LaboratoryRuleEvaluator.PatientConditions(null,null,null,null);
        assertEquals("LL", evaluate(indicator,"2.8","LT",person).interpretationCode());
        assertEquals("POSSIBLE_CRITICAL", evaluate(indicator,"2.8","LE",person).status());
        assertEquals("HH", evaluate(indicator,"22.2","GT",person).interpretationCode());
        assertEquals("POSSIBLE_CRITICAL", evaluate(indicator,"5","LT",person).status());
        var withoutCritical = new ReferenceRule("reference",null,null,null,null,null,new BigDecimal("3.9"),new BigDecimal("6.1"),null,null,List.of());
        assertEquals("BOUNDARY_UNCERTAIN", evaluate(number(List.of(withoutCritical)),"5","LT",person).status());
        assertEquals("L", evaluate(number(List.of(withoutCritical)),"3.9","LT",person).interpretationCode());
    }
    @Test void conflicting_rules_and_missing_ranges_never_imply_normality() {
        var person = new LaboratoryRuleEvaluator.PatientConditions("FEMALE",10000L,null,null);
        assertEquals("AMBIGUOUS_RULE", evaluate(number(List.of(rule("all",null,null,null),rule("female","FEMALE",0,null))),"5","EQ",person).status());
        assertNull(evaluate(number(List.of()),"5","EQ",person).interpretationCode());
        var empty = new ReferenceRule("empty",null,null,null,null,null,null,null,null,null,List.of());
        assertEquals("NO_RANGE",evaluate(number(List.of(empty)),"5","EQ",person).status());
    }
    @Test void unit_precision_and_controlled_codes_are_validated() {
        var person = new LaboratoryRuleEvaluator.PatientConditions(null,null,null,null);
        var indicator = number(List.of());
        assertThrows(RuntimeException.class,()->LaboratoryRuleEvaluator.evaluate(indicator,"5","EQ","mg/dL",person));
        assertThrows(RuntimeException.class,()->evaluate(indicator,"5.123","EQ",person));
        var rule = new ReferenceRule("qualitative",null,null,null,null,null,null,null,null,null,List.of("POS"));
        var coded = new Indicator("TEST","定性","CODE",null,null,true,null,null,List.of("NEG","POS"),List.of(rule));
        assertEquals("CRITICAL",LaboratoryRuleEvaluator.evaluate(coded,"POS",null,null,person).interpretationCode());
        assertNull(LaboratoryRuleEvaluator.evaluate(coded,"NEG",null,null,person).interpretationCode());
        assertThrows(RuntimeException.class,()->LaboratoryRuleEvaluator.evaluate(coded,"UNKNOWN",null,null,person));
        assertThrows(RuntimeException.class,()->LaboratoryRuleEvaluator.evaluate(coded,"POS","LT",null,person));
    }
    private LaboratoryRuleEvaluator.Evaluation evaluate(Indicator definition,String value,String op,LaboratoryRuleEvaluator.PatientConditions person) {
        return LaboratoryRuleEvaluator.evaluate(definition,value,op,"mmol/L",person);
    }
    private Indicator number(List<ReferenceRule> rules) { return new Indicator("GLU","血糖","NUMBER","mmol/L",2,true,"HEXOKINASE",null,List.of(),rules); }
    private ReferenceRule rule(String code,String sex,Integer min,Integer max) {
        return new ReferenceRule(code,sex,min,max,null,null,new BigDecimal("3.9"),new BigDecimal("6.1"),new BigDecimal("2.8"),new BigDecimal("22.2"),List.of());
    }
}
