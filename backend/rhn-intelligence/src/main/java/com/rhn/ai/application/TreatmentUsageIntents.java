package com.rhn.ai.application;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Tolerant reader for the optional model-only {@code usage} object of a MEDICATION treatment intent:
 * {@code {doseValue, doseUnit, route, frequency, durationDays}}. The model field is not part of any API contract;
 * it is rewritten, before binding, into the in-process carrier {@code usageSuggestion}. On such an unresolved
 * model intent {@code routeCode}/{@code frequencyCode} hold the model's raw route/frequency wording (never a
 * catalog code); {@link TreatmentUsageMapper} replaces them with real codes or drops them before anything
 * leaves the service. Malformed usage never fails the recommendation; unusable fields simply become null.
 */
public final class TreatmentUsageIntents {
    private static final Pattern DECIMAL = Pattern.compile("[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+");
    private static final int MAX_TEXT = 40;

    static final int MAX_PURPOSE_LENGTH = 60;

    private TreatmentUsageIntents() {}

    /** Mutates the parsed response in place; safe for any JSON shape. */
    public static void normalize(JsonNode root) {
        if (root == null || !root.isObject()) return;
        JsonNode items = root.get("treatmentRecommendations");
        if (items == null || !items.isArray()) return;
        for (JsonNode item : items) {
            if (!(item instanceof ObjectNode object)) continue;
            // The model can never supply the server-owned field directly.
            JsonNode usage = object.get("usage");
            object.remove("usage");
            object.remove("usageSuggestion");
            JsonNode type = object.get("type");
            sanitizePurpose(object, type);
            if (usage == null || !usage.isObject() || type == null || !type.isString()
                    || !"MEDICATION".equals(type.asString().trim().toUpperCase(Locale.ROOT))) continue;
            BigDecimal dose = decimal(usage.get("doseValue"));
            String unit = text(usage.get("doseUnit"));
            String route = text(usage.get("route"));
            String frequency = text(usage.get("frequency"));
            Integer days = integer(usage.get("durationDays"));
            if (dose == null && unit == null && route == null && frequency == null && days == null) continue;
            ObjectNode out = object.putObject("usageSuggestion");
            if (dose != null) out.put("doseValue", dose);
            if (unit != null) out.put("doseUnit", unit);
            if (route != null) out.put("routeCode", route);
            if (frequency != null) out.put("frequencyCode", frequency);
            if (days != null) out.put("durationDays", days);
        }
    }

    /** Purpose is kept only for laboratory/examination items: trimmed, blank to null, capped at 60 chars, non-text to null. */
    static void sanitizePurpose(ObjectNode object, JsonNode type) {
        JsonNode purpose = object.get("purpose");
        if (purpose == null) return;
        String kind = type != null && type.isString() ? type.asString().trim().toUpperCase(Locale.ROOT) : "";
        String value = purpose.isString() ? purpose.asString().trim() : "";
        if (!("LABORATORY".equals(kind) || "EXAMINATION".equals(kind)) || value.isEmpty()) {
            object.putNull("purpose");
            return;
        }
        if (value.length() > MAX_PURPOSE_LENGTH) {
            int end = MAX_PURPOSE_LENGTH;
            if (Character.isHighSurrogate(value.charAt(end - 1))) end--;
            value = value.substring(0, end).trim();
        }
        if (value.isEmpty()) object.putNull("purpose"); else object.put("purpose", value);
    }

    static BigDecimal decimal(JsonNode node) {
        if (node == null) return null;
        BigDecimal value;
        if (node.isNumber()) value = node.decimalValue();
        else if (node.isString()) {
            String raw = node.asString().trim();
            if (!DECIMAL.matcher(raw).matches()) return null;
            value = new BigDecimal(raw);
        } else return null;
        return value.signum() > 0 ? value.stripTrailingZeros() : null;
    }

    static Integer integer(JsonNode node) {
        BigDecimal value = null;
        if (node != null && node.isNumber()) value = node.decimalValue();
        else if (node != null && node.isString() && DECIMAL.matcher(node.asString().trim()).matches())
            value = new BigDecimal(node.asString().trim());
        if (value == null || value.stripTrailingZeros().scale() > 0
                || value.compareTo(BigDecimal.valueOf(Integer.MAX_VALUE)) > 0) return null;
        return value.intValue();
    }

    static String text(JsonNode node) {
        if (node == null || !node.isString()) return null;
        String value = node.asString().trim();
        return value.isEmpty() || value.length() > MAX_TEXT ? null : value;
    }
}
