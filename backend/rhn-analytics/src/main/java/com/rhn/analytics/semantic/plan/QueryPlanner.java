package com.rhn.analytics.semantic.plan;

import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import com.rhn.analytics.semantic.resolver.*;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

/**
 * 确定性逻辑查询规划器（QueryPlanner）。
 * 职责：
 * 1. 100% 确定性代码实现，0% LLM 参与；
 * 2. 粒度规划（Grain Planning）：以主指标为中心确定主事实表与聚合粒度；
 * 3. 实体关系图路径规划（Join Path Planning）：基于拓扑关系网自动规划无扇出风险的安全 Join；
 * 4. 谓词下推规划（Predicate Pushdown）：将多租户安全范围、时间范围、指标默认业务过滤及维度属性过滤安全下推；
 * 5. 生成与物理执行引擎解耦的标准 LogicalQueryPlan。
 */
@Service
public class QueryPlanner {

    private final SemanticCatalog catalog;

    @org.springframework.beans.factory.annotation.Autowired
    public QueryPlanner(OutpatientSemanticCatalogProvider catalogProvider) {
        this.catalog = catalogProvider.getCatalog();
    }

    public QueryPlanner(SemanticCatalog catalog) {
        this.catalog = catalog;
    }

    public LogicalQueryPlan plan(ResolvedSemanticQuery query) {
        return plan(query, PlannedScope.defaultDevScope(), LocalDate.now());
    }

