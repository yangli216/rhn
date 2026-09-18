package com.rhn.analytics.semantic.registry;

import com.rhn.analytics.semantic.model.DimensionDefinition;
import com.rhn.analytics.semantic.model.MetricDefinition;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class DimensionRegistry {
    private final Map<String, DimensionDefinition> byCode = new ConcurrentHashMap<>();
    private final Map<String, DimensionDefinition> byAlias = new ConcurrentHashMap<>();

    public DimensionRegistry() {}

    public DimensionRegistry(Collection<DimensionDefinition> dimensions) {
        if (dimensions != null) {
            dimensions.forEach(this::register);
        }
    }

    public void register(DimensionDefinition dimension) {
        Objects.requireNonNull(dimension, "Dimension definition cannot be null");
        byCode.put(dimension.code().toUpperCase(Locale.ROOT), dimension);
        byAlias.put(dimension.name().toLowerCase(Locale.ROOT), dimension);
        for (String alias : dimension.aliases()) {
            byAlias.put(alias.toLowerCase(Locale.ROOT), dimension);
        }
    }

    public Optional<DimensionDefinition> findByCode(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        return Optional.ofNullable(byCode.get(code.toUpperCase(Locale.ROOT)));
    }

    public Optional<DimensionDefinition> findByAlias(String alias) {
        if (alias == null || alias.isBlank()) return Optional.empty();
        return Optional.ofNullable(byAlias.get(alias.toLowerCase(Locale.ROOT)));
    }

    public Optional<DimensionDefinition> findByText(String text) {
        if (text == null || text.isBlank()) return Optional.empty();
        return findByCode(text).or(() -> findByAlias(text));
    }

    public boolean isCompatible(MetricDefinition metric, DimensionDefinition dimension) {
        if (metric == null || dimension == null) return false;
        // 1. If metric defines supportedDimensions explicitly, check it
        if (!metric.supportedDimensions().isEmpty()) {
            if (metric.supportedDimensions().contains(dimension.code())) return true;
        }
        // 2. If dimension defines compatibleMetrics explicitly, check it
        if (!dimension.compatibleMetrics().isEmpty()) {
            if (dimension.compatibleMetrics().contains(metric.code())) return true;
        }
        // 3. Common time dimensions (DAY, MONTH) are compatible with all metrics having timeDimension
        if (dimension.code().equals("DAY") || dimension.code().equals("MONTH")) {
            return metric.timeDimension() != null && !metric.timeDimension().isBlank();
        }
        return false;
    }

    public List<DimensionDefinition> allDimensions() {
        return List.copyOf(byCode.values());
    }

    public int size() {
        return byCode.size();
    }
}
