package com.rhn.analytics.semantic.registry;

import com.rhn.analytics.semantic.model.Cardinality;
import com.rhn.analytics.semantic.model.RelationshipDefinition;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class RelationshipRegistry {
    private final Map<String, RelationshipDefinition> relationships = new ConcurrentHashMap<>();

    public RelationshipRegistry() {}

    public RelationshipRegistry(Collection<RelationshipDefinition> defs) {
        if (defs != null) {
            defs.forEach(this::register);
        }
    }

    private static String key(String from, String to) {
        return from.toUpperCase(Locale.ROOT) + "->" + to.toUpperCase(Locale.ROOT);
    }

    public void register(RelationshipDefinition rel) {
        Objects.requireNonNull(rel, "Relationship definition cannot be null");
        relationships.put(key(rel.from(), rel.to()), rel);
    }

    public Optional<RelationshipDefinition> findRelationship(String from, String to) {
        if (from == null || to == null) return Optional.empty();
        return Optional.ofNullable(relationships.get(key(from, to)));
    }

    public boolean isAggregationSafe(String from, String to) {
        return findRelationship(from, to)
            .map(RelationshipDefinition::aggregationSafe)
            .orElse(false);
    }

    /**
     * Determines whether branching from a common root entity into two 1:N targets causes a Cartesian product / fanout risk.
     * For example, ENCOUNTER -> DIAGNOSIS (1:N) and ENCOUNTER -> ORDER (1:N) simultaneously joined produces fanout.
     */
    public boolean hasFanoutRisk(String root, String branch1, String branch2) {
        if (root == null || branch1 == null || branch2 == null) return false;
        if (branch1.equalsIgnoreCase(branch2)) return false;

        Optional<RelationshipDefinition> rel1 = findRelationship(root, branch1);
        Optional<RelationshipDefinition> rel2 = findRelationship(root, branch2);

        if (rel1.isEmpty() || rel2.isEmpty()) return true; // unknown path is considered unsafe

        boolean isOneToMany1 = rel1.get().cardinality() == Cardinality.ONE_TO_MANY;
        boolean isOneToMany2 = rel2.get().cardinality() == Cardinality.ONE_TO_MANY;

        return isOneToMany1 && isOneToMany2;
    }

    public List<RelationshipDefinition> allRelationships() {
        return List.copyOf(relationships.values());
    }

    public int size() {
        return relationships.size();
    }
}
