package com.rhn.quality;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot.MedicationItem;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot.PatientSafetyContext;
import com.rhn.quality.medication.application.MedicationSafetyEngine;
import com.rhn.quality.medication.domain.RuleDefinition;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.quality.medication.domain.rule.AgeContraindicationRule;
import com.rhn.quality.medication.domain.rule.DisulfiramInteractionRule;
import com.rhn.quality.medication.domain.rule.NsaidDuplicateRule;
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

class QmedCommonClinicalRulesTest {
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
                new NsaidDuplicateRule(json),
                new AgeContraindicationRule(json),
                new DisulfiramInteractionRule(json)
        ));

        ruleVersions = List.of(
                version(NsaidDuplicateRule.CODE, NsaidDuplicateRule.IMPLEMENTATION, MedicationSafetyDecision.Status.REQUIRE_OVERRIDE),
                version(AgeContraindicationRule.CODE, AgeContraindicationRule.IMPLEMENTATION, MedicationSafetyDecision.Status.BLOCK),
                version(DisulfiramInteractionRule.CODE, DisulfiramInteractionRule.IMPLEMENTATION, MedicationSafetyDecision.Status.BLOCK)
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

    private MedicationItem createItem(long id, Long medicationId, String medJson) {
        return new MedicationItem(id, 0, medicationId, id + 100, null,
                "DRAFT", "LEGACY", new BigDecimal("1.0"), "片", 1L, "PO", "ORAL", "RESOLVED",
                1L, "QD", "{}", BigDecimal.valueOf(3), "DAY", medJson, "{}", "{}",
                false, null, null);
    }

    @Test
    void nsaid_duplicate_rule_flags_combination_of_systemic_nsaids() {
        // 1. 布洛芬 + 双氯芬酸钠口服 -> 触发重复用药警示
        String ibuprofen = """
                {"id":1001,"code":"IBU","name":"布洛芬片","doseForm":"片剂"}
                """;
        String diclofenac = """
                {"id":1002,"code":"DIC","name":"双氯芬酸钠缓释片","doseForm":"缓释片"}
                """;
        var item1 = createItem(1, 1001L, ibuprofen);
        var item2 = createItem(2, 1002L, diclofenac);

        var snapshot1 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(item1, item2));
        var result1 = engine.evaluate(snapshot1, ruleVersions, Instant.now());
        assertTrue(result1.findings().stream().anyMatch(f -> f.rule().definition().code().equals(NsaidDuplicateRule.CODE)
                && f.message().contains("非甾体抗炎药（NSAIDs）") && f.message().contains("布洛芬片") && f.message().contains("双氯芬酸钠缓释片")));

        // 2. 单用布洛芬 -> 不触发
        var snapshot2 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(item1));
        var result2 = engine.evaluate(snapshot2, ruleVersions, Instant.now());
        assertFalse(result2.findings().stream().anyMatch(f -> f.rule().definition().code().equals(NsaidDuplicateRule.CODE)));

        // 3. 布洛芬口服 + 双氯芬酸钠滴眼液（外用剂型） -> 排除局部外用，不触发重复用药
        String eyeDrop = """
                {"id":1003,"code":"DIC-EYE","name":"双氯芬酸钠滴眼液","doseForm":"滴眼剂"}
                """;
        var item3 = createItem(3, 1003L, eyeDrop);
        var snapshot3 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(item1, item3));
        var result3 = engine.evaluate(snapshot3, ruleVersions, Instant.now());
        assertFalse(result3.findings().stream().anyMatch(f -> f.rule().definition().code().equals(NsaidDuplicateRule.CODE)));
    }

    @Test
    void age_contraindication_rule_blocks_pediatric_quinolone_and_aspirin() {
        String levofloxacin = """
                {"id":2001,"code":"LVFX","name":"左氧氟沙星片","doseForm":"片剂"}
                """;
        String aspirin = """
                {"id":2002,"code":"ASA","name":"阿司匹林片","doseForm":"片剂"}
                """;
        var levoItem = createItem(1, 2001L, levofloxacin);
        var aspirinItem = createItem(2, 2002L, aspirin);

        // 1. 15岁青少年开立左氧氟沙星 -> 触发 18 岁以下禁用阻断
        var minorContext = new PatientSafetyContext(true, true, null, List.of(), 15, "MALE");
        var snapshot1 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(levoItem), minorContext);
        var result1 = engine.evaluate(snapshot1, ruleVersions, Instant.now());
        assertTrue(result1.findings().stream().anyMatch(f -> f.rule().definition().code().equals(AgeContraindicationRule.CODE)
                && f.message().contains("未满18周岁") && f.message().contains("左氧氟沙星片")));

        // 2. 25岁成年人开立左氧氟沙星 -> 不拦截
        var adultContext = new PatientSafetyContext(true, true, null, List.of(), 25, "MALE");
        var snapshot2 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(levoItem), adultContext);
        var result2 = engine.evaluate(snapshot2, ruleVersions, Instant.now());
        assertFalse(result2.findings().stream().anyMatch(f -> f.rule().definition().code().equals(AgeContraindicationRule.CODE)));

        // 3. 7岁儿童开立阿司匹林 -> 触发 12 岁以下瑞氏综合征禁忌阻断
        var childContext = new PatientSafetyContext(true, true, null, List.of(), 7, "FEMALE");
        var snapshot3 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(aspirinItem), childContext);
        var result3 = engine.evaluate(snapshot3, ruleVersions, Instant.now());
        assertTrue(result3.findings().stream().anyMatch(f -> f.rule().definition().code().equals(AgeContraindicationRule.CODE)
                && f.message().contains("不满12周岁") && f.message().contains("瑞氏综合征")));

        // 4. 年龄未提供（null） -> 安全跳过，不报异常
        var unknownAgeContext = new PatientSafetyContext(true, true, null, List.of());
        var snapshot4 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(levoItem, aspirinItem), unknownAgeContext);
        var result4 = engine.evaluate(snapshot4, ruleVersions, Instant.now());
        assertFalse(result4.findings().stream().anyMatch(f -> f.rule().definition().code().equals(AgeContraindicationRule.CODE)));
    }

    @Test
    void disulfiram_interaction_rule_intercepts_cephalosporin_and_ethanol_drugs() {
        String ceftriaxone = """
                {"id":3001,"code":"CRO","name":"注射用头孢曲松钠","doseForm":"注射剂","preparationSpec":"1.0g"}
                """;
        String huoxiangWater = """
                {"id":3002,"code":"HX-WATER","name":"藿香正气水","doseForm":"合剂(水剂)","preparationSpec":"10ml"}
                """;
        String huoxiangOral = """
                {"id":3003,"code":"HX-ORAL","name":"藿香正气口服液","doseForm":"合剂(口服液)","preparationSpec":"10ml"}
                """;
        var croItem = createItem(1, 3001L, ceftriaxone);
        var hxWaterItem = createItem(2, 3002L, huoxiangWater);
        var hxOralItem = createItem(3, 3003L, huoxiangOral);

        // 1. 头孢曲松钠 + 藿香正气水（含乙醇） -> 触发双硫仑样反应致命阻断
        var snapshot1 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(croItem, hxWaterItem));
        var result1 = engine.evaluate(snapshot1, ruleVersions, Instant.now());
        assertTrue(result1.findings().stream().anyMatch(f -> f.rule().definition().code().equals(DisulfiramInteractionRule.CODE)
                && f.message().contains("双硫仑样反应") && f.message().contains("注射用头孢曲松钠") && f.message().contains("藿香正气水")));
        assertEquals(MedicationSafetyDecision.Status.BLOCK, result1.decision());

        // 2. 头孢曲松钠 + 藿香正气口服液（无乙醇） -> 安全放行
        var snapshot2 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(croItem, hxOralItem));
        var result2 = engine.evaluate(snapshot2, ruleVersions, Instant.now());
        assertFalse(result2.findings().stream().anyMatch(f -> f.rule().definition().code().equals(DisulfiramInteractionRule.CODE)));

        // 3. 甲硝唑片 + 复方甘草口服溶液（含乙醇） -> 触发双硫仑样反应阻断
        String metronidazole = """
                {"id":3004,"code":"MTZ","name":"甲硝唑片","doseForm":"片剂","preparationSpec":"0.2g"}
                """;
        String licorice = """
                {"id":3005,"code":"LIC","name":"复方甘草口服溶液","doseForm":"口服溶液剂","preparationSpec":"100ml"}
                """;
        var mtzItem = createItem(4, 3004L, metronidazole);
        var licItem = createItem(5, 3005L, licorice);
        var snapshot3 = new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION, 1L, 10L, 0,
                20L, 30L, 1L, 1L, "DRAFT", List.of(mtzItem, licItem));
        var result3 = engine.evaluate(snapshot3, ruleVersions, Instant.now());
        assertTrue(result3.findings().stream().anyMatch(f -> f.rule().definition().code().equals(DisulfiramInteractionRule.CODE)));
    }
}
