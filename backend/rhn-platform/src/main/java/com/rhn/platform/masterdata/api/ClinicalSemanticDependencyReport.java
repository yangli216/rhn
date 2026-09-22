package com.rhn.platform.masterdata.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor.*;

public record ClinicalSemanticDependencyReport(ClinicalUsageStandardDirectory.Scope scope, Instant inspectedAt, Long organizationId, Long departmentId,
        List<Impact> coverage, List<String> limitations, Map<String,Integer> totals, int historicalCount, int potentialCount,
        List<Dependency> content, long totalElements, int totalPages, int page, int size) {}
