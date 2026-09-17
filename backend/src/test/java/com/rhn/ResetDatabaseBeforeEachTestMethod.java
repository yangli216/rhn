package com.rhn;

import org.springframework.context.annotation.Import;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.api.parallel.Isolated;
import org.springframework.test.context.TestExecutionListeners;

import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Opt-in for tests whose mutable state is limited to the database and dictionary/config caches. */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Isolated
@Execution(ExecutionMode.SAME_THREAD)
@Import(RhnDatabaseResetConfiguration.class)
@TestExecutionListeners(listeners = RhnDatabaseResetTestExecutionListener.class,
        mergeMode = TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS)
public @interface ResetDatabaseBeforeEachTestMethod {}
