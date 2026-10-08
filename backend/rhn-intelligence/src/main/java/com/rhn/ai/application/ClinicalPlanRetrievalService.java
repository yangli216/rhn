package com.rhn.ai.application;

import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Deterministic ranking over an already permission-filtered plan set. */
@Service
public class ClinicalPlanRetrievalService {
    public static final int MODEL_CANDIDATE_LIMIT = 20;

    public List<Match> retrieve(List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> visiblePlans,
                                Query query, int limit) {
        java.util.Objects.requireNonNull(visiblePlans, "可见方案目录未返回，不能视为没有匹配方案");
        if (visiblePlans.isEmpty() || limit <= 0) return List.of();
        String text = normalized(query == null ? null : query.text());
        Set<DiagnosisIdentity> diagnoses = query == null || query.diagnoses() == null
                ? Set.of() : Set.copyOf(query.diagnoses());
        String preferredScope = query == null ? null : normalizedCode(query.preferredScope());

        List<Match> scored = visiblePlans.stream().map(plan -> score(plan, text, diagnoses, preferredScope)).toList();
        Set<String> seenContent = new LinkedHashSet<>();
        return scored.stream()
                .filter(match -> match.clinicalScore() > 0)
                .sorted(Comparator.comparingInt(Match::clinicalScore).reversed()
                        .thenComparing(match -> !(preferredScope == null ? "PERSONAL" : preferredScope).equals(match.plan().scopeType()))
                        .thenComparing(match -> match.plan().useCount(), Comparator.reverseOrder())
                        .thenComparing(match -> match.plan().id()))
                .filter(match -> match.plan().searchProfile() == null
                        || seenContent.add(match.plan().searchProfile().contentHash()))
                .limit(Math.min(limit, MODEL_CANDIDATE_LIMIT)).toList();
    }

    private Match score(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan, String text,
                        Set<DiagnosisIdentity> diagnoses, String preferredScope) {
        int clinicalScore = 0;
        List<String> evidence = new ArrayList<>();
        for (var diagnosis : plan.diagnoses()) {
            var identity = new DiagnosisIdentity(diagnosis.codeSystem(), diagnosis.diagnosisDomain(), diagnosis.code());
            boolean exactCode = identity.complete() && diagnoses.contains(identity);
            if (exactCode) {
                clinicalScore += 100;
                evidence.add("DIAGNOSIS_CODE:" + identity.codeSystem() + "|" + identity.diagnosisDomain() + "|" + identity.code());
            } else if (contains(text, diagnosis.display())) {
                clinicalScore += 35;
                evidence.add("DIAGNOSIS_TEXT:" + diagnosis.display());
            }
        }
        if (contains(text, plan.name())) {
            clinicalScore += 24;
            evidence.add("PLAN_NAME");
        }
        if (contains(text, plan.description())) {
            clinicalScore += 8;
            evidence.add("PLAN_DESCRIPTION");
        }
        for (var task : plan.tasks()) {
            if (contains(text, task.text())) {
                clinicalScore += 6;
                evidence.add("TASK:" + task.kind());
            }
        }
        if (plan.searchProfile() != null && !text.isEmpty()) {
            Set<String> matched = new LinkedHashSet<>();
            for (String word : plan.searchProfile().keywords()) {
                String term = normalized(word);
                if (term.length() < 2) continue;
                if (text.contains(term)) matched.add(term);
                else for (int i = 0; i + 2 <= term.length(); i++) {
                    String token = term.substring(i, i + 2);
                    if (token.codePoints().allMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN)
                            && text.contains(token)) matched.add(token);
                }
            }
            if (!matched.isEmpty()) {
                clinicalScore += Math.min(18, matched.size() * 3);
                evidence.add("INDEX_TERMS:" + String.join("、", matched.stream().limit(6).toList()));
            }
        }
        int score = clinicalScore;
        if ((preferredScope == null ? "PERSONAL" : preferredScope).equals(plan.scopeType())) {
            score += 4;
            evidence.add("SCOPE:" + plan.scopeType());
        }
        if (plan.useCount() > 0) {
            score += Math.min(8, Long.toString(plan.useCount()).length());
            evidence.add("USAGE:" + plan.useCount());
        }
        return new Match(plan, score, clinicalScore, List.copyOf(new LinkedHashSet<>(evidence)));
    }

    private boolean contains(String normalizedText, String candidate) {
        String value = normalized(candidate);
        return !normalizedText.isEmpty() && !value.isEmpty() && normalizedText.contains(value);
    }

    private String normalized(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT)
                .replaceAll("[\\p{P}\\p{Z}\\s]+", "");
    }

    private String normalizedCode(String value) {
        return value == null || value.isBlank() ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    public record Query(String text, List<DiagnosisIdentity> diagnoses, String preferredScope) {
        public Query(String text, String preferredScope) { this(text, List.of(), preferredScope); }
    }

    public record DiagnosisIdentity(String codeSystem, String diagnosisDomain, String code) {
        public DiagnosisIdentity {
            codeSystem = clean(codeSystem);
            diagnosisDomain = clean(diagnosisDomain);
            code = clean(code);
            if (code != null) code = code.toUpperCase(Locale.ROOT);
        }
        boolean complete() {
            return codeSystem != null && code != null && diagnosisDomain != null
                    && Set.of("WESTERN_MEDICINE", "TCM_DISEASE", "TCM_SYNDROME").contains(diagnosisDomain);
        }

        private static String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    }


    public record Match(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan, int score,
                        int clinicalScore, List<String> evidence) {}
}
