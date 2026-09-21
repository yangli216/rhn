package com.rhn.platform.search.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.search.api.SearchInputMode;
import com.rhn.platform.search.api.SearchMatchMode;
import com.rhn.platform.search.api.SearchPreference;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class SearchPreferenceResolver {
    public static final String INPUT_MODE = "master-data.search.input-mode";
    public static final String MATCH_MODE = "master-data.search.match-mode";
    public static final String SIMILARITY_THRESHOLD = "master-data.search.similarity-threshold";
    public static final String RESULT_LIMIT = "master-data.search.result-limit";

    private final ConfigurationDirectory configuration;
    private final ExecutionContextProvider contexts;

    public SearchPreferenceResolver(ConfigurationDirectory configuration, ExecutionContextProvider contexts) {
        this.configuration = configuration;
        this.contexts = contexts;
    }

    public SearchPreference resolve(Long tenantId, Long organizationId, Long departmentId) {
        ExecutionContext current = contexts.requireCurrent();
        Long userId = current == null ? null : current.subjectId();
        Long scopedDepartmentId = organizationId == null ? null : departmentId;
        return new SearchPreference(
                enumValue(tenantId, userId, organizationId, scopedDepartmentId, INPUT_MODE,
                        SearchInputMode.class, SearchPreference.DEFAULT.inputMode()),
                enumValue(tenantId, userId, organizationId, scopedDepartmentId, MATCH_MODE,
                        SearchMatchMode.class, SearchPreference.DEFAULT.matchMode()),
                doubleValue(tenantId, userId, organizationId, scopedDepartmentId, SIMILARITY_THRESHOLD,
                        SearchPreference.DEFAULT.similarityThreshold()),
                intValue(tenantId, userId, organizationId, scopedDepartmentId, RESULT_LIMIT,
                        SearchPreference.DEFAULT.resultLimit()));
    }

    private <T extends Enum<T>> T enumValue(Long tenantId, Long userId, Long organizationId, Long departmentId,
                                             String key, Class<T> type, T fallback) {
        var value = configuration.resolveCurrent(tenantId, userId, organizationId, departmentId, key);
        if (value == null || value.value() == null) return fallback;
        try {
            return Enum.valueOf(type, value.value().asString().trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private double doubleValue(Long tenantId, Long userId, Long organizationId, Long departmentId,
                               String key, double fallback) {
        var value = configuration.resolveCurrent(tenantId, userId, organizationId, departmentId, key);
        double resolved = value == null || value.value() == null ? fallback : value.value().asDouble(fallback);
        return resolved >= 0.5 && resolved <= 1 ? resolved : fallback;
    }

    private int intValue(Long tenantId, Long userId, Long organizationId, Long departmentId,
                         String key, int fallback) {
        var value = configuration.resolveCurrent(tenantId, userId, organizationId, departmentId, key);
        int resolved = value == null || value.value() == null ? fallback : value.value().asInt(fallback);
        return resolved >= 10 && resolved <= 100 ? resolved : fallback;
    }
}
