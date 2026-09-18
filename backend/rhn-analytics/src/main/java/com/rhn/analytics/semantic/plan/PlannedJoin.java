package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.JoinCondition;

import java.util.List;

/**
 * 逻辑查询计划中的连接定义。
 * 记录由主事实表向维度表或从表的确定性安全连接。
 */
public record PlannedJoin(
    String fromEntity,
    String fromAlias,
    String toEntity,
    String toTable,
    String toAlias,
    JoinType joinType,
    List<JoinCondition> conditions,
    String reason
) {
    public PlannedJoin {
        if (fromEntity == null || fromEntity.isBlank()) throw new IllegalArgumentException("fromEntity cannot be blank");
        if (toEntity == null || toEntity.isBlank()) throw new IllegalArgumentException("toEntity cannot be blank");
        if (joinType == null) joinType = JoinType.LEFT_JOIN;
        conditions = conditions == null ? List.of() : List.copyOf(conditions);
    }

    public PlannedJoin(
        String fromEntity,
        String toEntity,
        String toTable,
        String toAlias,
        JoinType joinType,
        List<JoinCondition> conditions,
        String reason
    ) {
        this(fromEntity, null, toEntity, toTable, toAlias, joinType, conditions, reason);
    }
}
