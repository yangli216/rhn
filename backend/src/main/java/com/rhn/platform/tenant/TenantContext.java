package com.rhn.platform.tenant;

import java.util.Optional;

public final class TenantContext {
    private static final ThreadLocal<Long> CURRENT = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void set(Long tenantId) {
        CURRENT.set(tenantId);
    }

    public static Long requireTenantId() {
        return Optional.ofNullable(CURRENT.get())
                .orElseThrow(() -> new IllegalStateException("Tenant context is not available"));
    }

    public static Optional<Long> currentTenantId() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static void clear() {
        CURRENT.remove();
    }
}

