package com.rhn;

import org.springframework.core.env.Profiles;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.test.context.TestContext;
import org.springframework.test.context.support.AbstractTestExecutionListener;

/** Restores a context-owned database baseline before classes and opted-in test methods. */
final class RhnDatabaseResetTestExecutionListener extends AbstractTestExecutionListener {
    @Override
    public int getOrder() {
        return 3500; // Restore before Spring starts a test-managed transaction (order 4000).
    }

    @Override
    public void beforeTestClass(TestContext context) throws Exception {
        restore(context);
    }

    @Override
    public void beforeTestMethod(TestContext context) throws Exception {
        if (AnnotatedElementUtils.hasAnnotation(context.getTestClass(), ResetDatabaseBeforeEachTestMethod.class)) {
            restore(context);
        }
    }

    private static void restore(TestContext context) throws Exception {
        var application = context.getApplicationContext();
        if (!application.getEnvironment().acceptsProfiles(Profiles.of("test"))) {
            throw new IllegalStateException("Database reset requires the test profile");
        }
        if (Boolean.parseBoolean(context.getApplicationContext().getEnvironment()
                .getProperty("junit.jupiter.execution.parallel.enabled", "false"))) {
            throw new IllegalStateException("Database reset requires sequential test execution");
        }
        application.getBean(RhnDatabaseBaseline.class).restoreOrCapture();
        RhnMutableTestStateResetter.reset(application);
    }
}
