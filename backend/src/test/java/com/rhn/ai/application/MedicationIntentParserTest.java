package com.rhn.ai.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class MedicationIntentParserTest {
    private final MedicationIntentParser parser = new MedicationIntentParser();

    @Test
    void strength_and_symptom_duration_do_not_supply_prescribing_values() {
        assertNull(parser.parse("阿莫西林胶囊 0.5g", "口服 QD 共1盒").doseValue());
        assertNull(parser.parse("阿莫西林胶囊", "规格0.5g；口服 QD 共1盒").doseValue());
        assertNull(parser.parse("阿莫西林胶囊", "咳嗽3天；每次0.5g 口服 QD 共1盒").durationValue());
        assertNull(parser.parse("阿莫西林胶囊", "每次0.5g/片 口服 QD 共1盒").doseValue());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "不要口服，每次0.5g QD 共1盒", "不建议口服，每次0.5g QD 共1盒", "停用，每次0.5g 口服 QD 共1盒",
            "禁止静脉滴注，每次0.5g QD 共1支", "避免雾化吸入，每次1mL QD 共1瓶",
            "每次0.5-1g 口服 QD 共1盒", "每次0.5g至1g 口服 QD 共1盒", "每次0.5g～1g 口服 QD 共1盒",
            "每次0.5g 口服 QD 共1盒 疗程7-10天", "每次0.5g 口服 QD 共1盒 疗程7天至10天",
            "每次0.5g 口服 QD 共1盒 疗程-3天", "每次0.5g 口服 QD 共0盒", "每次0g 口服 QD 共1盒",
            "每次0.5g；每次1g 口服 QD 共1盒", "每次0.5g 口服 外用 QD 共1盒",
            "每次0.5g 口服 QD BID 共1盒", "每次0.5g 口服 QD 共1盒；共2盒",
            "每次0.5g 口服 QD 共1盒 疗程3天；疗程5天",
            "每次0.5g以下 口服 QD 共1盒", "最多每次0.5g 口服 QD 共1盒", "每次0.5g 口服 QD 共1盒 疗程约3天",
            "每次0.5g 口服 QD 共1盒 疗程一周", "每次0.5g 口服 QD 共1盒 连用七天"
    })
    void uncertain_directions_require_review(String details) {
        var parsed = parser.parse("测试药品", details);
        assertTrue(parsed.requiresReview());
        assertFalse(parsed.hasExecutableDirections());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "规格：0.5g/片；常规用法：每次0.5g 口服 必要时 疗程3天；目的：解热镇痛；嘱托：体温正常时无需服用 共1盒",
            "规格：0.5g/片；常规用法：每次0.5g 口服 QD 疗程3天 共1盒；适用条件：发热；不建议常规使用：无发热的单纯咽痛 共1盒",
            "常规用法：每次0.5g 口服 QD 共1盒；嘱托：避免与酒精同服，不要自行加量"
    })
    void patient_advice_fields_are_not_prescribing_directions(String details) {
        var parsed = parser.parse("测试药品", details);
        assertFalse(parsed.requiresReview(), details);
        assertEquals(new BigDecimal("0.5"), parsed.doseValue());
        assertEquals("口服", parsed.routeCode());
    }

    @Test
    void negation_inside_the_directions_still_requires_review_even_with_advice_fields() {
        assertTrue(parser.parse("测试药品", "常规用法：不要口服，每次0.5g QD 共1盒；嘱托：多饮水").requiresReview());
        assertTrue(parser.parse("测试药品", "常规用法：停用 每次0.5g 口服 QD 共1盒；目的：退热").requiresReview());
    }

    @ParameterizedTest
    @ValueSource(strings = {"每日2次:每日两次", "每日二次:每日两次", "每天2次:每日两次", "一日2次:每日两次", "每日3次:每日三次",
            "每日4次:每日四次", "每日1次:每日一次", "每日一次:每日一次", "每日两次:每日两次"})
    void daily_frequency_is_canonicalised_to_the_dictionary_wording(String pair) {
        String[] parts = pair.split(":");
        var parsed = parser.parse("测试药品", "每次0.5g 口服 " + parts[0] + " 疗程3天");
        assertEquals(parts[1], parsed.frequencyCode());
        assertFalse(parsed.requiresReview());
        assertEquals("测试药品", parsed.medicationName());
    }

    @ParameterizedTest
    @ValueSource(strings = {"每晚1次", "每晚一次"})
    void evening_once_is_recognised_and_canonicalised(String token) {
        var parsed = parser.parse("测试药品", "每次0.5g 口服 " + token + " 疗程3天");
        assertEquals("每晚一次", parsed.frequencyCode());
        assertFalse(parsed.requiresReview());
    }

    @Test
    void daily_frequency_outside_the_supported_range_is_not_guessed() {
        assertNull(parser.parse("测试药品", "每次0.5g 口服 每日5次 疗程3天").frequencyCode());
        assertNull(parser.parse("测试药品", "每次0.5g 口服 每日10次 疗程3天").frequencyCode());
    }

    @Test
    void repeated_identical_evidence_is_not_a_conflict() {
        var parsed = parser.parse("测试药品", "每次0.50g 口服 qd 共1盒；每次0.5g 口服 QD 共1盒");
        assertFalse(parsed.requiresReview());
        assertTrue(parsed.hasExecutableDirections());
    }

    @Test
    void lexical_matches_do_not_change_drug_identity_or_invent_directions() {
        var nonexistent = parser.parse("不存在的通用药品", null);
        assertFalse(nonexistent.requiresReview());
        var oralProduct = parser.parse("口服补液盐", "每次1袋 QD 共1盒");
        assertEquals("口服补液盐", oralProduct.medicationName());
        assertNull(oralProduct.routeCode());
        assertFalse(oralProduct.hasExecutableDirections());
        assertNull(parser.parse("测试药品", "tidal myqdvalue 每次1片 口服 共1盒").frequencyCode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"维生素B12片", "辅酶Q10", "维生素B12", "复方维生素B12片"})
    void digits_inside_drug_names_are_not_removed_as_strength(String name) {
        var parsed = parser.parse(name, "每次1片 口服 QD 共1盒");
        assertEquals(name, parsed.medicationName());
        assertEquals(BigDecimal.ONE, parsed.doseValue());
    }

    @Test
    void explicitly_labeled_custom_codes_are_preserved_for_directory_resolution() {
        var parsed = parser.parse("测试药品", "每次1片 途径:LOCAL_PO 频次:CUSTOM_F 共1盒");
        assertEquals("LOCAL_PO", parsed.routeCode());
        assertEquals("CUSTOM_F", parsed.frequencyCode());
        assertFalse(parsed.requiresReview());
    }

    @Test
    void separates_strength_from_single_dose() {
        var parsed = parser.parse("阿莫西林胶囊", "建议规格：0.125g/粒；常规用法：每次0.5g 口服 tid 疗程10天");
        assertEquals(new BigDecimal("0.5"), parsed.doseValue());
        assertEquals("g", parsed.doseUnit());
        assertEquals(null, parser.parse("阿莫西林胶囊", "规格：0.125g/粒；口服 tid").doseValue());
        var count = parser.parse("阿莫西林胶囊", "规格：0.125g/粒；每次4粒，口服 tid");
        assertEquals(new BigDecimal("4"), count.doseValue());
        assertEquals("粒", count.doseUnit());
        assertEquals(new BigDecimal("0.5"), parser.parse("阿莫西林胶囊", "规格：0.125g/粒；常规用法：0.5g 口服 tid").doseValue());
    }

    @Test
    void parses_decimal_chinese_unit_route_frequency_duration_and_quantity() {
        var result = parser.parse("氨氯地平片", "每次.5毫克，口服，每日两次，连用7日，共2盒");

        assertEquals("氨氯地平片", result.medicationName());
        assertEquals(new BigDecimal("0.5"), result.doseValue());
        assertEquals("mg", result.doseUnit());
        assertEquals("口服", result.routeCode());
        assertEquals("每日两次", result.frequencyCode());
        assertEquals(new BigDecimal("7"), result.durationValue());
        assertEquals("天", result.durationUnit());
        assertEquals(new BigDecimal("2"), result.quantity());
        assertEquals("盒", result.quantityUnit());
        assertTrue(result.hasExecutableDirections());
    }

    @Test
    void keeps_compound_ingredient_mentions_and_never_invents_missing_directions() {
        var result = parser.parse("复方氨酚烷胺+咖啡因", null);
        assertEquals(2, result.ingredientMentions().size());
        assertEquals(null, result.doseValue());
        assertEquals(null, result.frequencyCode());
        assertTrue(!result.hasExecutableDirections());
    }

    @Test
    void parses_colon_duration_and_typical_usage() {
        var parsed = parser.parse("对乙酰氨基酚片", "常规用法：每次 0.5g 口服 PRN 疗程：3天；适用条件：体温≥38.5℃");
        assertEquals(new BigDecimal("0.5"), parsed.doseValue());
        assertEquals("g", parsed.doseUnit());
        assertEquals("口服", parsed.routeCode());
        assertEquals("PRN", parsed.frequencyCode());
        assertEquals(new BigDecimal("3"), parsed.durationValue());
        assertEquals("天", parsed.durationUnit());
    }
}
