package com.rhn.platform.dictionary.domain;

public enum DictionaryAttributeScopeType {
    PLATFORM(0),
    TENANT(1),
    ORGANIZATION(2),
    DEPARTMENT(3);

    private final int depth;

    DictionaryAttributeScopeType(int depth) {
        this.depth = depth;
    }

    public boolean allows(DictionaryAttributeScopeType actual) {
        return actual != null && actual.depth <= depth;
    }

    public int depth() {
        return depth;
    }
}
