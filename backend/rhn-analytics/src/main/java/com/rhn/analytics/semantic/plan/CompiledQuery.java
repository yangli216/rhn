package com.rhn.analytics.semantic.plan;

import java.util.List;
import java.util.Map;

/**
 * 编译后的物理可执行查询对象。
 * 包含结构化 SQL、命名参数字典与列元数据。
 */
public record CompiledQuery(
    String planId,
    String sql,
    Map<String, Object> parameters,
    List<CompiledColumn> columns,
    String grain,
    int limit
) {
    public CompiledQuery {
        parameters = parameters == null ? Map.of() : Map.copyOf(parameters);
        columns = columns == null ? List.of() : List.copyOf(columns);
    }
}
