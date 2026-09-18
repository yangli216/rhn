package com.rhn.analytics.semantic.execution;

import com.rhn.analytics.semantic.plan.CompiledQuery;

/**
 * 结构化查询执行引擎接口。
 * 负责执行编译好的参数化查询并转化为领域结果集。
 */
public interface StructuredExecutionEngine {
    ExecutionResult execute(CompiledQuery query);
}
