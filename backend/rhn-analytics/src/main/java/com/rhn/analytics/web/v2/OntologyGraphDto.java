package com.rhn.analytics.web.v2;

import com.rhn.analytics.semantic.model.*;
import java.util.List;
import java.util.Map;

/**
 * 数据关系网拓扑图数据传输对象。
 */
public record OntologyGraphDto(
    String version,
    String domain,
    List<OntologyNodeDto> nodes,
    List<OntologyEdgeDto> edges,
    List<DimensionDefinition> dimensions,
    List<MetricDefinition> metrics,
    Map<String, Object> statistics
) {
    public record OntologyNodeDto(
        String id,
        String label,
        String entityCode,
        String table,
        String primaryKey,
        String grain,
        String description,
        String nodeType,
        int metricCount,
        int dimensionCount,
        List<String> attributes
    ) {}

    public record OntologyEdgeDto(
        String id,
        String source,
        String target,
        String cardinality,
        List<JoinCondition> conditions,
        boolean aggregationSafe,
        boolean fanoutRisk,
        String label
    ) {}

    public record CopilotSuggestRequest(
        String prompt,
        String targetEntity
    ) {}

    public record CopilotSuggestResponse(
        String status,
        String rationale,
        String suggestedYamlDiff,
        Map<String, Object> suggestedRules
    ) {}
}
