package com.rhn.analytics.semantic.resolver;

import com.rhn.analytics.semantic.model.DimensionAttribute;
import com.rhn.analytics.semantic.model.DimensionDefinition;
import com.rhn.analytics.semantic.model.Operator;

import java.util.List;

/**
 * 解析后的业务过滤条件模型。
 * 绑定受控维度与可选的维度属性，携带标准操作符与枚举值，以及人类可读描述。
 */
public record ResolvedFilter(
    DimensionDefinition dimension,
    DimensionAttribute attribute, // 为 null 表示针对维度本身的键值过滤；非 null 表示针对维度的特定属性过滤（如科室类型）
    Operator operator,
    List<String> values,
    String description
) {
    public ResolvedFilter {
        if (dimension == null) throw new IllegalArgumentException("Dimension cannot be null");
        if (operator == null) throw new IllegalArgumentException("Operator cannot be null");
        values = values == null ? List.of() : List.copyOf(values);
    }
}
