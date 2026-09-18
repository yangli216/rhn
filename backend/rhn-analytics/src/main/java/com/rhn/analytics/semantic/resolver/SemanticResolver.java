package com.rhn.analytics.semantic.resolver;

import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.registry.DimensionRegistry;
import com.rhn.analytics.semantic.registry.MetricRegistry;
import com.rhn.analytics.semantic.registry.RelationshipRegistry;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class SemanticResolver {

    private final MetricRegistry metricRegistry;
    private final DimensionRegistry dimensionRegistry;
    private final RelationshipRegistry relationshipRegistry;

    public SemanticResolver(com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider catalogProvider) {
        this.metricRegistry = catalogProvider.getMetricRegistry();
        this.dimensionRegistry = catalogProvider.getDimensionRegistry();
        this.relationshipRegistry = catalogProvider.getRelationshipRegistry();
    }

    public Resolution resolve(SemanticQuery query) {
        if (query == null) {
            return Resolution.unsupported("EMPTY_QUERY", "语义查询对象不能为空");
        }

        // 1. 前置拦截：明确不支持的能力 (Unsupported Pre-check)
        Resolution unsupported = checkUnsupportedCapabilities(query);
        if (unsupported != null) {
            return unsupported;
        }

        // 2. 前置澄清：高频多义词口径歧义识别 (Ambiguity Clarification)
        Resolution clarify = checkAmbiguousConcepts(query);
        if (clarify != null) {
            return clarify;
        }

        // 3. 指标四层解析与安全校验 (Metric Resolution)
        if (query.metrics().isEmpty()) {
            return Resolution.clarify(
                "METRIC_MISSING",
                "请提供您希望分析的统计指标，例如门诊挂号人次、药品费用或有效医嘱数。",
                List.of(
                    new ClarificationOption("OP_ENCOUNTER_COUNT", "门诊就诊人次"),
                    new ClarificationOption("OP_DRUG_CHARGE_AMOUNT", "门诊药品费用净发生额"),
                    new ClarificationOption("OP_ACTIVE_ORDER_COUNT", "门诊有效医嘱条数")
                )
            );
        }

        List<ResolvedMetric> resolvedMetrics = new ArrayList<>();
        for (MetricIntent mIntent : query.metrics()) {
            String text = mIntent.text();
            Optional<MetricDefinition> metricOpt = metricRegistry.findByText(text);
            if (metricOpt.isEmpty()) {
                List<MetricDefinition> candidates = metricRegistry.searchCandidates(text);
                if (candidates.size() == 1) {
                    metricOpt = Optional.of(candidates.get(0));
                } else if (candidates.size() > 1) {
                    List<ClarificationOption> options = candidates.stream()
                        .map(c -> new ClarificationOption(c.code(), c.name()))
                        .toList();
                    return Resolution.clarify("METRIC_CANDIDATES_AMBIGUOUS", "您关注的指标对应多个统计口径，请选择：", options);
                } else {
                    return Resolution.unsupported("METRIC_NOT_FOUND", "当前数据目录尚未接入指标：" + text);
                }
            }

            MetricDefinition metric = metricOpt.get();
            // 校验是否违背禁用业务含义
            for (String forbidden : metric.forbiddenMeanings()) {
                if (text.contains(forbidden)) {
                    return Resolution.unsupported(
                        "FORBIDDEN_MEANING_CONFLICT",
                        "指标【" + metric.name() + "】不表示【" + forbidden + "】。当前尚未接入实际收款或医保清算流水。"
                    );
                }
            }

            resolvedMetrics.add(new ResolvedMetric(metric, metric.defaultFilters()));
        }

        // 4. 维度解析与细分科室智能消歧 (Dimension Disambiguation)
        List<ResolvedDimension> resolvedDimensions = new ArrayList<>();
        List<ResolvedFilter> resolvedFilters = new ArrayList<>();
        boolean impliedClinicalDeptFilter = false;

        for (DimensionIntent dIntent : query.dimensions()) {
            String text = dIntent.text();
            if (text.contains("诊疗科室") || text.contains("临床科室")) {
                impliedClinicalDeptFilter = true;
            }
            ResolvedDimension resolvedDim = resolveDimension(text, resolvedMetrics);
            if (resolvedDim == null) {
                return Resolution.unsupported("DIMENSION_NOT_FOUND", "当前数据目录尚未接入分析维度：" + text);
            }

            // 校验维度与指标兼容性
            for (ResolvedMetric rm : resolvedMetrics) {
                if (!dimensionRegistry.isCompatible(rm.definition(), resolvedDim.definition())) {
                    return Resolution.unsupported(
                        "DIMENSION_INCOMPATIBLE",
                        "指标【" + rm.definition().name() + "】与维度【" + resolvedDim.definition().name() + "】不兼容，无法组合统计"
                    );
                }
            }
            resolvedDimensions.add(resolvedDim);
        }

        // 4.5 过滤条件解析与属性绑定 (Filter Resolution & Attribute Binding)
        resolvedFilters.addAll(resolveFilters(query.filters(), resolvedDimensions, resolvedMetrics));

        // 若维度或需求隐含临床科室属性且尚未添加对应过滤，自动补充 ResolvedFilter
        if (impliedClinicalDeptFilter) {
            boolean alreadyHasDeptTypeFilter = resolvedFilters.stream()
                .anyMatch(f -> f.attribute() != null && "dept_type".equalsIgnoreCase(f.attribute().code()));
            if (!alreadyHasDeptTypeFilter) {
                ResolvedDimension deptDim = resolvedDimensions.stream()
                    .filter(d -> d.definition().code().endsWith("_DEPARTMENT"))
                    .findFirst()
                    .orElse(null);
                if (deptDim != null) {
                    DimensionAttribute deptTypeAttr = deptDim.definition().attributes().stream()
                        .filter(a -> "dept_type".equalsIgnoreCase(a.code()))
                        .findFirst()
                        .orElse(null);
                    if (deptTypeAttr != null) {
                        resolvedFilters.add(new ResolvedFilter(
                            deptDim.definition(),
                            deptTypeAttr,
                            Operator.EQ,
                            List.of("CLINICAL"),
                            "限定" + deptDim.definition().name() + "为临床诊疗科室"
                        ));
                    }
                }
            }
        }

        // 5. 组装 ResolvedSemanticQuery 并返回 READY
        ResolvedSemanticQuery resolvedQuery = new ResolvedSemanticQuery(
            query.intent(),
            resolvedMetrics,
            resolvedDimensions,
            query.filters(),
            resolvedFilters,
            query.period(),
            query.scope(),
            query.sort(),
            query.limit()
        );

        String message = buildReadyMessage(resolvedQuery);
        return Resolution.ready(message, resolvedQuery);
    }

    private Resolution checkUnsupportedCapabilities(SemanticQuery query) {
        String allText = buildAllIntentText(query);

        // 医保到账 / 基金结算
        if (allText.contains("医保到账") || allText.contains("医保基金")) {
            return Resolution.unsupported("INSURANCE_SETTLEMENT_NOT_SUPPORTED", "医保基金清算对账数据源尚未接入");
        }
        // 实收现金
        if (allText.contains("现金") || allText.contains("实收挂号费") || allText.contains("实际收款")) {
            return Resolution.unsupported("CASH_SETTLEMENT_NOT_SUPPORTED", "门诊出纳实际收退款流水源尚未接入");
        }
        // 药占比（复合衍生比率）
        if (allText.contains("药占比")) {
            return Resolution.unsupported("COMPUTED_RATIO_NOT_SUPPORTED", "复合除法衍生比率指标计算尚未接入");
        }
        // 次均药费 / 次均费用
        if (allText.contains("次均") || allText.contains("次均费用") || allText.contains("人均费用")) {
            return Resolution.unsupported("AVERAGE_PER_VISIT_NOT_SUPPORTED", "跨实体次均指标聚合计算尚未接入");
        }
        // 医生维度与处方量
        if (allText.contains("处方量") || allText.contains("按医生") || allText.contains("按医师")) {
            return Resolution.unsupported("PHYSICIAN_DIMENSION_NOT_SUPPORTED", "医生员工维度及处方统计实体尚未开放");
        }
        // 住院业务域
        if (allText.contains("住院")) {
            return Resolution.unsupported("INPATIENT_DOMAIN_NOT_SUPPORTED", "住院业务域及住院床日数据源尚未开放");
        }
        // 人口学维度
        if (allText.contains("年龄") || allText.contains("性别")) {
            return Resolution.unsupported("DEMOGRAPHIC_DIMENSION_NOT_SUPPORTED", "患者人口学属性（性别、年龄组）统计维度尚未接入");
        }

        // 跨实体 1:N 扇出放大风险拦截：如“高血压患者用了哪些药”
        boolean mentionsDiagnosis = allText.contains("高血压") || allText.contains("诊断") || allText.contains("疾病");
        boolean mentionsMedication = allText.contains("药") || allText.contains("处方") || allText.contains("医嘱");
        if (mentionsDiagnosis && mentionsMedication && !allText.contains("确诊记录") && !allText.contains("用药患者")) {
            if (relationshipRegistry.hasFanoutRisk("ENCOUNTER", "DIAGNOSIS", "ORDER")) {
                return Resolution.unsupported(
                    "CROSS_ENTITY_JOIN_FANOUT_RISK",
                    "诊断与医嘱明细级多对多关联路径存在扇出放大风险，尚未完成安全建模"
                );
            }
        }

        return null;
    }

    private Resolution checkAmbiguousConcepts(SemanticQuery query) {
        for (MetricIntent m : query.metrics()) {
            String text = m.text().trim();

            // 门诊收入
            if (text.equals("门诊收入") || text.equals("收入") || text.equals("门诊总收入")) {
                return Resolution.clarify(
                    "REVENUE_CONCEPT_AMBIGUOUS",
                    "请选择门诊收入口径：门诊已记账费用发生额、窗口实收挂号诊疗款，或医保结算到账收入？",
                    List.of(
                        new ClarificationOption("OP_CHARGE_NET_AMOUNT", "门诊费用净发生额（含未结算及冲销）"),
                        new ClarificationOption("OP_CASH_SETTLEMENT_AMOUNT", "门诊现金及移动支付实收款（尚未接入）"),
                        new ClarificationOption("OP_INSURANCE_SETTLED_AMOUNT", "医保基金结算到账款（尚未接入）")
                    )
                );
            }

            // 患者数量 / 看病人数
            if (text.equals("患者数量") || text.equals("患者数") || text.equals("看病人数") || text.equals("看病患者数")) {
                return Resolution.clarify(
                    "PATIENT_COUNT_AMBIGUOUS",
                    "请明确患者数量统计口径：挂号人次、门诊就诊人次，还是患者去重人数？",
                    List.of(
                        new ClarificationOption("OP_REGISTER_COUNT", "门诊挂号人次"),
                        new ClarificationOption("OP_ENCOUNTER_COUNT", "门诊就诊人次"),
                        new ClarificationOption("OP_UNIQUE_PATIENT_COUNT", "门诊就诊患者去重人数")
                    )
                );
            }

            // 收费情况
            if (text.equals("收费情况") || text.equals("门诊收费情况") || text.equals("科室收费情况")) {
                return Resolution.clarify(
                    "CHARGE_SITUATION_AMBIGUOUS",
                    "请选择关注的收费统计维度：费用净发生额总览，还是按项目类别区分费用？",
                    List.of(
                        new ClarificationOption("OP_TOTAL_CHARGE_AMOUNT", "门诊费用净发生额总览"),
                        new ClarificationOption("OP_CHARGE_BY_ORDER_TYPE", "按药品与服务医嘱拆分费用发生额")
                    )
                );
            }

            // 诊断数量
            if (text.equals("诊断数量") || text.equals("门诊诊断数量")) {
                return Resolution.clarify(
                    "DIAGNOSIS_COUNT_AMBIGUOUS",
                    "请确认是统计有效确诊记录条数（含一人多病），还是确诊患者去重人数？",
                    List.of(
                        new ClarificationOption("OP_VALID_DIAGNOSIS_RECORD_COUNT", "有效确诊记录条数"),
                        new ClarificationOption("OP_DIAGNOSED_PATIENT_COUNT", "确诊就诊患者去重人数")
                    )
                );
            }

            // 退号情况
            if (text.equals("退号情况") || text.equals("门诊退号情况")) {
                return Resolution.clarify(
                    "CANCEL_REGISTRATION_AMBIGUOUS",
                    "请选择退号指标：退号人次还是退号率？",
                    List.of(
                        new ClarificationOption("OP_CANCEL_REGISTER_COUNT", "门诊退号人次"),
                        new ClarificationOption("OP_CANCELLATION_RATE", "门诊退号率（%）")
                    )
                );
            }

            // 医嘱量
            if (text.equals("医嘱量") || text.equals("科室医嘱量") || text.equals("医嘱数量")) {
                return Resolution.clarify(
                    "ORDER_STATUS_AMBIGUOUS",
                    "请选择医嘱统计范围：仅有效执行中医嘱，还是包含已作废/已撤销的全部医嘱？",
                    List.of(
                        new ClarificationOption("OP_ACTIVE_ORDER_COUNT", "仅有效医嘱(ACTIVE)"),
                        new ClarificationOption("OP_ALL_STATUS_ORDER_COUNT", "包含全部状态医嘱")
                    )
                );
            }
        }
        return null;
    }

    private ResolvedDimension resolveDimension(String dimText, List<ResolvedMetric> metrics) {
        String lower = dimText.toLowerCase(Locale.ROOT).trim();

        // 核心消歧：根据指标实体来源智能消歧“科室”（含诊疗科室、临床科室等限定表述）
        if (lower.equals("科室") || lower.equals("部门") || lower.equals("各科室")
            || lower.contains("诊疗科室") || lower.contains("临床科室")) {
            if (!metrics.isEmpty()) {
                String source = metrics.get(0).definition().source();
                if ("CHARGE".equalsIgnoreCase(source)) {
                    return dimensionRegistry.findByCode("CHARGE_DEPARTMENT")
                        .map(d -> new ResolvedDimension(d, "CHARGE_DEPARTMENT"))
                        .orElse(null);
                }
                if ("ORDER".equalsIgnoreCase(source)) {
                    return dimensionRegistry.findByCode("ORDER_DEPARTMENT")
                        .map(d -> new ResolvedDimension(d, "ORDER_DEPARTMENT"))
                        .orElse(null);
                }
            }
            return dimensionRegistry.findByCode("ENCOUNTER_DEPARTMENT")
                .map(d -> new ResolvedDimension(d, "ENCOUNTER_DEPARTMENT"))
                .orElse(null);
        }

        // 常规别名/编码查找
        Optional<DimensionDefinition> dimOpt = dimensionRegistry.findByText(dimText);
        return dimOpt.map(d -> new ResolvedDimension(d, d.code())).orElse(null);
    }

    private List<ResolvedFilter> resolveFilters(
        List<FilterIntent> rawFilters,
        List<ResolvedDimension> dimensions,
        List<ResolvedMetric> metrics
    ) {
        List<ResolvedFilter> result = new ArrayList<>();
        if (rawFilters == null) return result;

        for (FilterIntent f : rawFilters) {
            String dimName = f.dimension().trim();
            Operator op = parseOperator(f.operator());
            List<String> values = f.values();

            // 1. 优先在已解析维度中查找属性（如科室维度的 dept_type 属性）
            boolean matched = false;
            for (ResolvedDimension rd : dimensions) {
                for (DimensionAttribute attr : rd.definition().attributes()) {
                    boolean nameMatches = attr.name().equalsIgnoreCase(dimName)
                        || attr.aliases().stream().anyMatch(a -> a.equalsIgnoreCase(dimName))
                        || dimName.contains("科室") || dimName.contains("部门");
                    if (nameMatches) {
                        List<String> mappedValues = mapAttributeValues(attr, values);
                        if (!mappedValues.isEmpty()) {
                            result.add(new ResolvedFilter(
                                rd.definition(),
                                attr,
                                op,
                                mappedValues,
                                "限定" + rd.definition().name() + "为" + String.join("、", values)
                            ));
                            matched = true;
                            break;
                        }
                    }
                }
                if (matched) break;
            }

            // 2. 如果维度列表中没有显式科室，但指标存在可关联的科室维度（如用户说“只显示诊疗科室”，但未指定各科室分组）
            if (!matched) {
                ResolvedDimension potentialDeptDim = resolveDimension("科室", metrics);
                if (potentialDeptDim != null) {
                    for (DimensionAttribute attr : potentialDeptDim.definition().attributes()) {
                        boolean nameMatches = attr.name().equalsIgnoreCase(dimName)
                            || attr.aliases().stream().anyMatch(a -> a.equalsIgnoreCase(dimName))
                            || dimName.contains("科室") || dimName.contains("部门");
                        if (nameMatches) {
                            List<String> mappedValues = mapAttributeValues(attr, values);
                            if (!mappedValues.isEmpty()) {
                                result.add(new ResolvedFilter(
                                    potentialDeptDim.definition(),
                                    attr,
                                    op,
                                    mappedValues,
                                    "限定" + potentialDeptDim.definition().name() + "为" + String.join("、", values)
                                ));
                                matched = true;
                                break;
                            }
                        }
                    }
                }
            }

            // 3. 常规维度值直接过滤
            if (!matched) {
                Optional<DimensionDefinition> dimDef = dimensionRegistry.findByText(dimName);
                dimDef.ifPresent(d -> result.add(new ResolvedFilter(
                    d,
                    null,
                    op,
                    values,
                    d.name() + " 筛选 " + String.join("、", values)
                )));
            }
        }
        return result;
    }

    private List<String> mapAttributeValues(DimensionAttribute attr, List<String> rawValues) {
        List<String> mapped = new ArrayList<>();
        for (String raw : rawValues) {
            String trimmed = raw.trim();
            for (Map.Entry<String, List<String>> entry : attr.valueAliases().entrySet()) {
                if (entry.getKey().equalsIgnoreCase(trimmed)
                    || entry.getValue().stream().anyMatch(alias -> alias.equalsIgnoreCase(trimmed) || trimmed.contains(alias))) {
                    mapped.add(entry.getKey());
                    break;
                }
            }
        }
        return mapped;
    }

    private Operator parseOperator(String op) {
        if (op == null || op.isBlank()) return Operator.EQ;
        try {
            return Operator.valueOf(op.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return Operator.EQ;
        }
    }

    private String buildAllIntentText(SemanticQuery query) {
        StringBuilder sb = new StringBuilder();
        for (MetricIntent m : query.metrics()) sb.append(m.text()).append(" ");
        for (DimensionIntent d : query.dimensions()) sb.append(d.text()).append(" ");
        for (FilterIntent f : query.filters()) {
            sb.append(f.dimension()).append(" ").append(String.join(" ", f.values())).append(" ");
        }
        return sb.toString();
    }

    private String buildReadyMessage(ResolvedSemanticQuery query) {
        List<String> metricNames = query.metrics().stream().map(m -> m.definition().name()).toList();
        List<String> dimNames = query.dimensions().stream().map(d -> d.definition().name()).toList();
        String periodDesc = switch (query.period().type()) {
            case "MONTH_TO_DATE" -> "本月至今";
            case "LAST_MONTH" -> "上个月";
            case "LAST_30_DAYS" -> "近30天";
            case "YEAR_TO_DATE" -> "今年至今";
            default -> "指定日期范围";
        };
        String filterDesc = query.resolvedFilters().isEmpty() ? "" :
            "；筛选：" + query.resolvedFilters().stream().map(ResolvedFilter::description).distinct().collect(Collectors.joining("、"));
        String scopeDesc = query.scope() == ScopeIntent.AUTHORIZED ? "全机构可访问科室" : "当前科室";
        return "已确认统计指标：" + String.join("、", metricNames) + "；按 " + String.join("、", dimNames) + " 分组" + filterDesc + "；统计周期：" + periodDesc + "；范围：" + scopeDesc + "。";
    }
}
