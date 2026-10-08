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

    public LogicalQueryPlan plan(ResolvedSemanticQuery query, PlannedScope scope, LocalDate today) {
        Objects.requireNonNull(query, "ResolvedSemanticQuery cannot be null");
        if (query.metrics().isEmpty()) {
            throw new IllegalArgumentException("Cannot plan a query without metrics");
        }

        if (scope == null) {
            throw new IllegalArgumentException("An explicit authorized scope is required to plan a query");
        }

        PlanContext ctx = new PlanContext(
            query,
            scope,
            today != null ? today : LocalDate.now(),
            "plan-" + Long.toHexString(java.util.concurrent.ThreadLocalRandom.current().nextLong() & 0xFFFFFFFFL)
        );

        // 2. 规划连接拓扑 (Join Path Planning)
        planJoinPaths(ctx);

        // 3. 分组维度规划 (Dimension Planning)
        List<PlannedDimension> dimensions = planDimensions(ctx);

        // 4. 统计度量规划 (Measure Planning)
        List<PlannedMeasure> measures = planMeasures(ctx);

        // 5. 谓词过滤下推规划 (Predicate Pushdown Planning)
        List<PlannedFilter> filters = planPredicates(ctx, measures);

        // 6. 时间窗口规划 (Time Range Planning)
        PlannedTimeRange timeRange = resolveTimeRange(
            ctx.query.period(), ctx.primaryEntity, ctx.primaryAlias, ctx.timeCol, ctx.today);

        // 7. 排序与限制规划 (Sort & Limit)
        PlannedSort sort = planSort(ctx.query, measures);
        int limit = ctx.query.limit() != null && ctx.query.limit() > 0 ? ctx.query.limit() : 10;

        return new LogicalQueryPlan(
            ctx.planId,
            ctx.primaryEntity,
            ctx.primaryTable,
            ctx.primaryAlias,
            ctx.grain,
            ctx.joins,
            dimensions,
            measures,
            filters,
            timeRange,
            ctx.scope,
            sort,
            limit
        );
    }

    /**
     * 规划期间共享的中间状态。
     * 构造时完成「1. 以主指标为中心确定主事实实体与聚合粒度」，避免在多个私有方法间传递十余个参数。
     */
    private final class PlanContext {
        private final ResolvedSemanticQuery query;
        private final PlannedScope scope;
        private final LocalDate today;
        private final String planId;
        private final MetricDefinition metricDef;
        private final String primaryEntity;
        private final String primaryTable;
        private final String primaryAlias = "t0";
        private final String grain;
        private final String timeCol;
        private final List<PlannedJoin> joins = new ArrayList<>();
        private final Set<String> joinedEntities = new HashSet<>();

        private PlanContext(ResolvedSemanticQuery query, PlannedScope scope, LocalDate today, String planId) {
            this.query = query;
            this.scope = scope;
            this.today = today;
            this.planId = planId;

            ResolvedMetric primaryMetric = query.metrics().get(0);
            this.metricDef = primaryMetric.definition();
            this.primaryEntity = metricDef.source(); // e.g. CHARGE, ORDER, ENCOUNTER, DIAGNOSIS
            EntityDefinition factEntityDef = findEntity(primaryEntity);
            this.primaryTable = factEntityDef.table() != null ? factEntityDef.table() : resolveDefaultTable(primaryEntity);
            this.grain = metricDef.grain();
            this.timeCol = metricDef.timeDimension();
        }
    }

    /** 2. 连接拓扑规划：按需桥接 ENCOUNTER / DEPARTMENT / ORDER，避免扇出风险。 */
    private void planJoinPaths(PlanContext ctx) {
        if (needsDepartmentJoin(ctx) && !ctx.primaryEntity.equals("DEPARTMENT")) {
            if (!ctx.primaryEntity.equals("ENCOUNTER")) {
                if (!ctx.joinedEntities.contains("ENCOUNTER")) {
                    EntityDefinition encDef = findEntity("ENCOUNTER");
                    String encTable = encDef.table() != null ? encDef.table() : resolveDefaultTable("ENCOUNTER");
                    ctx.joins.add(new PlannedJoin(
                        ctx.primaryEntity,
                        ctx.primaryAlias,
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
                    ctx.joinedEntities.add("ENCOUNTER");
                }
                EntityDefinition deptDef = findEntity("DEPARTMENT");
                String deptTable = deptDef.table() != null ? deptDef.table() : resolveDefaultTable("DEPARTMENT");
                ctx.joins.add(new PlannedJoin(
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
                ctx.joinedEntities.add("DEPARTMENT");
            } else {
                EntityDefinition deptDef = findEntity("DEPARTMENT");
                String deptTable = deptDef.table() != null ? deptDef.table() : resolveDefaultTable("DEPARTMENT");
                ctx.joins.add(new PlannedJoin(
                    ctx.primaryEntity,
                    ctx.primaryAlias,
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
                ctx.joinedEntities.add("DEPARTMENT");
            }
        }

        if (needsOrderJoin(ctx) && !ctx.primaryEntity.equals("ORDER")) {
            EntityDefinition orderDef = findEntity("ORDER");
            String orderTable = orderDef.table() != null ? orderDef.table() : "RHN_EX_CARE_REQ";
            ctx.joins.add(new PlannedJoin(
                ctx.primaryEntity,
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
            ctx.joinedEntities.add("ORDER");
        }
    }

    /** 是否需要连接 DEPARTMENT（科室主数据）。 */
    private boolean needsDepartmentJoin(PlanContext ctx) {
        // 维度中是否包含科室
        for (ResolvedDimension rd : ctx.query.dimensions()) {
            if (rd.definition().code().endsWith("_DEPARTMENT")) {
                return true;
            }
        }
        // 属性过滤中是否包含科室属性 (如 dept_type)
        for (ResolvedFilter rf : ctx.query.resolvedFilters()) {
            if (rf.attribute() != null && "dept_type".equalsIgnoreCase(rf.attribute().code())) {
                return true;
            }
        }
        // 指标默认过滤中是否包含科室属性 (如 deptType=CLINICAL)
        for (DefaultFilter df : ctx.metricDef.defaultFilters()) {
            if ("deptType".equalsIgnoreCase(df.field())) {
                return true;
            }
        }
        // 如果具有授权科室过滤，非科室/就诊实体也需桥接科室
        return !ctx.scope.authorizedDepartments().isEmpty()
            && !ctx.primaryEntity.equals("DEPARTMENT")
            && !ctx.primaryEntity.equals("ENCOUNTER");
    }

    /** CHARGE 是否需要连接 ORDER（例如药品费用需要 orderKind=MEDICATION & orderStatus=ACTIVE）。 */
    private boolean needsOrderJoin(PlanContext ctx) {
        if (!ctx.primaryEntity.equals("CHARGE")) {
            return false;
        }
        for (DefaultFilter df : ctx.metricDef.defaultFilters()) {
            if ("orderKind".equalsIgnoreCase(df.field()) || "orderStatus".equalsIgnoreCase(df.field())) {
                return true;
            }
        }
        for (ResolvedDimension rd : ctx.query.dimensions()) {
            if ("ORDER_TYPE".equals(rd.definition().code())) {
                return true;
            }
        }
        return false;
    }

    /** 3. 分组维度规划：按维度代码映射到物理表达式（时间维度支持 DAY/MONTH 粒度）。 */
    private List<PlannedDimension> planDimensions(PlanContext ctx) {
        List<PlannedDimension> dimensions = new ArrayList<>();
        for (ResolvedDimension rd : ctx.query.dimensions()) {
            String dimCode = rd.definition().code();
            String name = rd.definition().name();
            switch (dimCode) {
                case "DAY" -> dimensions.add(new PlannedDimension(
                    dimCode, name, ctx.primaryEntity, ctx.primaryAlias, ctx.timeCol,
                    ctx.primaryAlias + "." + ctx.timeCol
                ));
                case "MONTH" -> dimensions.add(new PlannedDimension(
                    dimCode, name, ctx.primaryEntity, ctx.primaryAlias, ctx.timeCol,
                    "TO_CHAR(" + ctx.primaryAlias + "." + ctx.timeCol + ", 'YYYY-MM')"
                ));
                case "CHARGE_DEPARTMENT", "ORDER_DEPARTMENT", "ENCOUNTER_DEPARTMENT" -> {
                    String tableAlias = ctx.joinedEntities.contains("DEPARTMENT") ? "dept" : ctx.primaryAlias;
                    dimensions.add(new PlannedDimension(
                        dimCode, name, "DEPARTMENT", tableAlias, "ID_DEPT",
                        tableAlias + ".ID_DEPT"
                    ));
                }
                case "ORDER_TYPE" -> {
                    String tableAlias = ctx.joinedEntities.contains("ORDER") ? "req" : ctx.primaryAlias;
                    dimensions.add(new PlannedDimension(
                        dimCode, name, "ORDER", tableAlias, "SD_REQ_KIND",
                        tableAlias + ".SD_REQ_KIND"
                    ));
                }
                case "ITEM" -> dimensions.add(new PlannedDimension(
                    dimCode, name, ctx.primaryEntity, ctx.primaryAlias, "ID_CATALOG_ITEM",
                    ctx.primaryAlias + ".ID_CATALOG_ITEM"
                ));
                case "DIAGNOSIS" -> dimensions.add(new PlannedDimension(
                    dimCode, name, ctx.primaryEntity, ctx.primaryAlias, "CD_ENC_DIAG",
                    ctx.primaryAlias + ".CD_ENC_DIAG"
                ));
                case "STATUS" -> dimensions.add(new PlannedDimension(
                    dimCode, name, ctx.primaryEntity, ctx.primaryAlias, "SD_STATUS",
                    ctx.primaryAlias + ".SD_STATUS"
                ));
                default -> dimensions.add(new PlannedDimension(
                    dimCode, name, ctx.primaryEntity, ctx.primaryAlias, rd.definition().field(),
                    ctx.primaryAlias + "." + rd.definition().field()
                ));
            }
        }
        return dimensions;
    }

    /** 4. 统计度量规划：物理列映射 + 指标自带默认过滤条件。 */
    private List<PlannedMeasure> planMeasures(PlanContext ctx) {
        List<PlannedMeasure> measures = new ArrayList<>();
        for (ResolvedMetric rm : ctx.query.metrics()) {
            MetricDefinition mDef = rm.definition();
            String physicalCol = resolvePhysicalColumn(mDef.field());
            List<PlannedFilter> defaultPlannedFilters = new ArrayList<>();

            for (DefaultFilter df : mDef.defaultFilters()) {
                defaultPlannedFilters.add(resolveDefaultFilter(
                    df, ctx.primaryEntity, ctx.primaryAlias, ctx.joinedEntities));
            }

            measures.add(new PlannedMeasure(
                mDef.code(),
                mDef.name(),
                ctx.primaryEntity,
                ctx.primaryAlias,
                physicalCol,
                mDef.aggregate(),
                defaultPlannedFilters
            ));
        }
        return measures;
    }

    /** 5. 谓词过滤下推规划：安全范围 → 指标默认过滤 → 显式业务过滤。 */
    private List<PlannedFilter> planPredicates(PlanContext ctx, List<PlannedMeasure> measures) {
        List<PlannedFilter> filters = new ArrayList<>();

        // 5.1 租户与组织安全范围过滤 (Tenant & Org Scope)
        if (ctx.scope.tenantId() != null) {
            filters.add(new PlannedFilter(
                ctx.primaryEntity, ctx.primaryAlias, "ID_TNT", Operator.EQ,
                List.of(String.valueOf(ctx.scope.tenantId())), "租户隔离安全过滤", true
            ));
        }
        if (ctx.scope.organizationId() != null) {
            filters.add(new PlannedFilter(
                ctx.primaryEntity, ctx.primaryAlias, "ID_ORG", Operator.EQ,
                List.of(String.valueOf(ctx.scope.organizationId())), "机构数据范围过滤", true
            ));
        }

        // 5.2 授权科室范围过滤 (Department Scope)
        appendAuthorizedDepartmentFilter(filters, ctx);

        // 5.3 统计指标默认过滤条件 (Metric Default Filters)
        for (PlannedMeasure pm : measures) {
            for (PlannedFilter pf : pm.defaultFilters()) {
                if (filters.stream().noneMatch(existing -> isSameFilter(existing, pf))) {
                    filters.add(pf);
                }
            }
        }

        // 5.4 显式与隐式业务过滤条件 (Query Resolved Filters)
        for (ResolvedFilter rf : ctx.query.resolvedFilters()) {
            PlannedFilter targetFilter;
            if (rf.attribute() != null && "dept_type".equalsIgnoreCase(rf.attribute().code())) {
                String tableAlias = ctx.joinedEntities.contains("DEPARTMENT") ? "dept" : ctx.primaryAlias;
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
                targetFilter = new PlannedFilter(
                    rf.dimension().entity(),
                    ctx.primaryAlias,
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

        return filters;
    }

    /** 5.2 授权科室范围过滤：优先落在主实体，否则落在已桥接的科室/就诊表上。 */
    private void appendAuthorizedDepartmentFilter(List<PlannedFilter> filters, PlanContext ctx) {
        if (ctx.scope.authorizedDepartments().isEmpty()) {
            return;
        }

        List<String> deptIds = ctx.scope.authorizedDepartments().keySet().stream().map(String::valueOf).toList();
        String filterEntity;
        String filterAlias;
        if (ctx.primaryEntity.equals("DEPARTMENT")) {
            filterEntity = "DEPARTMENT";
            filterAlias = ctx.primaryAlias;
        } else if (ctx.primaryEntity.equals("ENCOUNTER")) {
            filterEntity = "ENCOUNTER";
            filterAlias = ctx.primaryAlias;
        } else if (ctx.primaryEntity.equals("CHARGE")) {
            filterEntity = "CHARGE";
            filterAlias = ctx.primaryAlias;
        } else if (ctx.joinedEntities.contains("DEPARTMENT")) {
            filterEntity = "DEPARTMENT";
            filterAlias = "dept";
        } else if (ctx.joinedEntities.contains("ENCOUNTER")) {
            filterEntity = "ENCOUNTER";
            filterAlias = "enc";
        } else {
            filterEntity = ctx.primaryEntity;
            filterAlias = ctx.primaryAlias;
        }
        filters.add(new PlannedFilter(
            filterEntity, filterAlias, "ID_DEPT", Operator.IN,
            deptIds, "用户可访问科室权限切片", true
        ));
    }

    /** 7. 排序规划：显式排序优先，否则按首个度量降序，最后兜底常量 1。 */
    private static PlannedSort planSort(ResolvedSemanticQuery query, List<PlannedMeasure> measures) {
        if (query.sort() != null) {
            return new PlannedSort(query.sort().metric(), query.sort().direction());
        }
        if (!measures.isEmpty()) {
            return new PlannedSort(measures.get(0).measureCode(), "DESC");
        }
        return new PlannedSort("1", "DESC");
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