    public LogicalQueryPlan plan(ResolvedSemanticQuery query, PlannedScope scope, LocalDate today) {
        Objects.requireNonNull(query, "ResolvedSemanticQuery cannot be null");
        if (query.metrics().isEmpty()) {
            throw new IllegalArgumentException("Cannot plan a query without metrics");
        }
        if (scope == null) scope = PlannedScope.defaultDevScope();
        if (today == null) today = LocalDate.now();

        String planId = "plan-" + UUID.randomUUID().toString().substring(0, 8);

        // 1. 确定主事实实体与表别名 (Primary Fact Entity)
        ResolvedMetric primaryMetric = query.metrics().get(0);
        MetricDefinition metricDef = primaryMetric.definition();
        String primaryEntity = metricDef.source(); // e.g. CHARGE, ORDER, ENCOUNTER, DIAGNOSIS
        EntityDefinition factEntityDef = findEntity(primaryEntity);
        String primaryTable = factEntityDef.table() != null ? factEntityDef.table() : resolveDefaultTable(primaryEntity);
        String primaryAlias = "t0";
        String grain = metricDef.grain();

        // 2. 规划连接拓扑 (Join Path Planning)
        List<PlannedJoin> joins = new ArrayList<>();
        Set<String> joinedEntities = new HashSet<>();

        // 检查是否需要连接 DEPARTMENT (科室主数据)
        boolean needsDeptJoin = false;
        // 维度中是否包含科室
        for (ResolvedDimension rd : query.dimensions()) {
            if (rd.definition().code().endsWith("_DEPARTMENT")) {
                needsDeptJoin = true;
                break;
            }
        }
        // 属性过滤中是否包含科室属性 (如 dept_type)
        for (ResolvedFilter rf : query.resolvedFilters()) {
            if (rf.attribute() != null && "dept_type".equalsIgnoreCase(rf.attribute().code())) {
                needsDeptJoin = true;
                break;
            }
        }
        // 指标默认过滤中是否包含科室属性 (如 deptType=CLINICAL)
        for (DefaultFilter df : metricDef.defaultFilters()) {
            if ("deptType".equalsIgnoreCase(df.field())) {
                needsDeptJoin = true;
                break;
            }
        }
        // 如果具有授权科室过滤，非科室/就诊实体也需桥接科室
        if (!scope.authorizedDepartments().isEmpty() && !primaryEntity.equals("DEPARTMENT") && !primaryEntity.equals("ENCOUNTER")) {
            needsDeptJoin = true;
        }

        if (needsDeptJoin && !primaryEntity.equals("DEPARTMENT")) {
            if (!primaryEntity.equals("ENCOUNTER")) {
                if (!joinedEntities.contains("ENCOUNTER")) {
                    EntityDefinition encDef = findEntity("ENCOUNTER");
                    String encTable = encDef.table() != null ? encDef.table() : resolveDefaultTable("ENCOUNTER");
                    joins.add(new PlannedJoin(
                        primaryEntity,
                        primaryAlias,
                        "ENCOUNTER",
                        encTable,
                        "enc",
                        JoinType.LEFT_JOIN,
                        List.of(
                            JoinCondition.on("ID_ENC", "ID_ENC"),
                            JoinCondition.on("ID_TNT", "ID_TNT")
                        ),
                        "关联门诊就诊以桥接科室主数据"
                    ));
                    joinedEntities.add("ENCOUNTER");
                }
                EntityDefinition deptDef = findEntity("DEPARTMENT");
                String deptTable = deptDef.table() != null ? deptDef.table() : resolveDefaultTable("DEPARTMENT");
                joins.add(new PlannedJoin(
                    "ENCOUNTER",
                    "enc",
                    "DEPARTMENT",
                    deptTable,
                    "dept",
                    JoinType.LEFT_JOIN,
                    List.of(
                        JoinCondition.on("ID_DEPT", "ID_DEPT"),
                        JoinCondition.on("ID_TNT", "ID_TNT")
                    ),
                    "关联科室主数据表以获取科室名称与属性过滤"
                ));
                joinedEntities.add("DEPARTMENT");
            } else {
                EntityDefinition deptDef = findEntity("DEPARTMENT");
                String deptTable = deptDef.table() != null ? deptDef.table() : resolveDefaultTable("DEPARTMENT");
                joins.add(new PlannedJoin(
                    primaryEntity,
                    primaryAlias,
                    "DEPARTMENT",
                    deptTable,
                    "dept",
                    JoinType.LEFT_JOIN,
                    List.of(
                        JoinCondition.on("ID_DEPT", "ID_DEPT"),
                        JoinCondition.on("ID_TNT", "ID_TNT")
                    ),
                    "关联科室主数据表以获取科室名称与属性过滤"
                ));
                joinedEntities.add("DEPARTMENT");
            }
        }

        // 检查 CHARGE 是否需要连接 ORDER (例如药品费用需要 orderKind=MEDICATION & orderStatus=ACTIVE)
        boolean needsOrderJoin = false;
        if (primaryEntity.equals("CHARGE")) {
            for (DefaultFilter df : metricDef.defaultFilters()) {
                if ("orderKind".equalsIgnoreCase(df.field()) || "orderStatus".equalsIgnoreCase(df.field())) {
                    needsOrderJoin = true;
                    break;
                }
            }
            for (ResolvedDimension rd : query.dimensions()) {
                if ("ORDER_TYPE".equals(rd.definition().code())) {
                    needsOrderJoin = true;
                    break;
                }
            }
        }

        if (needsOrderJoin && !primaryEntity.equals("ORDER")) {
            EntityDefinition orderDef = findEntity("ORDER");
            String orderTable = orderDef.table() != null ? orderDef.table() : "RHN_EX_CARE_REQ";
            joins.add(new PlannedJoin(
                primaryEntity,
                "ORDER",
                orderTable,
                "req",
                JoinType.LEFT_JOIN,
                List.of(
                    JoinCondition.on("ID_CARE_REQ", "ID_CARE_REQ"),
                    JoinCondition.on("ID_TNT", "ID_TNT")
                ),
                "关联门诊医嘱表以执行医嘱类别与状态过滤"
            ));
            joinedEntities.add("ORDER");
        }

        // 3. 分组维度规划 (Dimension Planning)
        List<PlannedDimension> dimensions = new ArrayList<>();
        String timeCol = metricDef.timeDimension();
        for (ResolvedDimension rd : query.dimensions()) {
            String dimCode = rd.definition().code();
            String name = rd.definition().name();
            switch (dimCode) {
                case "DAY" -> dimensions.add(new PlannedDimension(
                    dimCode, name, primaryEntity, primaryAlias, timeCol,
                    primaryAlias + "." + timeCol
                ));
                case "MONTH" -> dimensions.add(new PlannedDimension(
                    dimCode, name, primaryEntity, primaryAlias, timeCol,
                    "TO_CHAR(" + primaryAlias + "." + timeCol + ", 'YYYY-MM')"
                ));
                case "CHARGE_DEPARTMENT", "ORDER_DEPARTMENT", "ENCOUNTER_DEPARTMENT" -> {
                    String tableAlias = joinedEntities.contains("DEPARTMENT") ? "dept" : primaryAlias;
                    dimensions.add(new PlannedDimension(
                        dimCode, name, "DEPARTMENT", tableAlias, "ID_DEPT",
                        tableAlias + ".ID_DEPT"
                    ));
                }
                case "ORDER_TYPE" -> {
                    String tableAlias = joinedEntities.contains("ORDER") ? "req" : primaryAlias;
                    dimensions.add(new PlannedDimension(
                        dimCode, name, "ORDER", tableAlias, "SD_REQ_KIND",
                        tableAlias + ".SD_REQ_KIND"
                    ));
                }
                case "ITEM" -> dimensions.add(new PlannedDimension(
                    dimCode, name, primaryEntity, primaryAlias, "ID_CATALOG_ITEM",
                    primaryAlias + ".ID_CATALOG_ITEM"
                ));
                case "DIAGNOSIS" -> dimensions.add(new PlannedDimension(
                    dimCode, name, primaryEntity, primaryAlias, "CD_ENC_DIAG",
                    primaryAlias + ".CD_ENC_DIAG"
                ));
                case "STATUS" -> dimensions.add(new PlannedDimension(
                    dimCode, name, primaryEntity, primaryAlias, "SD_STATUS",
                    primaryAlias + ".SD_STATUS"
                ));
                default -> dimensions.add(new PlannedDimension(
                    dimCode, name, primaryEntity, primaryAlias, rd.definition().field(),
                    primaryAlias + "." + rd.definition().field()
                ));
            }
        }

        // 4. 统计度量规划 (Measure Planning)
        List<PlannedMeasure> measures = new ArrayList<>();
        for (ResolvedMetric rm : query.metrics()) {
            MetricDefinition mDef = rm.definition();
            String physicalCol = resolvePhysicalColumn(mDef.field());
            List<PlannedFilter> defaultPlannedFilters = new ArrayList<>();

            for (DefaultFilter df : mDef.defaultFilters()) {
                defaultPlannedFilters.add(resolveDefaultFilter(df, primaryEntity, primaryAlias, joinedEntities));
            }

            measures.add(new PlannedMeasure(
                mDef.code(),
                mDef.name(),
                primaryEntity,
                primaryAlias,
                physicalCol,
                mDef.aggregate(),
                defaultPlannedFilters
            ));
        }

        // 5. 谓词过滤下推规划 (Predicate Pushdown Planning)
        List<PlannedFilter> filters = new ArrayList<>();

        // 5.1 租户与组织安全范围过滤 (Tenant & Org Scope)
        if (scope.tenantId() != null) {
            filters.add(new PlannedFilter(
                primaryEntity, primaryAlias, "ID_TNT", Operator.EQ,
                List.of(String.valueOf(scope.tenantId())), "租户隔离安全过滤", true
            ));
        }
        if (scope.organizationId() != null) {
            filters.add(new PlannedFilter(
                primaryEntity, primaryAlias, "ID_ORG", Operator.EQ,
                List.of(String.valueOf(scope.organizationId())), "机构数据范围过滤", true
            ));
        }

        // 5.2 授权科室范围过滤 (Department Scope)
        if (!scope.authorizedDepartments().isEmpty()) {
            List<String> deptIds = scope.authorizedDepartments().keySet().stream().map(String::valueOf).toList();
            String filterEntity;
            String filterAlias;
            if (primaryEntity.equals("DEPARTMENT")) {
                filterEntity = "DEPARTMENT";
                filterAlias = primaryAlias;
            } else if (primaryEntity.equals("ENCOUNTER")) {
                filterEntity = "ENCOUNTER";
                filterAlias = primaryAlias;
            } else if (primaryEntity.equals("CHARGE")) {
                filterEntity = "CHARGE";
                filterAlias = primaryAlias;
            } else if (joinedEntities.contains("DEPARTMENT")) {
                filterEntity = "DEPARTMENT";
                filterAlias = "dept";
            } else if (joinedEntities.contains("ENCOUNTER")) {
                filterEntity = "ENCOUNTER";
                filterAlias = "enc";
            } else {
                filterEntity = primaryEntity;
                filterAlias = primaryAlias;
            }
            filters.add(new PlannedFilter(
                filterEntity, filterAlias, "ID_DEPT", Operator.IN,
                deptIds, "用户可访问科室权限切片", true
            ));
        }

        // 5.3 统计指标默认过滤条件 (Metric Default Filters)
        for (PlannedMeasure pm : measures) {
            for (PlannedFilter pf : pm.defaultFilters()) {
                if (filters.stream().noneMatch(existing -> isSameFilter(existing, pf))) {
                    filters.add(pf);
                }
            }
        }

        // 5.4 显式与隐式业务过滤条件 (Query Resolved Filters)
        for (ResolvedFilter rf : query.resolvedFilters()) {
            PlannedFilter targetFilter;
            if (rf.attribute() != null && "dept_type".equalsIgnoreCase(rf.attribute().code())) {
                String tableAlias = joinedEntities.contains("DEPARTMENT") ? "dept" : primaryAlias;
                targetFilter = new PlannedFilter(
                    "DEPARTMENT",
                    tableAlias,
                    rf.attribute().physicalColumn(),
                    rf.operator(),
                    rf.values(),
                    rf.description(),
                    false
                );
            } else {
                String tableAlias = primaryAlias;
                targetFilter = new PlannedFilter(
                    rf.dimension().entity(),
                    tableAlias,
                    rf.dimension().field(),
                    rf.operator(),
                    rf.values(),
                    rf.description(),
                    false
                );
            }
            if (filters.stream().noneMatch(existing -> isSameFilter(existing, targetFilter))) {
                filters.add(targetFilter);
            }
        }

        // 6. 时间窗口规划 (Time Range Planning)
        TimeIntent period = query.period();
        PlannedTimeRange timeRange = resolveTimeRange(period, primaryEntity, primaryAlias, timeCol, today);

        // 7. 排序与限制规划 (Sort & Limit)
        PlannedSort sort;
        if (query.sort() != null) {
            sort = new PlannedSort(query.sort().metric(), query.sort().direction());
        } else if (!measures.isEmpty()) {
            sort = new PlannedSort(measures.get(0).measureCode(), "DESC");
        } else {
            sort = new PlannedSort("1", "DESC");
        }

        int limit = query.limit() != null && query.limit() > 0 ? query.limit() : 10;

        return new LogicalQueryPlan(
            planId,
            primaryEntity,
            primaryTable,
            primaryAlias,
            grain,
            joins,
            dimensions,
            measures,
            filters,
            timeRange,
            scope,
            sort,
            limit
        );
    }

