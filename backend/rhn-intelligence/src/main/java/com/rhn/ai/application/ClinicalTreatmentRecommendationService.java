package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.*;
import com.rhn.shared.context.ExecutionContextProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.List;

/** Resolves catalog facts once; ambiguous or unavailable intents remain available for physician review. */
@Service
public class ClinicalTreatmentRecommendationService {
    private static final Logger log = LoggerFactory.getLogger(ClinicalTreatmentRecommendationService.class);
    private final ClinicalTreatmentCatalogResolver resolver;
    private final ExecutionContextProvider contexts;
    private final TreatmentCatalogDecisionService decisions;

    public ClinicalTreatmentRecommendationService(ClinicalTreatmentCatalogResolver resolver, ExecutionContextProvider contexts,
                                                 TreatmentCatalogDecisionService decisions) {
        this.resolver = resolver; this.contexts = contexts; this.decisions = decisions;
    }

    public record Result(List<TreatmentRecommendation> items, List<SafetyAlert> alerts, List<TreatmentMatch> matches) {
        public Result(List<TreatmentRecommendation> items, List<SafetyAlert> alerts) { this(items, alerts, List.of()); }
    }

    public List<TreatmentMatch> resolve(List<TreatmentRecommendation> intents, LocalDate date) {
        return reviewDecisions(resolver.resolve(intents, date));
    }

    private List<TreatmentMatch> reviewDecisions(List<TreatmentMatch> matches) {
        var pending = matches.stream().filter(match -> !"MATCHED".equals(match.status())).toList();
        var withCandidates = pending.stream().filter(match -> !match.candidates().isEmpty()).toList();
        var groups = withCandidates.stream().map(match -> new TreatmentCatalogDecisionService.Group(
                match.intent(), match.candidates())).toList();
        var context = contexts.requireCurrent();
        var attempt = groups.isEmpty() ? null : decisions.match(groups, context);
        // The clinician confirms every pending match, regardless of mode or confidence.
        // Only raw, validated judgments are projected; threshold filtering must not hide low confidence.
        var reviews = new java.util.LinkedHashMap<String, TreatmentDecisionReview>();
        for (var match : pending) {
            var index = withCandidates.indexOf(match);
            var raw = attempt == null ? null : attempt.raw();
            var answer = raw == null || index < 0 ? null : raw.answers().get("intent_" + index);
            var suggested = answer == null ? null : match.candidates().stream()
                    .filter(item -> TreatmentCatalogDecisionService.key(item).equals(answer.choice())).findFirst().orElse(null);
            boolean valid = answer != null && Double.isFinite(answer.confidence())
                    && answer.confidence() >= 0 && answer.confidence() <= 1
                    && ("NONE".equals(answer.choice()) || suggested != null);
            String status = match.candidates().isEmpty() ? "NO_CANDIDATES" : valid ? "COMPLETED"
                    : attempt != null && attempt.alerts().isEmpty() && raw == null ? "DISABLED" : "UNAVAILABLE";
            String detail = "NO_CANDIDATES".equals(status) ? "暂无院内候选可供 Jev 核查。"
                    : "COMPLETED".equals(status) ? "仅核查目录语义匹配，不代表临床适用性；需医生确认。"
                    : "DISABLED".equals(status) ? "Jev 核查未启用。" : "Jev 核查未完成，保留人工匹配。";
            reviews.put(match.key(), new TreatmentDecisionReview(status, raw == null ? null : raw.model(),
                    attempt == null ? null : attempt.mode(), valid ? answer.confidence() : null,
                    attempt == null ? null : attempt.threshold(), valid ? suggested : null,
                    valid ? answer.choice() : null, raw == null ? null : raw.traceId(),
                    raw == null ? null : raw.latencyMs(), detail));
        }
        return matches.stream().map(match -> new TreatmentMatch(match.key(), match.intent(), match.status(),
                match.reason(), match.candidates(), reviews.get(match.key()))).toList();
    }

    public Result recommend(List<TreatmentRecommendation> intents, ClinicalAiModelGateway.ModelRequest request,
                            ClinicalAssistantSettings runtime) {
        long started = System.nanoTime();
        var context = contexts.requireCurrent();
        LocalDate date = request.temporalContext() == null ? LocalDate.now() : request.temporalContext().currentDate();
        // Model search intents cannot impersonate a physician's explicit catalog selection.
        var searchIntents = intents.stream().map(item -> item == null ? null : new TreatmentRecommendation(
                item.type(), null, null, null, item.name(), item.specification(), item.rationale())).toList();
        var matches = resolve(searchIntents, date);
        var items = matches.stream().filter(match -> "MATCHED".equals(match.status()))
                .flatMap(match -> match.candidates().stream())
                .collect(java.util.stream.Collectors.toMap(item -> item.type() + ":" + item.catalogItemId(),
                        item -> item, (first, other) -> first, java.util.LinkedHashMap::new)).values().stream().toList();
        var pending = matches.stream().filter(match -> !"MATCHED".equals(match.status())).toList();
        var alerts = pending.stream().map(match -> new SafetyAlert(
                "CATALOG_ERROR".equals(match.status()) || "SPECIFICATION_REVIEW".equals(match.status()) ? "WARNING" : "INFO",
                "医嘱建议待核对", match.intent().name() + "：" + match.reason())).toList();
        long elapsed = (System.nanoTime() - started) / 1_000_000;
        log.info("clinical_ai_treatment_timing correlationId={} outcome={} intentCount={} candidateCount={} "
                        + "deterministicCount={} ambiguousCount={} pendingCount={} catalogLookupMs={} totalMs={}",
                context.correlationId(), pending.isEmpty() ? "DETERMINISTIC" : items.isEmpty() ? "REVIEW_REQUIRED" : "PARTIAL_MATCH",
                intents.size(), matches.stream().mapToInt(match -> match.candidates().size()).sum(), items.size(),
                pending.stream().filter(match -> "AMBIGUOUS".equals(match.status())).count(), pending.size(), elapsed, elapsed);
        return new Result(items, alerts, pending);
    }
}
