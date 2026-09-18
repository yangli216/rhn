package com.rhn.analytics.semantic.model;

import java.util.List;
import java.util.Map;

/**
 * 维度属性定义模型。
 * 表达主数据/维度实体上的细分业务属性及其自然语言别名与枚举映射。
 * 例如：科室实体的“科室类型”(dept_type)，对应物理列 SD_DEPT_TYPE，
 * 其枚举 CLINICAL 对应自然语言词汇 ["诊疗科室", "临床科室", "诊疗", "临床"]。
 */
public record DimensionAttribute(
    String code,           // 属性编码，例如 "dept_type"
    String name,           // 属性名称，例如 "科室类型"
    List<String> aliases,  // 属性别名，例如 ["类型", "性质", "类别", "科室性质", "部门类型"]
    String physicalColumn, // 物理列名，例如 "SD_DEPT_TYPE"
    Map<String, List<String>> valueAliases // 枚举值与自然语言别名映射，例如 "CLINICAL" -> ["诊疗科室", "临床科室", "诊疗", "临床", "门诊科室"]
) {
    public DimensionAttribute {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("Attribute code cannot be blank");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Attribute name cannot be blank");
        aliases = aliases == null ? List.of() : List.copyOf(aliases);
        valueAliases = valueAliases == null ? Map.of() : Map.copyOf(valueAliases);
    }
}
