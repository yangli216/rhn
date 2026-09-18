package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import org.springframework.stereotype.Component;

import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 逻辑查询计划安全与物理校验器（QueryPlanValidator）。
 * 职责：
 * 1. 粒度兼容性校验（Grain Compatibility）：验证主事实表与分组维度、聚合指标的粒度兼容；
 * 2. 扇出风险风控（Fanout Protection）：拦截一对多/多对多引发的笛卡尔积或聚合膨胀；
 * 3. 租户与安全范围强校验（Security Scope Enforcement）：验证多租户 ID_TNT、组织 ID_ORG 与科室范围隔离；
 * 4. 查询成本与边界校验（Cost & Boundary Bounds）：校验时间跨度、Limit 上限、Join 深度。
 */
@Component
public class QueryPlanValidator {

    public static final int MAX_LIMIT = 2000;
    public static final int MAX_JOINS = 5;
    public static final long MAX_DAYS_SPAN = 1096; // 最长 3 年

    private final SemanticCatalog catalog;

    @org.springframework.beans.factory.annotation.Autowired
    public QueryPlanValidator(OutpatientSemanticCatalogProvider catalogProvider) {
        this.catalog = catalogProvider.getCatalog();
    }

    public QueryPlanValidator(SemanticCatalog catalog) {
        this.catalog = catalog;
    }

