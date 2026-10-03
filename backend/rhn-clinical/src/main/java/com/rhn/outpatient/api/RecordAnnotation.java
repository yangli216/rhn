package com.rhn.outpatient.api;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Non-clinical sidecar metadata; the saved text is always the authoritative document. */
public record RecordAnnotation(String field, String text, Integer start, String source, String kind,
                               String binding, String label, String sourceQuote, String reason, Boolean confirmed) {
    private static final Set<String> FIELDS = Set.of("chiefComplaint", "presentIllness", "medicalHistory", "physicalExam",
            "allergyHistory", "medicationHistory", "auxiliaryExaminations", "healthEducation", "followUp");
    private static final Set<String> SOURCES = Set.of("TEMPLATE", "VOICE", "CONTEXT", "DOCTOR", "AI");
    private static final Set<String> KINDS = Set.of("PRESET", "VARIABLE", "IMPORTANT", "FACT", "CONFLICT");

    /** Invalid/stale hints are discarded rather than blocking a clinical save. No wording-based inference. */
    public static List<RecordAnnotation> anchored(List<RecordAnnotation> values, Map<String, ?> content,
                                                   Boolean confirmed) {
        if (values == null) return List.of();
        List<RecordAnnotation> result = new ArrayList<>();
        for (var value : values.stream().limit(200).toList()) {
            if (value == null || value.field() == null || !FIELDS.contains(value.field())
                    || value.source() == null || !SOURCES.contains(value.source())
                    || value.kind() == null || !KINDS.contains(value.kind())
                    || value.text() == null || value.text().isEmpty() || value.text().length() > 4000) continue;
            Object raw = content.get(value.field());
            if (!(raw instanceof String text)) continue;
            int start = value.start() == null ? text.indexOf(value.text()) : value.start();
            if (start < 0 || start > text.length() || !text.startsWith(value.text(), start)) continue;
            if (value.start() == null && text.indexOf(value.text(), start + 1) >= 0) continue;
            var anchored = new RecordAnnotation(value.field(), value.text(), start, value.source(), value.kind(),
                    clipped(value.binding(), 120), clipped(value.label(), 100), clipped(value.sourceQuote(), 1000),
                    clipped(value.reason(), 500), confirmed == null ? Boolean.TRUE.equals(value.confirmed()) : confirmed);
            if (!result.contains(anchored)) result.add(anchored);
        }
        return List.copyOf(result);
    }

    /** A separate inference projection; the complete writing preset remains unchanged. */
    public static Map<String, String> evidence(Map<String, String> content, List<RecordAnnotation> values) {
        var result = new java.util.LinkedHashMap<>(content);
        var marks = anchored(values, content, null);
        content.forEach((field, text) -> {
            if (text == null) return;
            boolean[] excluded = new boolean[text.length()];
            boolean[] explicit = new boolean[text.length()];
            for (var mark : marks) {
                if (!field.equals(mark.field())) continue;
                boolean confirmed = Boolean.TRUE.equals(mark.confirmed());
                boolean include = confirmed || Set.of("VOICE", "CONTEXT", "DOCTOR").contains(mark.source());
                boolean exclude = !confirmed && Set.of("TEMPLATE", "AI").contains(mark.source());
                for (int i = mark.start(); i < mark.start() + mark.text().length(); i++) {
                    if (include) explicit[i] = true;
                    if (exclude) excluded[i] = true;
                }
            }
            var evidence = new StringBuilder(text.length());
            for (int i = 0; i < text.length(); i++) evidence.append(excluded[i] && !explicit[i] ? ' ' : text.charAt(i));
            result.put(field, evidence.toString().trim());
        });
        return result;
    }

    private static String clipped(String value, int limit) {
        return value == null ? null : value.substring(0, Math.min(value.length(), limit));
    }
}
