package com.rhn.platform.web;

import java.util.Optional;

public final class RequestCorrelationContext {
    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private RequestCorrelationContext() {
    }

    public static void set(String correlationId) {
        CURRENT.set(correlationId);
    }

    public static Optional<String> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static String currentOrCreate() {
        return current().orElseGet(() -> Long.toString(com.rhn.shared.id.GlobalIds.next()));
    }

    public static void clear() {
        CURRENT.remove();
    }
}
