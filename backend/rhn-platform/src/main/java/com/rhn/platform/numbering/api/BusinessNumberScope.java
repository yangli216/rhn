package com.rhn.platform.numbering.api;

public enum BusinessNumberScope {
    SYSTEM, TENANT, ORGANIZATION, DEPARTMENT;

    public String key(BusinessNumberContext context) {
        if (this == SYSTEM) return "system";
        if (context == null) throw new IllegalArgumentException("Business number context is required");
        String value = "tenant:" + positive(context.tenantId(), "tenantId");
        if (this == TENANT) return value;
        value += ":organization:" + positive(context.organizationId(), "organizationId");
        if (this == ORGANIZATION) return value;
        return value + ":department:" + positive(context.departmentId(), "departmentId");
    }

    private static Long positive(Long value, String name) {
        if (value == null || value <= 0) throw new IllegalArgumentException(name + " must be positive");
        return value;
    }
}
