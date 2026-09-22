package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ClinicalMedicationStandards;
import com.rhn.platform.masterdata.api.MedicationStandardReference;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** Structural readiness only; never an assessment of clinical appropriateness. */
@Service
public class MedicationStandardReadinessService {
    private final MedicationRepository medications;
    private final MedicationStandardService standards;
    private final StandardMedicationCatalogService catalog;
    private final com.rhn.platform.masterdata.infrastructure.MedicationStandardSourceRepository sources;
    private static final List<String> MATCHING_STATUSES = List.of("UNIQUE_MATCH", "MULTIPLE_MATCHES", "DUPLICATE_LOCAL", "TARGET_IN_USE", "IDENTITY_MISMATCH", "NO_CANDIDATE");

    public MedicationStandardReadinessService(MedicationRepository medications, MedicationStandardService standards, StandardMedicationCatalogService catalog,
            com.rhn.platform.masterdata.infrastructure.MedicationStandardSourceRepository sources) {
        this.medications = medications;
        this.standards = standards; this.catalog = catalog; this.sources = sources;
    }

    @Transactional(readOnly = true)
    public Readiness inspect(Long tenant, String query, String filter, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || query == null || query.length() > 200 || filter == null
                || !(MATCHING_STATUSES.contains(filter) || List.of("ALL", "UNMAPPED", "AMBIGUOUS", "STALE", "MISMATCH", "LINKED", "SOURCE_UNVERIFIED", "CONVERSION_UNAVAILABLE", "CLINICAL_CONVERSION_UNAVAILABLE", "CONCENTRATION_AVAILABLE").contains(filter)))
            throw badRequest("MEDICATION_READINESS_QUERY_INVALID", "标准建设查询条件或分页参数不正确");
        // Inspect the full active tenant inventory. Search limits and page size must not change the denominator.
        var active = medications.findByTenantIdOrderByName(tenant).stream().filter(m -> "ACTIVE".equals(m.status()))
                .sorted(Comparator.comparing(com.rhn.platform.masterdata.domain.Medication::name)
                        .thenComparing(com.rhn.platform.masterdata.domain.Medication::id)).toList();
        var references = standards.references(tenant, active);
        // Compare the whole inventory before pagination: two local records must never both look unique.
        var candidates = new HashMap<Long, List<tools.jackson.databind.JsonNode>>();
        var consistent = new HashMap<Long, List<String>>();
        var claims = new HashMap<String, Integer>();
        for (var medication : active) {
            if (!"UNMAPPED".equals(references.get(medication.id()).status())) continue;
            var options = catalog.identityCandidates(medication.code(), medication.name(), medication.aliasName());
            candidates.put(medication.id(), options);
            var matches = options.stream().filter(spec -> standards.identityIssues(medication, spec).isEmpty())
                    .map(spec -> spec.path("id").asString()).toList();
            consistent.put(medication.id(), matches);
            matches.forEach(id -> claims.merge(id, 1, Integer::sum));
        }
        // A previous/current association owned by another local record also prevents direct binding.
        var identity = catalog.summary();
        var occupied = sources.findByTenantId(tenant).stream()
                .filter(source -> source.catalogCode().equals(identity.path("catalogId").asString())
                        && source.catalogVersion().equals(identity.path("catalogVersion").asString()))
                .map(source -> source.specificationCode()).collect(java.util.stream.Collectors.toSet());
        var rows = active.stream().map(m -> {
            var reference = references.get(m.id());
            var conversion = reference.linked()
                    ? ClinicalMedicationStandards.dose(BigDecimal.ONE, reference.presentationUnit(), reference, null) : null;
            return new Item(m.id(), m.code(), m.name(), m.preparationSpec(), reference,
                    conversion == null ? "NOT_ASSESSED" : conversion.status(),
                    conversion == null ? reference.issues() : conversion.unavailableReasons().stream()
                            .filter(reason -> !"FREQUENCY_MISSING".equals(reason)).toList(),
                    matching(candidates.get(m.id()), consistent.get(m.id()), claims, occupied),
                    ClinicalMedicationStandards.conversionCapability(reference));
        }).toList();
        Map<String, Integer> statuses = new LinkedHashMap<>();
        for (String status : List.of("LINKED", "UNMAPPED", "AMBIGUOUS", "STALE", "MISMATCH"))
            statuses.put(status, (int) rows.stream().filter(row -> status.equals(row.standardReference().status())).count());
        var matchingStatuses = new LinkedHashMap<String, Integer>();
        MATCHING_STATUSES.forEach(status -> matchingStatuses.put(status,
                (int) rows.stream().filter(row -> row.matching() != null && status.equals(row.matching().status())).count()));
        var summary = new Summary(rows.size(), statuses, rows.stream().filter(Item::sourceUnverified).count(),
                rows.stream().filter(Item::conversionUnavailable).count(), matchingStatuses,
                rows.stream().filter(Item::clinicalConversionUnavailable).count(),
                rows.stream().filter(Item::concentrationAvailable).count());
        String needle = query.strip().toLowerCase(Locale.ROOT);
        var filtered = rows.stream().filter(row -> row.matches(filter))
                .filter(row -> (row.name() + " " + row.code() + " " + Objects.toString(row.preparationSpec(), ""))
                        .toLowerCase(Locale.ROOT).contains(needle)).toList();
        int from = (int) Math.min((long) page * size, filtered.size());
        return new Readiness(Instant.now(), "TENANT_ACTIVE_MEDICATIONS", summary,
                filtered.subList(from, Math.min(from + size, filtered.size())), filtered.size(),
                (filtered.size() + size - 1) / size, page, size);
    }

    private Matching matching(List<tools.jackson.databind.JsonNode> candidates, List<String> consistent,
                              Map<String, Integer> claims, Set<String> occupied) {
        if (candidates == null) return null;
        String status = candidates.isEmpty() ? "NO_CANDIDATE" : consistent.isEmpty() ? "IDENTITY_MISMATCH"
                : consistent.size() > 1 ? "MULTIPLE_MATCHES" : occupied.contains(consistent.getFirst()) ? "TARGET_IN_USE"
                : claims.getOrDefault(consistent.getFirst(), 0) > 1 ? "DUPLICATE_LOCAL" : "UNIQUE_MATCH";
        return new Matching(status, candidates.size(), consistent.size());
    }
    public record Matching(String status, int candidateCount, int consistentCount) {}
    public record Summary(int totalActive, Map<String, Integer> referenceStatuses, long sourceUnverified,
                          long conversionUnavailable, Map<String, Integer> matchingStatuses,
                          long clinicalConversionUnavailable, long concentrationAvailable) {}
    public record Item(Long medicationId, String code, String name, String preparationSpec,
            MedicationStandardReference standardReference, String presentationConversionStatus, List<String> conversionReasons, Matching matching,
            ClinicalMedicationStandards.ConversionCapability clinicalConversion) {
        boolean sourceUnverified() { return standardReference.linked() && !"VERIFIED".equals(standardReference.sourceVerificationStatus()); }
        boolean conversionUnavailable() { return standardReference.linked() && "UNAVAILABLE".equals(presentationConversionStatus); }
        boolean clinicalConversionUnavailable() { return standardReference.linked() && "UNAVAILABLE".equals(clinicalConversion.status()); }
        boolean concentrationAvailable() { return "COMPUTABLE".equals(clinicalConversion.status()) && "REFERENCE_MASS_PER_VOLUME".equals(clinicalConversion.basis()); }
        boolean matches(String filter) {
            return switch (filter) {
                case "ALL" -> true;
                case "SOURCE_UNVERIFIED" -> sourceUnverified();
                case "CONVERSION_UNAVAILABLE" -> conversionUnavailable();
                case "CLINICAL_CONVERSION_UNAVAILABLE" -> clinicalConversionUnavailable();
                case "CONCENTRATION_AVAILABLE" -> concentrationAvailable();
                default -> filter.equals(standardReference.status()) || matching != null && filter.equals(matching.status());
            };
        }
    }
    public record Readiness(Instant inspectedAt, String scope, Summary summary, List<Item> content,
            int totalElements, int totalPages, int page, int size) {}
}
