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

    public ClinicalTreatmentRecommendationService(ClinicalTreatmentCatalogResolver resolver, ExecutionContextProvider contexts) {
        this.resolver = resolver; this.contexts = contexts;
    }

    public record Result(List<TreatmentRecommendation> items, List<SafetyAlert> alerts, List<TreatmentMatch> matches) {
        public Result(List<TreatmentRecommendation> items, List<SafetyAlert> alerts) { this(items, alerts, List.of()); }
    }

    public List<TreatmentMatch> resolve(List<TreatmentRecommendation> intents, LocalDate date) {
        return resolver.resolve(intents, date);
    }

    public Result recommend(List<TreatmentRecommendation> intents, ClinicalAiModelGateway.ModelRequest request,
                            ClinicalAssistantSettings runtime) {
        long started = System.nanoTime();
        var context = contexts.requireCurrent();
        LocalDate date = request.temporalContext() == null ? LocalDate.now() : request.temporalContext().currentDate();
        var matches = resolver.resolve(intents, date);
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
