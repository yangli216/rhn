package com.rhn.ai.application;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MedicationIntentParserTest {
    private final MedicationIntentParser parser = new MedicationIntentParser();

    @Test
    void parses_decimal_chinese_unit_route_frequency_duration_and_quantity() {
        var result = parser.parse("氨氯地平片", "每次.5毫克，口服，每日两次，连用7日，共2盒");

        assertEquals("氨氯地平片", result.medicationName());
        assertEquals(new BigDecimal("0.5"), result.doseValue());
        assertEquals("mg", result.doseUnit());
        assertEquals("ORAL", result.routeCode());
        assertEquals("BID", result.frequencyCode());
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
}