    private EntityDefinition findEntity(String code) {
        return catalog.entities().stream()
            .filter(e -> e.code().equalsIgnoreCase(code))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Entity not found in catalog: " + code));
    }

    private String resolveDefaultTable(String entity) {
        return switch (entity.toUpperCase(Locale.ROOT)) {
            case "CHARGE" -> "RHN_BIL_CHARGE_ITEM";
            case "ORDER" -> "RHN_EX_CARE_REQ";
            case "ENCOUNTER" -> "RHN_VIS_ENC";
            case "DIAGNOSIS" -> "RHN_VIS_ENC_DIAG";
            case "DEPARTMENT" -> "RHN_SYS_DEPT";
            case "PATIENT" -> "RHN_PAT_PATIENT";
            case "PRESCRIPTION" -> "RHN_EX_PRESCRIPTION";
            default -> "RHN_" + entity.toUpperCase(Locale.ROOT);
        };
    }

    private String resolvePhysicalColumn(String field) {
        return switch (field) {
            case "amount" -> "AMT_TOTAL";
            case "encounterId" -> "ID_ENC";
            case "patientId" -> "ID_PAT";
            case "orderId" -> "ID_CARE_REQ";
            case "recordId" -> "ID_ENC_DIAG";
            case "chargeId" -> "ID_CHARGE_ITEM";
            default -> field;
        };
    }

