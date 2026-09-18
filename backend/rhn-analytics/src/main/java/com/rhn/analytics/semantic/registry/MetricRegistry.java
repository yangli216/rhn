package com.rhn.analytics.semantic.registry;

import com.rhn.analytics.semantic.model.MetricDefinition;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class MetricRegistry {
    private final Map<String, MetricDefinition> byCode = new ConcurrentHashMap<>();
    private final Map<String, MetricDefinition> byAlias = new ConcurrentHashMap<>();

    public MetricRegistry() {}

    public MetricRegistry(Collection<MetricDefinition> metrics) {
        if (metrics != null) {
            metrics.forEach(this::register);
        }
    }

    public void register(MetricDefinition metric) {
        Objects.requireNonNull(metric, "Metric definition cannot be null");
        byCode.put(metric.code().toUpperCase(Locale.ROOT), metric);
        byAlias.put(metric.name().toLowerCase(Locale.ROOT), metric);
        for (String alias : metric.aliases()) {
            byAlias.put(alias.toLowerCase(Locale.ROOT), metric);
        }
    }

    public Optional<MetricDefinition> findByCode(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        return Optional.ofNullable(byCode.get(code.toUpperCase(Locale.ROOT)));
    }

    public Optional<MetricDefinition> findByAlias(String alias) {
        if (alias == null || alias.isBlank()) return Optional.empty();
        return Optional.ofNullable(byAlias.get(alias.toLowerCase(Locale.ROOT)));
    }

    public Optional<MetricDefinition> findByText(String text) {
        if (text == null || text.isBlank()) return Optional.empty();
        return findByCode(text).or(() -> findByAlias(text));
    }

    public List<MetricDefinition> searchCandidates(String text) {
        if (text == null || text.isBlank()) return List.of();
        String lower = text.toLowerCase(Locale.ROOT);
        Set<MetricDefinition> candidates = new LinkedHashSet<>();
        // exact alias/name match first
        findByAlias(text).ifPresent(candidates::add);
        // then substring match in name or aliases
        for (MetricDefinition m : byCode.values()) {
            if (m.name().toLowerCase(Locale.ROOT).contains(lower)) {
                candidates.add(m);
            } else {
                for (String a : m.aliases()) {
                    if (a.toLowerCase(Locale.ROOT).contains(lower) || lower.contains(a.toLowerCase(Locale.ROOT))) {
                        candidates.add(m);
                        break;
                    }
                }
            }
        }
        return List.copyOf(candidates);
    }

    public List<MetricDefinition> allMetrics() {
        return List.copyOf(byCode.values());
    }

    public int size() {
        return byCode.size();
    }
}
