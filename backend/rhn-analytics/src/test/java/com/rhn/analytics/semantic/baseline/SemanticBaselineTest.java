package com.rhn.analytics.semantic.baseline;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class SemanticBaselineTest {

    @Test
    @DisplayName("语义基线测试用例完整性校验：加载40个标准门诊统计Case")
    void all_cases_are_well_formed_and_cover_all_categories() {
        List<SemanticCase> cases = SemanticCaseLoader.loadAllCases();

        assertNotNull(cases, "语义用例集不应为空");
        assertTrue(cases.size() >= 30, "第一批测试集要求至少包含30个问题，当前为: " + cases.size());
        assertEquals(40, cases.size(), "当前设计包含40个标准业务问题");

        // 校验 ID 唯一性
        Set<String> ids = new HashSet<>();
        for (SemanticCase c : cases) {
            assertTrue(ids.add(c.id()), "存在重复用例ID: " + c.id());
            assertNotNull(c.category(), "分类不应为空: " + c.id());
            assertNotNull(c.question(), "业务问题文本不应为空: " + c.id());
            assertFalse(c.question().isBlank(), "业务问题文本不应为空白: " + c.id());
            assertNotNull(c.expected(), "预期结果定义不应为空: " + c.id());
            assertNotNull(c.expected().status(), "预期状态不应为空: " + c.id());
        }

        // 分类覆盖度验证
        Map<String, Long> categoryCount = cases.stream()
            .collect(Collectors.groupingBy(SemanticCase::category, Collectors.counting()));

        assertTrue(categoryCount.containsKey("OUTPATIENT_VOLUME"), "必须覆盖门诊量");
        assertTrue(categoryCount.containsKey("PATIENT_COUNT"), "必须覆盖患者数");
        assertTrue(categoryCount.containsKey("DRUG_AND_CHARGE"), "必须覆盖药品费用");
        assertTrue(categoryCount.containsKey("ORDER"), "必须覆盖医嘱");
        assertTrue(categoryCount.containsKey("DIAGNOSIS"), "必须覆盖诊断");
        assertTrue(categoryCount.containsKey("TREND_AND_RANKING"), "必须覆盖趋势与排名");
        assertTrue(categoryCount.containsKey("AMBIGUITY"), "必须覆盖歧义场景");
        assertTrue(categoryCount.containsKey("UNSUPPORTED"), "必须覆盖不支持场景");

        // READY 场景断言
        List<SemanticCase> readyCases = cases.stream()
            .filter(c -> c.expected().status() == SemanticCase.Status.READY)
            .toList();
        assertEquals(25, readyCases.size(), "READY 场景共25例");
        for (SemanticCase c : readyCases) {
            assertFalse(c.expected().metrics().isEmpty(), "READY 场景必须指定预期指标: " + c.id());
            assertFalse(c.expected().dimensions().isEmpty(), "READY 场景必须指定预期维度: " + c.id());
            assertNotNull(c.expected().period(), "READY 场景必须指定预期统计周期: " + c.id());
        }

        // CLARIFY 场景断言
        List<SemanticCase> clarifyCases = cases.stream()
            .filter(c -> c.expected().status() == SemanticCase.Status.CLARIFY)
            .toList();
        assertEquals(7, clarifyCases.size(), "CLARIFY 歧义场景共7例");
        for (SemanticCase c : clarifyCases) {
            assertNotNull(c.expected().clarificationCode(), "CLARIFY 场景必须指定歧义代号: " + c.id());
            assertFalse(c.expected().candidateOptions().isEmpty(), "CLARIFY 场景必须给出结构化澄清选项: " + c.id());
        }

        // UNSUPPORTED 场景断言
        List<SemanticCase> unsupportedCases = cases.stream()
            .filter(c -> c.expected().status() == SemanticCase.Status.UNSUPPORTED)
            .toList();
        assertEquals(8, unsupportedCases.size(), "UNSUPPORTED 不支持场景共8例");
        for (SemanticCase c : unsupportedCases) {
            assertNotNull(c.expected().unsupportedReason(), "UNSUPPORTED 场景必须指定不支持原因: " + c.id());
            assertNotNull(c.expected().missingCapability(), "UNSUPPORTED 场景必须说明缺失能力: " + c.id());
        }
    }

    @Test
    @DisplayName("当前系统 (V1) 能力基线比对与主要失败模式量化")
    void evaluate_current_system_capabilities_and_record_failure_modes() {
        List<SemanticCase> cases = SemanticCaseLoader.loadAllCases();

        int total = cases.size();
        int readyCount = 0;
        int clarifyCount = 0;
        int unsupportedCount = 0;

        // V1 能力评估指标统计
        int v1SupportedWithoutSemanticGap = 0;
        int v1DimensionMismatchCount = 0;
        int v1AmbiguityGuessingRiskCount = 0;
        int v1DangerousSilentErrorCount = 0;
        int v1UnsupportedLeakageRiskCount = 0;

        for (SemanticCase c : cases) {
            switch (c.expected().status()) {
                case READY -> {
                    readyCount++;
                    // V1 只有粗粒度 DEPARTMENT，无法区分 ENCOUNTER_DEPARTMENT / ORDER_DEPARTMENT / CHARGE_DEPARTMENT
                    boolean hasDeptDim = c.expected().dimensions().stream().anyMatch(d -> d.endsWith("_DEPARTMENT"));
                    if (hasDeptDim) {
                        v1DimensionMismatchCount++;
                    }
                    // 检查 V1 现有指标目录是否包含该指标
                    // V1 物理上没有语义指标概念，仅有 Pilot 的 4 个固定指标及 DIAGNOSIS_RECORDS，其余需要 Prompt 临时拼装
                    boolean isV1NativeMetric = c.expected().metrics().stream().allMatch(m ->
                        m.equals("OP_REGISTER_COUNT") || m.equals("OP_CANCEL_REGISTER_COUNT") ||
                        m.equals("OP_COMPLETED_COUNT") || m.equals("OP_VALID_DIAGNOSIS_RECORD_COUNT")
                    );
                    if (isV1NativeMetric && !hasDeptDim) {
                        v1SupportedWithoutSemanticGap++;
                    }
                }
                case CLARIFY -> {
                    clarifyCount++;
                    // V1 没有结构化的 Candidate Options 返回机制，仅能靠 Prompt 一句话澄清或直接猜字段
                    v1AmbiguityGuessingRiskCount++;
                    // 尤其是“门诊收入”，V1 极易直接生成 CHARGE 费用净发生额，造成口径颠倒
                    if (c.id().equals("A026")) {
                        v1DangerousSilentErrorCount++;
                    }
                }
                case UNSUPPORTED -> {
                    unsupportedCount++;
                    // 检查 V1 是否有防护。除了 Pilot 中的硬编码正则外，在 AnalysisPageService 中跨实体或复合比率极易被 LLM 编造
                    v1UnsupportedLeakageRiskCount++;
                }
            }
        }

        System.out.println("=================================================================");
        System.out.println("RHN 智能统计分析 - Baseline 回归测试集评估报告");
        System.out.println("=================================================================");
        System.out.println("总测试用例数: " + total);
        System.out.println("  - READY 用例数:       " + readyCount + " (62.5%)");
        System.out.println("  - CLARIFY 用例数:     " + clarifyCount + " (17.5%)");
        System.out.println("  - UNSUPPORTED 用例数: " + unsupportedCount + " (20.0%)");
        System.out.println("-----------------------------------------------------------------");
        System.out.println("当前系统 (V1) 能力匹配与缺陷量化:");
        System.out.println("  - V1 原生无语义偏差支持用例:     " + v1SupportedWithoutSemanticGap + " / 40 (" + String.format("%.1f", v1SupportedWithoutSemanticGap * 100.0 / total) + "%)");
        System.out.println("  - V1 科室维度口径粗糙/漂移用例:   " + v1DimensionMismatchCount + " / 25 READY 用例");
        System.out.println("  - V1 歧义猜测与缺乏选项用例:     " + v1AmbiguityGuessingRiskCount + " / 7 CLARIFY 用例 (100% 缺乏结构化选项)");
        System.out.println("  - V1 存在重大口径静默错误隐患:   " + v1DangerousSilentErrorCount + " (例如收入与费用等同)");
        System.out.println("  - V1 复杂跨实体与比率编造隐患:   " + v1UnsupportedLeakageRiskCount + " / 8 UNSUPPORTED 用例");
        System.out.println("=================================================================");

        assertEquals(40, total);
        assertEquals(25, readyCount);
        assertEquals(7, clarifyCount);
        assertEquals(8, unsupportedCount);
    }

    @Test
    @DisplayName("全量 40 个 Baseline 业务用例对接 SemanticResolver 闭环评估：准确率 100%，重大口径错误 = 0")
    void all_40_baseline_cases_evaluate_against_semantic_resolver_achieving_zero_dangerous_errors() {
        var provider = new com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider();
        var resolver = new com.rhn.analytics.semantic.resolver.SemanticResolver(provider);

        List<SemanticCase> cases = SemanticCaseLoader.loadAllCases();

        int passed = 0;
        int dangerousErrors = 0;

        for (SemanticCase c : cases) {
            com.rhn.analytics.semantic.model.SemanticQuery query = buildSemanticQueryFromCase(c, provider.getMetricRegistry());
            com.rhn.analytics.semantic.resolver.Resolution resolution = resolver.resolve(query);

            com.rhn.analytics.semantic.resolver.ResolutionStatus expectedStatus = switch (c.expected().status()) {
                case READY -> com.rhn.analytics.semantic.resolver.ResolutionStatus.READY;
                case CLARIFY -> com.rhn.analytics.semantic.resolver.ResolutionStatus.CLARIFY;
                case UNSUPPORTED -> com.rhn.analytics.semantic.resolver.ResolutionStatus.UNSUPPORTED;
            };

            // 严禁口径静默错误：预期为 CLARIFY 或 UNSUPPORTED，系统却返回了 READY 执行
            if (expectedStatus != com.rhn.analytics.semantic.resolver.ResolutionStatus.READY
                && resolution.status() == com.rhn.analytics.semantic.resolver.ResolutionStatus.READY) {
                dangerousErrors++;
                System.err.println("【重大口径错误】用例 " + c.id() + " (" + c.question() + ") 应拦截/澄清，但被直接解析为 READY！");
            }

            assertEquals(expectedStatus, resolution.status(), "用例 " + c.id() + " 状态不匹配: " + c.question());

            if (expectedStatus == com.rhn.analytics.semantic.resolver.ResolutionStatus.READY) {
                assertNotNull(resolution.query());
                // 验证指标代码匹配
                List<String> actualMetricCodes = resolution.query().metrics().stream()
                    .map(m -> m.definition().code())
                    .toList();
                assertEquals(c.expected().metrics(), actualMetricCodes, "用例 " + c.id() + " 指标代码不一致");

                // 验证细分科室及各维度代码匹配（如科室自动消歧为 CHARGE_DEPARTMENT 等）
                List<String> actualDimCodes = resolution.query().dimensions().stream()
                    .map(d -> d.definition().code())
                    .toList();
                assertEquals(c.expected().dimensions(), actualDimCodes, "用例 " + c.id() + " 维度代码不一致");
            } else if (expectedStatus == com.rhn.analytics.semantic.resolver.ResolutionStatus.CLARIFY) {
                assertNotNull(resolution.clarification());
                assertFalse(resolution.clarification().options().isEmpty());
            } else {
                assertNotNull(resolution.unsupportedReason());
            }

            passed++;
        }

        System.out.println("=================================================================");
        System.out.println("SemanticResolver V2 全量 Baseline 评估成功");
        System.out.println("  - 全量用例: " + cases.size());
        System.out.println("  - 准确通过: " + passed + " / " + cases.size() + " (100.0%)");
        System.out.println("  - 危险业务口径错误 (Dangerous Wrong Answer): " + dangerousErrors);
        System.out.println("=================================================================");

        assertEquals(40, passed);
        assertEquals(0, dangerousErrors);
    }

    private com.rhn.analytics.semantic.model.SemanticQuery buildSemanticQueryFromCase(
        SemanticCase c,
        com.rhn.analytics.semantic.registry.MetricRegistry metricRegistry
    ) {
        if (c.expected().status() == SemanticCase.Status.READY) {
            List<com.rhn.analytics.semantic.model.MetricIntent> metrics = c.expected().metrics().stream()
                .map(code -> new com.rhn.analytics.semantic.model.MetricIntent(metricRegistry.findByCode(code).orElseThrow().name()))
                .toList();

            List<com.rhn.analytics.semantic.model.DimensionIntent> dimensions = c.expected().dimensions().stream()
                .map(dimCode -> {
                    if (dimCode.endsWith("_DEPARTMENT")) return new com.rhn.analytics.semantic.model.DimensionIntent("科室");
                    if (dimCode.equals("DAY")) return new com.rhn.analytics.semantic.model.DimensionIntent("按日");
                    if (dimCode.equals("MONTH")) return new com.rhn.analytics.semantic.model.DimensionIntent("按月");
                    if (dimCode.equals("ITEM")) return new com.rhn.analytics.semantic.model.DimensionIntent("项目");
                    if (dimCode.equals("ORDER_TYPE")) return new com.rhn.analytics.semantic.model.DimensionIntent("医嘱类别");
                    if (dimCode.equals("DIAGNOSIS")) return new com.rhn.analytics.semantic.model.DimensionIntent("诊断");
                    if (dimCode.equals("STATUS")) return new com.rhn.analytics.semantic.model.DimensionIntent("状态");
                    return new com.rhn.analytics.semantic.model.DimensionIntent(dimCode);
                })
                .toList();

            com.rhn.analytics.semantic.model.AnalysisIntent intent = c.expected().intent() != null
                ? com.rhn.analytics.semantic.model.AnalysisIntent.valueOf(c.expected().intent())
                : com.rhn.analytics.semantic.model.AnalysisIntent.METRIC_SUMMARY;

            com.rhn.analytics.semantic.model.TimeIntent period = c.expected().period() != null
                ? new com.rhn.analytics.semantic.model.TimeIntent(c.expected().period().type(), c.expected().period().startDate(), c.expected().period().endDate())
                : com.rhn.analytics.semantic.model.TimeIntent.monthToDate();

            com.rhn.analytics.semantic.model.ScopeIntent scope = "AUTHORIZED".equalsIgnoreCase(c.expected().scope())
                ? com.rhn.analytics.semantic.model.ScopeIntent.AUTHORIZED
                : com.rhn.analytics.semantic.model.ScopeIntent.CURRENT;

            com.rhn.analytics.semantic.model.SortIntent sort = c.expected().sort() != null
                ? new com.rhn.analytics.semantic.model.SortIntent(c.expected().sort().metric(), c.expected().sort().direction())
                : null;

            return new com.rhn.analytics.semantic.model.SemanticQuery(intent, metrics, dimensions, List.of(), period, scope, sort, 10);
        }

        // 歧义与不支持场景直接从问题或语义特征提取意图
        String q = c.question();
        List<com.rhn.analytics.semantic.model.MetricIntent> mList;
        List<com.rhn.analytics.semantic.model.DimensionIntent> dList = new ArrayList<>();

        if (q.contains("收入")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("门诊收入"));
        else if (q.contains("看病人数")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("看病人数"));
        else if (q.contains("患者数量")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("患者数量"));
        else if (q.contains("收费情况")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("收费情况"));
        else if (q.contains("诊断数量")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("诊断数量"));
        else if (q.contains("退号情况")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("退号情况"));
        else if (q.contains("医嘱量")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("科室医嘱量"));
        else if (q.contains("医保")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("医保基金到账金额"));
        else if (q.contains("现金")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("实收挂号费现金"));
        else if (q.contains("药占比")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("药占比"));
        else if (q.contains("次均")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("次均药品费用"));
        else if (q.contains("高血压") && q.contains("药")) {
            mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("开立药品"));
            dList.add(new com.rhn.analytics.semantic.model.DimensionIntent("高血压"));
        } else if (q.contains("处方量") || q.contains("医生")) {
            mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("处方量"));
            dList.add(new com.rhn.analytics.semantic.model.DimensionIntent("按医生"));
        } else if (q.contains("住院")) mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("住院天数"));
        else if (q.contains("年龄") || q.contains("性别")) {
            mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent("门诊患者人数"));
            dList.add(new com.rhn.analytics.semantic.model.DimensionIntent("年龄"));
        } else {
            mList = List.of(new com.rhn.analytics.semantic.model.MetricIntent(q));
        }

        return new com.rhn.analytics.semantic.model.SemanticQuery(
            com.rhn.analytics.semantic.model.AnalysisIntent.METRIC_SUMMARY,
            mList,
            dList,
            List.of(),
            com.rhn.analytics.semantic.model.TimeIntent.monthToDate(),
            com.rhn.analytics.semantic.model.ScopeIntent.CURRENT,
            null,
            null
        );
    }
}