    private PlannedFilter resolveDefaultFilter(
        DefaultFilter df,
        String primaryEntity,
        String primaryAlias,
        Set<String> joinedEntities
    ) {
        String field = df.field();
        if ("orderKind".equalsIgnoreCase(field)) {
            String alias = joinedEntities.contains("ORDER") ? "req" : primaryAlias;
            return new PlannedFilter("ORDER", alias, "SD_REQ_KIND", df.operator(), df.values(), "限定医嘱类别为药品", false);
        }
        if ("orderStatus".equalsIgnoreCase(field)) {
            String alias = joinedEntities.contains("ORDER") ? "req" : primaryAlias;
            return new PlannedFilter("ORDER", alias, "SD_STATUS", df.operator(), df.values(), "限定医嘱状态为有效", false);
        }
        if ("deptType".equalsIgnoreCase(field)) {
            String alias = joinedEntities.contains("DEPARTMENT") ? "dept" : primaryAlias;
            return new PlannedFilter("DEPARTMENT", alias, "SD_DEPT_TYPE", df.operator(), df.values(), "默认限定临床诊疗科室", false);
        }
        if ("status".equalsIgnoreCase(field)) {
            return new PlannedFilter(primaryEntity, primaryAlias, "SD_STATUS", df.operator(), df.values(), "状态默认过滤", false);
        }
        if ("kind".equalsIgnoreCase(field)) {
            return new PlannedFilter(primaryEntity, primaryAlias, "SD_REQ_KIND", df.operator(), df.values(), "医嘱类别过滤", false);
        }
        return new PlannedFilter(primaryEntity, primaryAlias, field, df.operator(), df.values(), "默认规则过滤: " + field, false);
    }

