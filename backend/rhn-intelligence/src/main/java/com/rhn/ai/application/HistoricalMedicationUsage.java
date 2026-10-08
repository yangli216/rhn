package com.rhn.ai.application;

import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory.MedicationUsageFact;
import com.rhn.shared.json.JsonCodec;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/** Compares saved rule facts, without deriving semantics from a frequency code or display name. */
final class HistoricalMedicationUsage {
    private HistoricalMedicationUsage() {}

    private static final List<String> REQUIRED = List.of("id", "code", "ruleType", "frequencyCount",
            "periodValue", "periodUnit", "anchorType", "executionTimes", "firstDayPolicy", "automaticTaskGeneration");
    private static final Set<String> DISPLAY_FIELDS = Set.of("revision", "name", "shortName", "description");

    record Signature(Long routeId, String executionType, String resolutionStatus, Long frequencyId,
                     Map<String, Object> frequencyRule) {}

    static Signature signature(MedicationUsageFact value) {
        return value == null ? null : new Signature(value.routeId(), value.routeExecutionType(),
                value.routeResolutionStatus(), value.frequencyId(), rule(value.frequencyRuleSnapshot()));
    }

    static Map<String, Object> rule(String snapshot) {
        if (snapshot == null || snapshot.isBlank()) return null;
        try {
            JsonNode node = JsonCodec.readExactTree(snapshot);
            if (!node.isObject() || REQUIRED.stream().anyMatch(key -> !node.has(key))) return null;
            if (!node.get("id").isIntegralNumber() || node.get("id").bigIntegerValue().signum() <= 0) return null;
            for (String key : List.of("code", "ruleType", "anchorType", "firstDayPolicy")) {
                if (!node.get(key).isTextual() || node.get(key).asString().isBlank()) return null;
            }
            if (!node.get("frequencyCount").isNull() && (!node.get("frequencyCount").isIntegralNumber()
                    || node.get("frequencyCount").bigIntegerValue().signum() <= 0)) return null;
            if (!node.get("periodValue").isNull() && (!node.get("periodValue").isNumber()
                    || node.get("periodValue").decimalValue().signum() <= 0)) return null;
            if (!node.get("periodUnit").isNull() && (!node.get("periodUnit").isTextual()
                    || node.get("periodUnit").asString().isBlank())) return null;
            if (!node.get("automaticTaskGeneration").isBoolean() || !node.get("executionTimes").isArray()) return null;
            for (JsonNode time : node.get("executionTimes")) if (!time.isTextual() || time.asString().isBlank()) return null;
            Map<String, Object> result = new TreeMap<>();
            // Keep unknown fields as evidence too: newly added semantics must not silently disappear.
            for (var entry : node.properties()) {
                if (!DISPLAY_FIELDS.contains(entry.getKey())) result.put(entry.getKey(), canonical(entry.getValue()));
            }
            return result;
        } catch (RuntimeException invalidSnapshot) {
            return null;
        }
    }

    private static Object canonical(JsonNode node) {
        if (node.isNull()) return null;
        if (node.isNumber()) return node.decimalValue().stripTrailingZeros();
        if (node.isTextual()) return node.asString();
        if (node.isBoolean()) return node.booleanValue();
        if (node.isArray()) {
            List<Object> result = new ArrayList<>();
            for (JsonNode child : node) result.add(canonical(child));
            return result;
        }
        Map<String, Object> result = new TreeMap<>();
        for (var entry : node.properties()) result.put(entry.getKey(), canonical(entry.getValue()));
        return result;
    }
}
