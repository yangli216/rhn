package com.rhn.ai.application;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.*;

class TreatmentUsageIntentsTest {
    final ObjectMapper mapper = new ObjectMapper();

    @Test void toleratesAnyShapeWithoutThrowing() {
        for (String json : new String[]{"[]", "\"x\"", "null", "{}", "{\"treatmentRecommendations\":null}",
                "{\"treatmentRecommendations\":\"x\"}", "{\"treatmentRecommendations\":[null,1,\"a\",[],{}]}",
                "{\"treatmentRecommendations\":[{\"type\":5,\"usage\":{\"doseValue\":1}}]}"}) {
            assertDoesNotThrow(() -> TreatmentUsageIntents.normalize(mapper.readTree(json)), json);
        }
    }

    @Test void numericStringsAndNumbersAreAccepted() {
        var root = mapper.readTree("""
                {"treatmentRecommendations":[{"type":"medication","usage":
                 {"doseValue":"0.5","doseUnit":" 片 ","route":"口服","frequency":"BID","durationDays":"5"}}]}""");
        TreatmentUsageIntents.normalize(root);
        var usage = root.get("treatmentRecommendations").get(0);
        assertFalse(usage.has("usage"));
        assertEquals(0, usage.get("usageSuggestion").get("doseValue").decimalValue().compareTo(new java.math.BigDecimal("0.5")));
        assertEquals("片", usage.get("usageSuggestion").get("doseUnit").asString());
        assertEquals(5, usage.get("usageSuggestion").get("durationDays").asInt());
    }

    @Test void invalidFieldsAreDroppedIndividually() {
        var root = mapper.readTree("""
                {"treatmentRecommendations":[{"type":"MEDICATION","usage":
                 {"doseValue":"一片","doseUnit":["片"],"route":true,"frequency":"每日三次","durationDays":1.5}}]}""");
        TreatmentUsageIntents.normalize(root);
        var usage = root.get("treatmentRecommendations").get(0).get("usageSuggestion");
        assertEquals(1, usage.size());
        assertEquals("每日三次", usage.get("frequencyCode").asString());
    }

    @Test void nonMedicationAndOversizedTextAreDropped() {
        var root = mapper.readTree("{\"treatmentRecommendations\":[{\"type\":\"EXAMINATION\",\"usage\":{\"route\":\"口服\"}},"
                + "{\"type\":\"MEDICATION\",\"usage\":{\"route\":\"" + "长".repeat(41) + "\",\"doseValue\":0}}]}");
        TreatmentUsageIntents.normalize(root);
        assertFalse(root.get("treatmentRecommendations").get(0).has("usageSuggestion"));
        assertFalse(root.get("treatmentRecommendations").get(1).has("usageSuggestion"));
    }

    @Test void purposeIsKeptOnlyForLabAndExaminationAndSanitized() {
        var root = mapper.readTree("{\"treatmentRecommendations\":["
                + "{\"type\":\"MEDICATION\",\"purpose\":\"退热\"},"
                + "{\"type\":\"LABORATORY\",\"purpose\":\"  排除感染  \"},"
                + "{\"type\":\"EXAMINATION\",\"purpose\":\"   \"},"
                + "{\"type\":\"EXAMINATION\",\"purpose\":\"" + "长".repeat(80) + "\"},"
                + "{\"type\":\"LABORATORY\",\"purpose\":{\"a\":1}},"
                + "{\"type\":\"LABORATORY\",\"purpose\":12}]}");
        TreatmentUsageIntents.normalize(root);
        var items = root.get("treatmentRecommendations");
        assertTrue(items.get(0).get("purpose").isNull());
        assertEquals("排除感染", items.get(1).get("purpose").asString());
        assertTrue(items.get(2).get("purpose").isNull());
        assertEquals(60, items.get(3).get("purpose").asString().length());
        assertTrue(items.get(4).get("purpose").isNull());
        assertTrue(items.get(5).get("purpose").isNull());
    }
}
