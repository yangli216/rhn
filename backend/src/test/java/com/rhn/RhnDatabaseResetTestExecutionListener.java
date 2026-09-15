package com.rhn;

import com.github.benmanes.caffeine.cache.Cache;
import com.rhn.platform.configuration.infrastructure.ConfigurationValueCache;
import com.rhn.platform.dictionary.translation.DictionaryTextCache;
import org.h2.tools.RunScript;
import org.springframework.core.env.Profiles;
import org.springframework.test.context.TestContext;
import org.springframework.test.context.support.AbstractTestExecutionListener;
import org.springframework.test.util.ReflectionTestUtils;

import javax.sql.DataSource;
import java.io.StringReader;
import java.sql.Connection;

/** Class-scoped, in-memory snapshots: no static DataSource references or temporary files. */
final class RhnDatabaseResetTestExecutionListener extends AbstractTestExecutionListener {
    private static final String BASELINE = RhnDatabaseResetTestExecutionListener.class.getName();

    @Override
    public int getOrder() {
        return 3500; // Restore before Spring starts a test-managed transaction (order 4000).
    }

    @Override
    public void beforeTestClass(TestContext context) throws Exception {
        try (Connection connection = connection(context);
             var statement = connection.createStatement();
             var rows = statement.executeQuery("SCRIPT")) {
            var script = new StringBuilder();
            while (rows.next()) script.append(rows.getString(1)).append('\n');
            context.setAttribute(BASELINE, script.toString());
        }
    }

    @Override
    public void beforeTestMethod(TestContext context) throws Exception {
        String baseline = (String) context.getAttribute(BASELINE);
        if (baseline == null) throw new IllegalStateException("Missing isolated test database baseline");
        try (Connection connection = connection(context); var statement = connection.createStatement()) {
            statement.execute("DROP ALL OBJECTS");
            RunScript.execute(connection, new StringReader(baseline));
        }
        var application = context.getApplicationContext();
        application.getBean(ConfigurationValueCache.class).invalidateAll();
        // Keep reset machinery in test sources; production cache APIs need no testing hooks.
        var cache = (Cache<?, ?>) ReflectionTestUtils.getField(application.getBean(DictionaryTextCache.class), "cache");
        if (cache == null) throw new IllegalStateException("Dictionary cache reset contract changed");
        cache.invalidateAll();
        cache.cleanUp();
    }

    @Override
    public void afterTestClass(TestContext context) {
        context.removeAttribute(BASELINE);
        // The inherited AFTER_CLASS DirtiesContext still closes all other in-memory state.
    }

    private static Connection connection(TestContext context) throws Exception {
        var application = context.getApplicationContext();
        if (!application.getEnvironment().acceptsProfiles(Profiles.of("test"))) {
            throw new IllegalStateException("Database reset requires the test profile");
        }
        if (Boolean.parseBoolean(context.getApplicationContext().getEnvironment()
                .getProperty("junit.jupiter.execution.parallel.enabled", "false"))) {
            throw new IllegalStateException("Database reset requires sequential test execution");
        }
        Connection connection = application.getBean(DataSource.class).getConnection();
        if (!connection.getMetaData().getURL().startsWith("jdbc:h2:mem:rhn-")) {
            connection.close();
            throw new IllegalStateException("Database reset requires an isolated in-memory RHN test database");
        }
        return connection;
    }
}
