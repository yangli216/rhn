package com.rhn.quality.medication.api;

import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope;
import java.time.Instant;
import com.rhn.platform.masterdata.api.MedicationStandardImpactDirectory.Item;
import java.util.List;
import java.util.Map;

public final class MedicationStandardImpactContracts {
    private MedicationStandardImpactContracts() {}
    public record Report(Scope scope, Instant inspectedAt, Map<String,Integer> totals, int historicalCount, int potentialCount,
            List<String> coverage, List<String> limitations, List<Item> content, long totalElements, int totalPages, int page, int size) {}
}
