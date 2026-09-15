package com.rhn.analytics.api;

/** No clinical data, identifiers, physical mappings or policy details are exposed here. */
public record AnalyticsCapabilities(boolean enabled, boolean queryExecutionEnabled, String contractVersion, boolean pilotEnabled) {}
