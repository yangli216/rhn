package com.rhn.platform.search.application;

import com.rhn.platform.search.api.MasterDataSearchDirectory;
import com.rhn.platform.search.api.SearchInputMode;
import com.rhn.platform.search.api.SearchMatchMode;
import com.rhn.platform.search.api.SearchPreference;
import com.rhn.platform.search.domain.SearchEntry;
import com.rhn.platform.search.infrastructure.SearchEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class MasterDataSearchService implements MasterDataSearchDirectory {
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
        List<SearchEntry> matched;
        if (preference.matchMode() == SearchMatchMode.SIMILARITY) {
            matched = entries.findSimilarityCandidates(targetType, tenantId, organizationId,
                    restricted, candidates,
                    PageRequest.of(0, Math.min(1000, preference.resultLimit() * 20))).stream()
                    .map(entry -> new ScoredEntry(entry,
                            similarity(entry, normalized, chinese, preference.inputMode())))
                    .filter(value -> value.score() >= preference.similarityThreshold())
                    .sorted(Comparator.comparingDouble(ScoredEntry::score).reversed()
                            .thenComparing(value -> !value.entry().primary())
                            .thenComparing(value -> value.entry().searchName()))
                    .map(ScoredEntry::entry)
                    .toList();
        } else {
            matched = entries.findMatches(targetType, tenantId, organizationId, normalized, chinese,
                    preference.inputMode().name(), preference.matchMode().name(), restricted, candidates,
                    PageRequest.of(0, Math.min(400, preference.resultLimit() * 4)));
        }
        return matched.stream().map(SearchEntry::targetId)
                .distinct().limit(preference.resultLimit())
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    @Override
    public SearchPreference resolvePreference(Long tenantId, Long organizationId, Long departmentId) {
        return preferences.resolve(tenantId, organizationId, departmentId);
    }

    private double similarity(SearchEntry entry, String query, boolean chinese, SearchInputMode inputMode) {
        double best = 0;
        if (chinese) return normalizedSimilarity(entry.searchName(), query);
        if (inputMode == SearchInputMode.PINYIN || inputMode == SearchInputMode.ALL) {
            best = Math.max(best, normalizedSimilarity(entry.pinyinCode(), query));
        }
        if (inputMode == SearchInputMode.WUBI || inputMode == SearchInputMode.ALL) {
            best = Math.max(best, normalizedSimilarity(entry.wubiCode(), query));
        }
        return Math.max(best, normalizedSimilarity(entry.mnemonicCode(), query));
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

    private record ScoredEntry(SearchEntry entry, double score) {}
}
