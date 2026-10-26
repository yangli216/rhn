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
            sanitizeExamination(object, type);
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

    private static final java.util.Set<String> MODALITIES = java.util.Set.of(
            "US", "CT", "MR", "DR", "MG", "ECG", "ENDOSCOPY", "FUNCTION", "OTHER");

    /**
     * The model {@code examination} object is kept only for EXAMINATION items. Unknown enum values become null, body sites
     * are trimmed text (at most 6, 30 chars each); an object without a known modality is dropped so the server derives the
     * intent from the name. Server-owned {@code examinationSites} is always removed.
     */
    static void sanitizeExamination(ObjectNode object, JsonNode type) {
        object.remove("examinationSites");
        JsonNode exam = object.get("examination");
        if (exam == null) return;
        String kind = type != null && type.isString() ? type.asString().trim().toUpperCase(Locale.ROOT) : "";
        String modality = upper(exam.get("modality"));
        if (!"EXAMINATION".equals(kind) || !exam.isObject() || !MODALITIES.contains(modality)) {
            object.remove("examination");
            return;
        }
        ObjectNode out = object.putObject("examination");
        out.put("modality", modality);
        String technique = upper(exam.get("technique"));
        if ("US".equals(modality) && java.util.Set.of("B_MODE", "COLOR_DOPPLER").contains(technique)) out.put("technique", technique);
        String contrast = upper(exam.get("contrastPhase"));
        if (java.util.Set.of("CT", "MR").contains(modality) && java.util.Set.of("PLAIN", "ENHANCED", "PLAIN_ENHANCED").contains(contrast)) {
            out.put("contrastPhase", contrast);
        }
        String laterality = upper(exam.get("laterality"));
        if (java.util.Set.of("LEFT", "RIGHT", "BILATERAL").contains(laterality)) out.put("laterality", laterality);
        var sites = out.putArray("bodySites");
        JsonNode raw = exam.get("bodySites");
        if (raw != null && raw.isArray()) {
            for (JsonNode site : raw) {
                if (sites.size() >= 6) break;
                if (!site.isString()) continue;
                String value = site.asString().trim();
                if (!value.isEmpty() && value.length() <= 30) sites.add(value);
            }
        }
    }

    private static String upper(JsonNode node) {
        return node != null && node.isString() ? node.asString().trim().toUpperCase(Locale.ROOT) : "";
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
