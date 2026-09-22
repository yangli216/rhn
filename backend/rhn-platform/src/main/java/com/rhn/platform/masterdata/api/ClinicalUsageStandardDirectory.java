package com.rhn.platform.masterdata.api;

/** Tenant-visible identity lookup, including inactive definitions. Missing definitions may still have old references. */
public interface ClinicalUsageStandardDirectory {
    Scope resolve(String kind, String conceptId);
    record Scope(String kind, String conceptId, String code, String name, String system, String version, String status) {}
}
