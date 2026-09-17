package com.rhn.quality;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot.AllergyFact;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot.MedicationItem;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot.PatientSafetyContext;
import com.rhn.quality.medication.application.MedicationSafetyEngine;
import com.rhn.quality.medication.domain.RuleDefinition;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.quality.medication.domain.rule.AntimicrobialOutpatientRule;
import com.rhn.quality.medication.domain.rule.DrugAllergyRule;
import com.rhn.quality.medication.domain.rule.DuplicateMedicationRule;
import com.rhn.quality.medication.domain.rule.SkinTestRequirementRule;
import com.rhn.shared.json.JsonCodec;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class QmedExistingRuleMigrationTest {
    private final JsonCodec json = new JsonCodec() {
        private final ObjectMapper mapper = JsonMapper.builder().findAndAddModules().build();
        @Override public String write(Object value) { return mapper.writeValueAsString(value); }
        @Override public JsonNode readTree(String value) { return mapper.readTree(value); }
        @Override public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
        @Override @SuppressWarnings("unchecked")
        public Map<String, Object> readObject(String value) { return mapper.readValue(value, LinkedHashMap.class); }
    };
    private MedicationSafetyEngine engine;
    private List<RuleVersion> ruleVersions;

    @BeforeEach
    void setUp() {
        engine = new MedicationSafetyEngine(List.of(
                new DuplicateMedicationRule(),
                new AntimicrobialOutpatientRule(json),
                new DrugAllergyRule(json),
                new SkinTestRequirementRule(json)
        ));

        ruleVersions = List.of(
                version(DuplicateMedicationRule.CODE, "java:exact-generic-duplicate:1", MedicationSafetyDecision.Status.WARN),
                version(AntimicrobialOutpatientRule.CODE, "java:antimicrobial-outpatient:1", MedicationSafetyDecision.Status.REQUIRE_OVERRIDE),
                version(DrugAllergyRule.CODE, "java:drug-allergy:1", MedicationSafetyDecision.Status.BLOCK),
                version(SkinTestRequirementRule.CODE, "java:skin-test:1", MedicationSafetyDecision.Status.REQUIRE_OVERRIDE)
        );
    }

    private RuleVersion version(String code, String impl, MedicationSafetyDecision.Status decision) {
        return new RuleVersion(100L,
                new RuleDefinition(10L, code, "SAFETY", "Rule " + code),
                1, MedicationSafetyEngine.RULE_SET, impl, "SHADOW",
                MedicationSafetyDecision.Severity.HIGH, decision,
                MedicationSafetyDecision.OverridePolicy.REASON_REQUIRED,
                Instant.parse("2026-01-01T00:00:00Z"), null,
                List.of(new MedicationSafetyDecision.Evidence("SPEC", "title", "1", "loc", "sec", "excerpt", "SHADOW_ONLY")));
    }

    private MedicationItem createItem(long id, Long medicationId, String medJson, BigDecimal duration,
                                     boolean skinTestExempt, String exemptReason) {
        return new MedicationItem(id, 0, medicationId, id + 100, null,
                "DRAFT", "LEGACY", new BigDecimal("1.0"), "g", 1L, "IVGTT", "IV", "RESOLVED",
                1L, "QD", "{}", duration, "DAY", medJson, "{}", "{}",
                skinTestExempt, exemptReason, null);
    }

    @Test
    void antimicrobial_rule_blocks_unauthorized_outpatient_drug_and_limits_duration() {
        // 1. 门诊禁用的抗菌药 -> 阻断
        String restrictedJson = """
                {"id":101,"code":"AM-RESTRICT","name":"特殊级抗菌素","antimicrobial":true,"antimicrobialOutpatientAllowed":false,"antimicrobialMaxDays":3}
                """;
        var restrictedItem = createItem(1, 101L, restrictedJson, BigDecimal.valueOf(2), false, null);
        var snapshot1 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(restrictedItem));
        var result1 = engine.evaluate(snapshot1, ruleVersions, Instant.now());
        assertTrue(result1.findings().stream().anyMatch(f -> f.rule().definition().code().equals(AntimicrobialOutpatientRule.CODE)
                && f.message().contains("禁止常规开立")));

        // 2. 门诊可用抗菌药，但疗程超过最大天数 -> 产生风险提示
        String allowedJson = """
                {"id":102,"code":"AM-ALLOWED","name":"普通头孢","antimicrobial":true,"antimicrobialOutpatientAllowed":true,"antimicrobialMaxDays":7}
                """;
        var overDurationItem = createItem(2, 102L, allowedJson, BigDecimal.valueOf(10), false, null);
        var snapshot2 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(overDurationItem));
        var result2 = engine.evaluate(snapshot2, ruleVersions, Instant.now());
        assertTrue(result2.findings().stream().anyMatch(f -> f.rule().definition().code().equals(AntimicrobialOutpatientRule.CODE)
                && f.message().contains("超过规定上限")));

        // 3. 门诊可用且疗程合规 -> 无抗菌药风险
        var normalItem = createItem(3, 102L, allowedJson, BigDecimal.valueOf(5), false, null);
        var snapshot3 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(normalItem));
        var result3 = engine.evaluate(snapshot3, ruleVersions, Instant.now());
        assertFalse(result3.findings().stream().anyMatch(f -> f.rule().definition().code().equals(AntimicrobialOutpatientRule.CODE)));
    }

    @Test
    void skin_test_rule_enforces_mandatory_test_or_valid_exemption() {
        String skinTestMedJson = """
                {"id":201,"code":"PENICILLIN","name":"青霉素注射液","skinTestRequired":true}
                """;

        // 1. 强制皮试药，未免试 -> 必须做皮试
        var unexemptItem = createItem(1, 201L, skinTestMedJson, BigDecimal.ONE, false, null);
        var snapshot1 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(unexemptItem));
        var result1 = engine.evaluate(snapshot1, ruleVersions, Instant.now());
        assertTrue(result1.findings().stream().anyMatch(f -> f.rule().definition().code().equals(SkinTestRequirementRule.CODE)
                && f.message().contains("必须具有有效的阴性皮试结果")));

        // 2. 标记免试但缺少理由和凭据 -> 提示需补充依据
        var exemptWithoutReasonItem = createItem(2, 201L, skinTestMedJson, BigDecimal.ONE, true, "  ");
        var snapshot2 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(exemptWithoutReasonItem));
        var result2 = engine.evaluate(snapshot2, ruleVersions, Instant.now());
        assertTrue(result2.findings().stream().anyMatch(f -> f.rule().definition().code().equals(SkinTestRequirementRule.CODE)
                && f.message().contains("缺少免试理由")));

        // 3. 标记免试且具备临床理由 -> 放行通过
        var exemptWithReasonItem = createItem(3, 201L, skinTestMedJson, BigDecimal.ONE, true, "24小时内同批号原药皮试阴性");
        var snapshot3 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(exemptWithReasonItem));
        var result3 = engine.evaluate(snapshot3, ruleVersions, Instant.now());
        assertFalse(result3.findings().stream().anyMatch(f -> f.rule().definition().code().equals(SkinTestRequirementRule.CODE)));
    }

    @Test
    void drug_allergy_rule_intercepts_unrecorded_allergy_and_matched_allergens() {
        String drugJson = """
                {"id":301,"code":"AMOX","name":"阿莫西林胶囊"}
                """;
        var item = createItem(1, 301L, drugJson, BigDecimal.valueOf(3), false, null);

        // 1. 患者过敏史未采集且未勾选复核 -> 阻断/要求确认
        var unrecordedContext = new PatientSafetyContext(false, false, null, List.of());
        var snapshot1 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(item), unrecordedContext);
        var result1 = engine.evaluate(snapshot1, ruleVersions, Instant.now());
        assertTrue(result1.findings().stream().anyMatch(f -> f.rule().definition().code().equals(DrugAllergyRule.CODE)
                && f.message().contains("过敏状态尚未采集或核对")));

        // 2. 患者命中过敏原，无覆盖理由 -> 拦截
        var matchedAllergy = new AllergyFact(1L, "AMOX", "阿莫西林", "青霉素类", "ALLERGY");
        var matchedContext = new PatientSafetyContext(true, true, null, List.of(matchedAllergy));
        var snapshot2 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(item), matchedContext);
        var result2 = engine.evaluate(snapshot2, ruleVersions, Instant.now());
        assertTrue(result2.findings().stream().anyMatch(f -> f.rule().definition().code().equals(DrugAllergyRule.CODE)
                && f.message().contains("命中患者既往过敏原")));

        // 3. 患者命中过敏原，但医生录入了临床覆盖理由 -> 放行
        var overrideContext = new PatientSafetyContext(true, true, "患者明确表示既往轻微胃肠反应并非真性过敏，救治急需且已备抗过敏方案", List.of(matchedAllergy));
        var snapshot3 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(item), overrideContext);
        var result3 = engine.evaluate(snapshot3, ruleVersions, Instant.now());
        assertFalse(result3.findings().stream().anyMatch(f -> f.rule().definition().code().equals(DrugAllergyRule.CODE)));
    }
}
