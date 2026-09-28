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
        if (visiblePlans == null || visiblePlans.isEmpty() || limit <= 0) return List.of();
        String text = normalized(query == null ? null : query.text());
        Set<DiagnosisIdentity> diagnoses = query == null || query.diagnoses() == null
                ? Set.of() : Set.copyOf(query.diagnoses());
        String preferredScope = query == null ? null : clean(query.preferredScope());

        List<Match> scored = visiblePlans.stream().map(plan -> score(plan, text, diagnoses, preferredScope)).toList();
        boolean hasClinicalMatch = scored.stream().anyMatch(match -> match.clinicalScore() > 0);
        return scored.stream()
                .filter(match -> !hasClinicalMatch || match.clinicalScore() > 0)
                .sorted(Comparator.comparingInt(Match::score).reversed()
                        .thenComparing(match -> match.plan().useCount(), Comparator.reverseOrder())
                        .thenComparing(match -> match.plan().id()))
                .limit(Math.min(limit, MODEL_CANDIDATE_LIMIT)).toList();
    }

    private Match score(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan, String text,
                        Set<DiagnosisIdentity> diagnoses, String preferredScope) {
        int clinicalScore = 0;
        List<String> evidence = new ArrayList<>();
        for (var diagnosis : plan.diagnoses()) {
            boolean exactCode = diagnoses.contains(new DiagnosisIdentity(diagnosis.codeSystem(),
                    diagnosis.diagnosisDomain(), diagnosis.code().toUpperCase(Locale.ROOT)));
            if (exactCode) {
                clinicalScore += 100;
                evidence.add("DIAGNOSIS_CODE:" + diagnosis.codeSystem() + "|" + diagnosis.code());
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
        int score = clinicalScore;
        if (preferredScope != null && preferredScope.equals(plan.scopeType())) {
            score += 4;
            evidence.add("SCOPE:" + preferredScope);
        }
        if (plan.useCount() > 0) {
            score += Math.min(8, Long.toString(plan.useCount()).length());
            evidence.add("USAGE:" + plan.useCount());
        }
        if (clinicalScore == 0) evidence.add("FALLBACK_VISIBLE_PLAN");
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

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    public record Query(String text, List<DiagnosisIdentity> diagnoses, String preferredScope) {
        public Query(String text, String preferredScope) { this(text, List.of(), preferredScope); }
    }

    public record DiagnosisIdentity(String codeSystem, String diagnosisDomain, String code) {
        public DiagnosisIdentity {
            codeSystem = codeSystem == null ? DiagnosisNormalizationService.ICD10_SYSTEM : codeSystem.trim();
            diagnosisDomain = diagnosisDomain == null ? "WESTERN_MEDICINE" : diagnosisDomain.trim();
            code = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        }
    }

    public record Match(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot plan, int score,
                        int clinicalScore, List<String> evidence) {}
}
