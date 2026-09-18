package com.rhn.analytics.semantic.model;

public record EntityDefinition(
    String code,
    String name,
    String description,
    String primaryKey,
    String grain,
    String table
) {
    public EntityDefinition(String code, String name, String description, String primaryKey, String grain) {
        this(code, name, description, primaryKey, grain, null);
    }

    public EntityDefinition {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Entity code cannot be blank");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Entity name cannot be blank");
    }
}
