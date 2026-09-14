package com.rhn;

import org.flywaydb.core.Flyway;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestContext;
import org.springframework.test.context.support.AbstractTestExecutionListener;

import javax.sql.DataSource;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Restores the integration-test database to the migrated baseline while allowing Spring's
 * TestContext cache to keep the application context alive.
 *
 * <p>The previous strategy marked every {@link RhnIntegrationTestSupport} subclass dirty after the
 * class. That provided database isolation, but it also rebuilt the complete Spring Boot context,
 * Hikari pool, JPA entity manager factory and Flyway state for almost every integration-test class.
 * This listener snapshots each H2 test database immediately after the Spring context has migrated it
 * and restores that snapshot after the class. Tests that need method-level database isolation can use
 * {@link ResetDatabaseBeforeEachTestMethod} without forcing a Spring context rebuild.</p>
 */
final class RhnDatabaseResetTestExecutionListener extends AbstractTestExecutionListener {

    private static final Map<DataSource, Path> BASELINES = new ConcurrentHashMap<>();

    @Override
    public int getOrder() {
        // afterTestClass callbacks run in reverse order. Run the database reset before lower-order
        // framework cleanup listeners so the cached application context is still available.
        return Ordered.LOWEST_PRECEDENCE - 100;
    }

    @Override
    public void beforeTestClass(TestContext testContext) {
        DataSource dataSource = testContext.getApplicationContext().getBean(DataSource.class);
        assertInMemoryH2(dataSource);
        BASELINES.computeIfAbsent(dataSource, ignored -> createBaseline(new JdbcTemplate(dataSource)));
    }

    @Override
    public void beforeTestMethod(TestContext testContext) {
        if (testContext.getTestClass().isAnnotationPresent(ResetDatabaseBeforeEachTestMethod.class)) {
            restoreBaseline(testContext);
        }
    }

    @Override
    public void afterTestClass(TestContext testContext) {
        restoreBaseline(testContext);
    }

    private static void restoreBaseline(TestContext testContext) {
        DataSource dataSource = testContext.getApplicationContext().getBean(DataSource.class);
        assertInMemoryH2(dataSource);
        Path baseline = BASELINES.get(dataSource);
        if (baseline == null) {
            // A test may deliberately replace its context. In that exceptional path, prefer the
            // slower known-safe reset over reusing dirty data.
            Flyway flyway = testContext.getApplicationContext().getBean(Flyway.class);
            flyway.clean();
            flyway.migrate();
            return;
        }
        restoreBaseline(new JdbcTemplate(dataSource), baseline);
    }

    private static Path createBaseline(JdbcTemplate jdbc) {
        try {
            Path directory = Files.createTempDirectory("rhn-h2-baseline-");
            Path script = directory.resolve("baseline.sql").toAbsolutePath();
            jdbc.execute("SCRIPT TO '" + sqlPath(script) + "'");
            return script;
        } catch (IOException exception) {
            throw new UncheckedIOException("Unable to create H2 integration-test baseline", exception);
        }
    }

    private static void restoreBaseline(JdbcTemplate jdbc, Path baseline) {
        jdbc.execute("DROP ALL OBJECTS");
        jdbc.execute("RUNSCRIPT FROM '" + sqlPath(baseline) + "'");
    }

    private static String sqlPath(Path path) {
        return path.toString().replace('\\', '/').replace("'", "''");
    }

    private static void assertInMemoryH2(DataSource dataSource) {
        try (Connection connection = dataSource.getConnection()) {
            String url = connection.getMetaData().getURL();
            if (url == null || !url.startsWith("jdbc:h2:mem:")) {
                throw new IllegalStateException(
                        "Integration-test database reset is restricted to in-memory H2, but was: " + url);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Unable to identify integration-test database", exception);
        }
    }
}
