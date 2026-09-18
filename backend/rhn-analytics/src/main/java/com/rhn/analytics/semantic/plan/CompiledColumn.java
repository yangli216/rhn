package com.rhn.analytics.semantic.plan;

/**
 * 编译后查询结果集的列元数据。
 */
public record CompiledColumn(
    String code,
    String name,
    String alias,
    ColumnType type
) {
    public enum ColumnType {
        DIMENSION,
        MEASURE
    }
}
