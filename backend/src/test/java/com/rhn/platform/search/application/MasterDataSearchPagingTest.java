package com.rhn.platform.search.application;

import com.rhn.RhnApplication;
import com.rhn.platform.search.api.SearchInputMode;
import com.rhn.platform.search.api.SearchMatchMode;
import com.rhn.platform.search.api.SearchPreference;
import com.rhn.platform.search.domain.SearchEntry;
import com.rhn.platform.search.infrastructure.SearchEntryRepository;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(classes = RhnApplication.class)
@ActiveProfiles("test")
class MasterDataSearchPagingTest {
    private static final Long TENANT = 362387869790209L;
    private static final Long ORGANIZATION = 362387869790211L;
    private static final Long DEPARTMENT = 362387869790212L;

    @Autowired MasterDataSearchService search;
    @Autowired SearchEntryRepository entries;
    @MockitoBean SearchPreferenceResolver preferences;

    @ParameterizedTest
    @CsvSource({"PREFIX,10,41,15", "CONTAINS,30,121,35", "PREFIX,100,401,105", "CONTAINS,10,41,2"})
    void aliasesDoNotConsumeTheDistinctTargetBudget(SearchMatchMode mode, int limit,
                                                   int aliasCount, int distinctTargets) {
        when(preferences.resolve(TENANT, ORGANIZATION, DEPARTMENT))
                .thenReturn(new SearchPreference(SearchInputMode.PINYIN, mode, 0.75, limit));
        String query = "PAGING" + GlobalIds.next();
        var rows = new ArrayList<SearchEntry>();
        var targetIds = new ArrayList<Long>();
        Long first = GlobalIds.next();
        targetIds.add(first);
        for (int alias = 0; alias < aliasCount; alias++) {
            rows.add(entry(first, query, "A-" + String.format("%04d", alias)));
        }
        for (int index = 1; index < distinctTargets; index++) {
            Long targetId = GlobalIds.next();
            targetIds.add(targetId);
            rows.add(entry(targetId, query, "Z-" + String.format("%04d", index)));
        }
        entries.saveAllAndFlush(rows);

        assertThat(search.findMatchingTargetIds("MEDICATION", TENANT, ORGANIZATION, DEPARTMENT,
                query, targetIds)).containsExactlyElementsOf(targetIds.subList(0, Math.min(limit, distinctTargets)));
        assertThat(search.findMatchingTargetIds("MEDICATION", TENANT, ORGANIZATION, DEPARTMENT,
                query)).containsExactlyElementsOf(targetIds.subList(0, Math.min(limit, distinctTargets)));
        assertThat(search.findMatchingTargetIds("MEDICATION", TENANT, ORGANIZATION, DEPARTMENT,
                query, List.of(targetIds.getLast()))).containsExactly(targetIds.getLast());
    }

    @ParameterizedTest
    @CsvSource({"PINYIN,10,201", "ALL,30,601", "WUBI,100,1001"})
    void similarityRanksLateMatchesAndTheBestAliasAcrossAllPages(SearchInputMode inputMode,
                                                                int limit, int aliasCount) {
        when(preferences.resolve(TENANT, ORGANIZATION, DEPARTMENT))
                .thenReturn(new SearchPreference(inputMode, SearchMatchMode.SIMILARITY, 0.75, limit));
        String query = "ZZMATCH" + GlobalIds.next();
        String weakerCode = query.substring(0, query.length() - 1) + "X";
        var rows = new ArrayList<SearchEntry>();
        var weakTargets = new ArrayList<Long>();
        Long aliasedTarget = GlobalIds.next();
        for (int alias = 0; alias < aliasCount; alias++) {
            rows.add(similarityEntry(aliasedTarget, "A-" + String.format("%04d", alias), weakerCode));
        }
        for (int index = 0; index < limit + 5; index++) {
            Long target = GlobalIds.next();
            weakTargets.add(target);
            rows.add(similarityEntry(target, "M-" + String.format("%04d", index), weakerCode));
        }
        Long bestTarget = GlobalIds.next();
        rows.add(similarityEntry(bestTarget, "Z-0-BEST", query));
        rows.add(similarityEntry(weakTargets.getLast(), "Z-1-RETURNING-ALIAS", query));
        rows.add(similarityEntry(aliasedTarget, "Z-2-BETTER-ALIAS", query));
        entries.saveAllAndFlush(rows);

        var candidates = new ArrayList<>(weakTargets);
        candidates.add(aliasedTarget);
        candidates.add(bestTarget);
        var expected = new ArrayList<>(List.of(bestTarget, weakTargets.getLast(), aliasedTarget));
        expected.addAll(weakTargets.subList(0, limit - 3));
        assertThat(search.findMatchingTargetIds("MEDICATION", TENANT, ORGANIZATION, DEPARTMENT,
                query, candidates)).containsExactlyElementsOf(expected);
        assertThat(search.findMatchingTargetIds("MEDICATION", TENANT, ORGANIZATION, DEPARTMENT,
                query)).containsExactlyElementsOf(expected);
        assertThat(search.findMatchingTargetIds("MEDICATION", TENANT, ORGANIZATION, DEPARTMENT,
                query, List.of(aliasedTarget, bestTarget))).containsExactly(bestTarget, aliasedTarget);
    }

    private SearchEntry similarityEntry(Long targetId, String name, String code) {
        return new SearchEntry("TENANT", TENANT, TENANT, "MEDICATION", targetId,
                "ALIAS", "TEST-" + name, name, code, code, null,
                false, "test", "ACTIVE", null);
    }

    private SearchEntry entry(Long targetId, String query, String suffix) {
        return new SearchEntry("TENANT", TENANT, TENANT, "MEDICATION", targetId,
                "ALIAS", "TEST-" + suffix, query + suffix, query, null, null,
                false, "test", "ACTIVE", null);
    }
}
