package com.rhn;

import org.flywaydb.core.Flyway;
import org.springframework.core.Ordered;
import org.springframework.test.context.TestContext;
import org.springframework.test.context.support.AbstractTestExecutionListener;

/**
 * Restores the integration-test database to the migrated baseline after each test class while
 * allowing Spring's TestContext cache to keep the application context alive.
 *
 * <p>The previous strategy marked every {@link RhnIntegrationTestSupport} subclass dirty after the
 * class. That provided database isolation, but it also rebuilt the complete Spring Boot context,
 * Hikari pool, JPA entity manager factory and Flyway state for almost every integration-test class.
 * Resetting only the database keeps the same class-level isolation boundary at a much lower cost.</p>
 */
final class RhnDatabaseResetTestExecutionListener extends AbstractTestExecutionListener {

    @Override
    public int getOrder() {
        // afterTestClass callbacks run in reverse order. Run the database reset before lower-order
        // framework cleanup listeners so the cached application context is still available.
        return Ordered.LOWEST_PRECEDENCE - 100;
    }

    @Override
    public void afterTestClass(TestContext testContext) {
        Flyway flyway = testContext.getApplicationContext().getBean(Flyway.class);
        flyway.clean();
        flyway.migrate();
    }
}
