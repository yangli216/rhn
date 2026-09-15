package com.rhn.shared.api;

/** Stable HTTP correlation contract shared by filters and endpoint adapters. */
public final class CorrelationIds {
    public static final String HEADER_NAME = "X-Correlation-Id";
    public static final String ATTRIBUTE_NAME = "com.rhn.platform.web.CorrelationIdFilter.correlationId";

    private CorrelationIds() {}
}
