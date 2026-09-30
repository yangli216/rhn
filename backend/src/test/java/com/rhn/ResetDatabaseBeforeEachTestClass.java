package com.rhn;

import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.api.parallel.Isolated;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestExecutionListeners;

import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Reuses the Spring context while restoring its isolated H2 database before each test class. */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Isolated
@Execution(ExecutionMode.SAME_THREAD)
@Import(RhnDatabaseResetConfiguration.class)
@TestExecutionListeners(listeners = RhnDatabaseResetTestExecutionListener.class,
        mergeMode = TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS)
public @interface ResetDatabaseBeforeEachTestClass {}
