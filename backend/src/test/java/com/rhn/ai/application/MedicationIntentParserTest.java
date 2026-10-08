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