    private PlannedTimeRange resolveTimeRange(TimeIntent period, String entity, String tableAlias, String timeCol, LocalDate today) {
        String type = period != null ? period.type() : "MONTH_TO_DATE";
        LocalDate start;
        LocalDate end;

        switch (type) {
            case "LAST_MONTH" -> {
                LocalDate firstOfThisMonth = today.withDayOfMonth(1);
                LocalDate lastOfPrevMonth = firstOfThisMonth.minusDays(1);
                start = lastOfPrevMonth.withDayOfMonth(1);
                end = lastOfPrevMonth;
            }
            case "LAST_30_DAYS" -> {
                start = today.minusDays(30);
                end = today;
            }
            case "YEAR_TO_DATE" -> {
                start = today.withDayOfYear(1);
                end = today;
            }
            case "FIXED" -> {
                start = period.startDate() != null ? LocalDate.parse(period.startDate()) : today.withDayOfMonth(1);
                end = period.endDate() != null ? LocalDate.parse(period.endDate()) : today;
            }
            default -> { // MONTH_TO_DATE
                start = today.withDayOfMonth(1);
                end = today;
            }
        }

        return new PlannedTimeRange(entity, tableAlias, timeCol, type, start, end);
    }

    private boolean isSameFilter(PlannedFilter a, PlannedFilter b) {
        return Objects.equals(a.tableAlias(), b.tableAlias())
            && Objects.equals(a.column(), b.column())
            && a.operator() == b.operator()
            && Objects.equals(a.values(), b.values());
    }
}