    public ValidationResult validate(LogicalQueryPlan plan) {
        if (plan == null) {
            return ValidationResult.failure("LogicalQueryPlan 不能为空");
        }

        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // 1. 主事实表与别名基本合法性校验
        if (plan.primaryEntity() == null || plan.primaryEntity().isBlank()) {
            errors.add("主事实实体 (primaryEntity) 不能为空");
        }
        if (plan.primaryTable() == null || plan.primaryTable().isBlank()) {
            errors.add("主事实表 (primaryTable) 不能为空");
        }
        if (plan.primaryAlias() == null || plan.primaryAlias().isBlank()) {
            errors.add("主事实表别名 (primaryAlias) 不能为空");
        }

        // 2. 指标度量（Measures）校验
        if (plan.measures().isEmpty()) {
            errors.add("查询计划必须至少包含一个统计度量项 (measures)");
        } else {
            for (PlannedMeasure m : plan.measures()) {
                if (m.column() == null || m.column().isBlank()) {
                    errors.add("度量项 [" + m.measureCode() + "] 缺少物理计算列 (column)");
                }
                if (m.aggregate() == null) {
                    errors.add("度量项 [" + m.measureCode() + "] 缺少聚合函数 (aggregate)");
                }

                // 维度支持兼容性检查
                catalog.findMetric(m.measureCode()).ifPresent(metricDef -> {
                    for (PlannedDimension d : plan.dimensions()) {
                        if (!metricDef.supportedDimensions().isEmpty() &&
                            !metricDef.supportedDimensions().contains(d.dimensionCode())) {
                            warnings.add("指标 [" + m.name() + "] 官方支持维度未显式包含 [" + d.name() + "]，已降级按通用拓扑维度聚合");
                        }
                    }
                });
            }
        }

        // 3. 分组维度（Dimensions）校验
        Set<String> dimCodes = new HashSet<>();
        for (PlannedDimension d : plan.dimensions()) {
            if (d.dimensionCode() == null || d.dimensionCode().isBlank()) {
                errors.add("分组维度代码不能为空");
            } else if (!dimCodes.add(d.dimensionCode())) {
                errors.add("存在重复的分组维度: " + d.dimensionCode());
            }
            if ((d.column() == null || d.column().isBlank()) &&
                (d.groupExpression() == null || d.groupExpression().isBlank())) {
                errors.add("分组维度 [" + d.dimensionCode() + "] 缺少物理字段或分组表达式");
            }
        }

        // 4. 连接拓扑（Joins）与扇出风险校验
        if (plan.joins().size() > MAX_JOINS) {
            errors.add("Join 表数量超过安全上限 (" + plan.joins().size() + " > " + MAX_JOINS + ")");
        }

        Set<String> joinAliases = new HashSet<>();
        joinAliases.add(plan.primaryAlias());
        for (PlannedJoin join : plan.joins()) {
            if (join.toTable() == null || join.toTable().isBlank()) {
                errors.add("关联表名不能为空: " + join.toEntity());
            }
            if (join.toAlias() == null || join.toAlias().isBlank()) {
                errors.add("关联表别名不能为空: " + join.toEntity());
            } else if (!joinAliases.add(join.toAlias())) {
                errors.add("关联表别名冲突: " + join.toAlias());
            }
            if (join.conditions().isEmpty()) {
                errors.add("关联关系 [" + join.fromEntity() + " -> " + join.toEntity() + "] 缺少连接条件 (ON 条件)");
            } else {
                for (JoinCondition cond : join.conditions()) {
                    if (cond.fromField() == null || cond.fromField().isBlank() ||
                        cond.toField() == null || cond.toField().isBlank()) {
                        errors.add("关联条件字段不完整: " + cond);
                    }
                }
            }

            // 扇出风险校验：查找 catalog 中的关系基数
            Optional<RelationshipDefinition> relOpt = catalog.relationships().stream()
                .filter(r -> r.from().equalsIgnoreCase(join.fromEntity()) && r.to().equalsIgnoreCase(join.toEntity()))
                .findFirst();
            if (relOpt.isPresent()) {
                RelationshipDefinition rel = relOpt.get();
                if (rel.cardinality() == Cardinality.ONE_TO_MANY || rel.cardinality() == Cardinality.MANY_TO_MANY) {
                    errors.add("存在未经安全控制的扇出 Join 风险: [" + join.fromEntity() + " -> " + join.toEntity() + "] 基数为 " + rel.cardinality());
                }
            }
        }

        // 5. 多租户与安全范围强校验 (Security Scope)
        PlannedScope scope = plan.scope();
        if (scope != null) {
            if (scope.tenantId() != null) {
                boolean hasTenantFilter = plan.filters().stream().anyMatch(f ->
                    f.isScopeFilter() && "ID_TNT".equalsIgnoreCase(f.column()) &&
                    f.operator() == Operator.EQ && f.values().contains(String.valueOf(scope.tenantId())));
                if (!hasTenantFilter) {
                    errors.add("安全校验失败：查询计划中缺失多租户隔离过滤 (ID_TNT = " + scope.tenantId() + ")");
                }
            }
            if (scope.organizationId() != null) {
                boolean hasOrgFilter = plan.filters().stream().anyMatch(f ->
                    f.isScopeFilter() && "ID_ORG".equalsIgnoreCase(f.column()) &&
                    f.operator() == Operator.EQ && f.values().contains(String.valueOf(scope.organizationId())));
                if (!hasOrgFilter) {
                    errors.add("安全校验失败：查询计划中缺失机构数据范围过滤 (ID_ORG = " + scope.organizationId() + ")");
                }
            }
        }

        // 6. 时间窗口边界校验 (Time Range Bounds)
        PlannedTimeRange timeRange = plan.timeRange();
        if (timeRange == null) {
            errors.add("查询计划必须包含时间范围规划 (timeRange)");
        } else {
            if (timeRange.column() == null || timeRange.column().isBlank()) {
                errors.add("时间范围缺少时间列定义");
            }
            if (timeRange.startDate() != null && timeRange.endDate() != null) {
                if (timeRange.startDate().isAfter(timeRange.endDate())) {
                    errors.add("时间范围非法：开始日期 (" + timeRange.startDate() + ") 晚于结束日期 (" + timeRange.endDate() + ")");
                }
                long days = ChronoUnit.DAYS.between(timeRange.startDate(), timeRange.endDate()) + 1;
                if (days > MAX_DAYS_SPAN) {
                    errors.add("时间跨度超过最大安全上限 " + MAX_DAYS_SPAN + " 天 (当前: " + days + " 天)");
                }
            }
        }

        // 7. Limit 与排序代价校验
        if (plan.limit() <= 0) {
            errors.add("查询限制行数 (limit) 必须大于 0");
        } else if (plan.limit() > MAX_LIMIT) {
            errors.add("查询限制行数超过最大上限 (" + plan.limit() + " > " + MAX_LIMIT + ")");
        }

        if (errors.isEmpty()) {
            return ValidationResult.success(warnings);
        } else {
            return new ValidationResult(false, errors, warnings);
        }
    }
}
