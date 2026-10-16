package com.rhn.platform.search.application;

import com.rhn.platform.search.api.MasterDataSearchDirectory;
import com.rhn.platform.search.api.SearchInputMode;
import com.rhn.platform.search.api.SearchMatchMode;
import com.rhn.platform.search.api.SearchPreference;
import com.rhn.platform.search.domain.SearchEntry;
import com.rhn.platform.search.infrastructure.SearchEntryRepository;
import com.rhn.platform.search.infrastructure.SearchEntryRepository.SimilarityCandidate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

@Service
public class MasterDataSearchService implements MasterDataSearchDirectory {
    private static final Comparator<ScoredEntry> SIMILARITY_ORDER = Comparator
            .comparingDouble(ScoredEntry::score).reversed()
            .thenComparing(value -> !value.entry().getPrimary())
            .thenComparing(value -> value.entry().getSearchName())
            .thenComparing(value -> value.entry().getTargetId());
    private final SearchEntryRepository entries;
    private final SearchCodeGenerator generator;
    private final SearchPreferenceResolver preferences;

    public MasterDataSearchService(SearchEntryRepository entries, SearchCodeGenerator generator,
                                   SearchPreferenceResolver preferences) {
        this.entries = entries;
        this.generator = generator;
        this.preferences = preferences;
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> findMatchingTargetIds(String targetType, Long tenantId, Long organizationId,
                                           Long departmentId, String query) {
        return findMatchingTargetIds(targetType, tenantId, organizationId, departmentId, query, null);
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> findMatchingTargetIds(String targetType, Long tenantId, Long organizationId,
                                           Long departmentId, String query,
                                           Collection<Long> candidateTargetIds) {
        String normalized = generator.normalizeQuery(query);
        if (normalized.isBlank()) return Set.of();
        boolean restricted = candidateTargetIds != null;
        if (restricted && candidateTargetIds.isEmpty()) return Set.of();
        Collection<Long> candidates = restricted ? candidateTargetIds : List.of(-1L);
        SearchPreference preference = preferences.resolve(tenantId, organizationId, departmentId);
        boolean chinese = normalized.codePoints().anyMatch(this::isHan);
        if (preference.matchMode() == SearchMatchMode.SIMILARITY) {
            return findSimilarTargetIds(targetType, tenantId, organizationId, restricted, candidates,
                    normalized, chinese, preference);
        }
        Set<Long> targets = new LinkedHashSet<>();
        int pageSize = preference.resultLimit();
        for (int page = 0; ; page++) {
            List<SearchEntry> matched = entries.findMatches(targetType, tenantId, organizationId, normalized, chinese,
                    preference.inputMode().name(), preference.matchMode().name(), restricted, candidates,
                    PageRequest.of(page, pageSize));
            for (SearchEntry entry : matched) {
                targets.add(entry.targetId());
                if (targets.size() == preference.resultLimit()) return targets;
            }
            if (matched.size() < pageSize) return targets;
        }
    }

    @Override
    public SearchPreference resolvePreference(Long tenantId, Long organizationId, Long departmentId) {
        return preferences.resolve(tenantId, organizationId, departmentId);
    }

    private Set<Long> findSimilarTargetIds(String targetType, Long tenantId, Long organizationId,
                                           boolean restricted, Collection<Long> candidates,
                                           String query, boolean chinese, SearchPreference preference) {
        var bestByTarget = new HashMap<Long, ScoredEntry>();
        var ranked = new TreeSet<>(SIMILARITY_ORDER);
        int pageSize = Math.min(1000, preference.resultLimit() * 20);
        for (int page = 0; ; page++) {
            var batch = entries.findSimilarityCandidates(targetType, tenantId, organizationId,
                    restricted, candidates, PageRequest.of(page, pageSize));
            for (SimilarityCandidate entry : batch) {
                double score = similarity(entry, query, chinese, preference.inputMode());
                if (!(score >= preference.similarityThreshold())) continue;
                var value = new ScoredEntry(entry, score);
                var previous = bestByTarget.get(entry.getTargetId());
                if (previous != null && SIMILARITY_ORDER.compare(value, previous) >= 0) continue;
                if (previous != null) ranked.remove(previous);
                ranked.add(value);
                bestByTarget.put(entry.getTargetId(), value);
                if (ranked.size() > preference.resultLimit()) {
                    var removed = ranked.pollLast();
                    bestByTarget.remove(removed.entry().getTargetId());
                }
            }
            if (batch.size() < pageSize) break;
        }
        return ranked.stream().map(value -> value.entry().getTargetId())
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    private double similarity(SimilarityCandidate entry, String query, boolean chinese, SearchInputMode inputMode) {
        double best = 0;
        if (chinese) return normalizedSimilarity(entry.getSearchName(), query);
        if (inputMode == SearchInputMode.PINYIN || inputMode == SearchInputMode.ALL) {
            best = Math.max(best, normalizedSimilarity(entry.getPinyinCode(), query));
        }
        if (inputMode == SearchInputMode.WUBI || inputMode == SearchInputMode.ALL) {
            best = Math.max(best, normalizedSimilarity(entry.getWubiCode(), query));
        }
        return Math.max(best, normalizedSimilarity(entry.getMnemonicCode(), query));
    }

    private double normalizedSimilarity(String value, String query) {
        if (value == null || value.isBlank()) return 0;
        if (value.startsWith(query)) return 1;
        int distance = levenshtein(value, query);
        return 1d - (double) distance / Math.max(value.length(), query.length());
    }

    private int levenshtein(String left, String right) {
        int[] previous = new int[right.length() + 1];
        for (int j = 0; j <= right.length(); j++) previous[j] = j;
        for (int i = 1; i <= left.length(); i++) {
            int[] current = new int[right.length() + 1];
            current[0] = i;
            for (int j = 1; j <= right.length(); j++) {
                int cost = left.charAt(i - 1) == right.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }
            previous = current;
        }
        return previous[right.length()];
    }

    private boolean isHan(int codePoint) {
        return Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.HAN;
    }

    private record ScoredEntry(SimilarityCandidate entry, double score) {}
}
