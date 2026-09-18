package com.rhn.analytics.semantic.execution;

import com.rhn.analytics.semantic.interpreter.AnalysisIntentInterpreter;
import com.rhn.analytics.semantic.model.ScopeIntent;
import com.rhn.analytics.semantic.model.SemanticQuery;
import com.rhn.analytics.semantic.plan.*;
import com.rhn.analytics.semantic.resolver.Resolution;
import com.rhn.analytics.semantic.resolver.ResolutionStatus;
import com.rhn.analytics.semantic.resolver.SemanticResolver;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * 语义统计分析端到端主门面服务（SemanticAnalysisService）。
 * 完整编排意图提取、确定性消歧、图路径规划、安全物理校验、SQL编译与物理执行引擎。
 */
@Service
public class SemanticAnalysisService {

    private final AnalysisIntentInterpreter interpreter;
    private final SemanticResolver resolver;
    private final QueryPlanner planner;
    private final QueryPlanValidator validator;
    private final QueryCompiler compiler;
    private final StructuredExecutionEngine executionEngine;
    private final ExecutionContextProvider contextProvider;
    private final WorkContextDirectory workContextDirectory;

    public SemanticAnalysisService(
        AnalysisIntentInterpreter interpreter,
        SemanticResolver resolver,
        QueryPlanner planner,
        QueryPlanValidator validator,
        QueryCompiler compiler,
        StructuredExecutionEngine executionEngine,
        @Autowired(required = false) ExecutionContextProvider contextProvider,
        @Autowired(required = false) WorkContextDirectory workContextDirectory
    ) {
        this.interpreter = interpreter;
        this.resolver = resolver;
        this.planner = planner;
        this.validator = validator;
        this.compiler = compiler;
        this.executionEngine = executionEngine;
        this.contextProvider = contextProvider;
        this.workContextDirectory = workContextDirectory;
    }

    public Resolution resolve(SemanticQuery query) {
        return resolver.resolve(query);
    }

    public LogicalQueryPlan plan(com.rhn.analytics.semantic.resolver.ResolvedSemanticQuery resolvedQuery, PlannedScope scope, LocalDate today) {
        return planner.plan(resolvedQuery, scope, today);
    }

    public ValidationResult validate(LogicalQueryPlan plan) {
        return validator.validate(plan);
    }

    public CompiledQuery compile(LogicalQueryPlan plan) {
        return compiler.compile(plan);
    }

    public ExecutionResult execute(CompiledQuery query) {
        return executionEngine.execute(query);
    }

    /**
     * 端到端执行语义查询（解析 -> 规划 -> 校验 -> 编译 -> 执行）
     */
    public ExecutionResult executeEndToEnd(SemanticQuery query, PlannedScope scopeOverride) {
        Objects.requireNonNull(query, "SemanticQuery cannot be null");

        // 1. 确定性消歧与解析
        Resolution resolution = resolver.resolve(query);
        if (resolution.status() == ResolutionStatus.CLARIFY) {
            String prompt = resolution.clarification() != null ? resolution.clarification().message() : "口径存在歧义，需要确认";
            return ExecutionResult.clarify(prompt, resolution.clarification());
        }
        if (resolution.status() == ResolutionStatus.UNSUPPORTED) {
            String reason = resolution.message() != null ? resolution.message() : (resolution.unsupportedReason() != null ? resolution.unsupportedReason() : "当前系统暂不支持该统计口径");
            return ExecutionResult.unsupported(reason);
        }

        // 2. 解析多租户组织安全切片 (Security Scope)
        PlannedScope effectiveScope = scopeOverride != null ? scopeOverride : resolveCurrentScope(query.scope());

        // 3. 规划逻辑查询计划 (Logical Query Plan)
        LogicalQueryPlan plan = planner.plan(resolution.query(), effectiveScope, LocalDate.now());

        // 4. 计划安全底线校验 (Validation)
        ValidationResult validation = validator.validate(plan);
        if (!validation.isValid()) {
            return ExecutionResult.unsupported("查询计划安全校验未通过: " + String.join("; ", validation.errors()));
        }

        // 5. 编译为参数化物理执行查询 (Compilation)
        CompiledQuery compiled = compiler.compile(plan);

        // 6. 物理执行引擎执行并规整结果 (Execution)
        return executionEngine.execute(compiled);
    }

    /**
     * 端到端自然语言驱动执行（意图提取 -> 解析 -> 规划 -> 校验 -> 编译 -> 执行）
     */
    public ExecutionResult executeNaturalLanguage(String text, PlannedScope scopeOverride) {
        Objects.requireNonNull(text, "Text cannot be null");
        SemanticQuery query = interpreter.interpret(new AnalysisIntentInterpreter.InterpretRequest(text, null, java.util.List.of(), LocalDate.now()));
        return executeEndToEnd(query, scopeOverride);
    }

    public PlannedScope resolveCurrentScope(ScopeIntent intent) {
        if (intent == null) intent = ScopeIntent.AUTHORIZED;

        ExecutionContext ec = null;
        if (contextProvider != null) {
            try {
                ec = contextProvider.requireCurrent();
            } catch (Exception ignored) {}
        }

        if (ec == null || ec.tenantId() == null) {
            return PlannedScope.defaultDevScope();
        }

        Long tenantId = ec.tenantId();
        Long orgId = ec.organizationId();
        Map<Long, String> depts = new LinkedHashMap<>();

        if (intent == ScopeIntent.CURRENT) {
            if (ec.departmentId() != null) {
                depts.put(ec.departmentId(), "当前科室");
            }
        } else if (workContextDirectory != null && ec.subjectId() != null) {
            try {
                workContextDirectory.availableContexts(tenantId, ec.subjectId()).stream()
                    .filter(o -> orgId != null && orgId.equals(o.organizationId()) && o.departmentId() != null && o.authorities().contains("PORTAL.ACCESS"))
                    .forEach(o -> depts.put(o.departmentId(), o.departmentName()));
            } catch (Exception ignored) {}
        }

        return new PlannedScope(intent, tenantId, orgId, depts);
    }
}
