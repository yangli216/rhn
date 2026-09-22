package com.rhn;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Verifies that the disposable fresh-schema package is a real one-pass database. */
class RebuildDatabaseBaselineTest {
    @Test
    void fresh_h2_uses_the_rebuild_base_fixture_and_adapter_once() throws Exception {
        String url = "jdbc:h2:mem:rhn-rebuild-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1";
        var flyway = Flyway.configure().dataSource(url, "sa", "")
                .locations(
                        "filesystem:" + path("src/main/resources/db/rebuild/postgresql"),
                        "filesystem:" + path("src/main/resources/db/rebuild/local"),
                        "filesystem:" + path("src/main/resources/db/rebuild/h2"))
                .load();

        var result = flyway.migrate();
        assertEquals(3, result.migrationsExecuted);
        assertEquals(0, flyway.migrate().migrationsExecuted);

        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            try (var history = sql.executeQuery("select version, type, script from flyway_schema_history order by installed_rank")) {
                assertTrue(history.next());
                assertEquals("TABLE", history.getString("type"));
                assertNull(history.getString("version"));
                assertTrue(history.next());
                assertEquals("1.77.0", history.getString("version"));
                assertTrue(history.next());
                assertEquals("1.77.1", history.getString("version"));
                assertTrue(history.next());
                assertEquals("1.77.2", history.getString("version"));
                assertFalse(history.next());
            }
            assertTrue(count(sql, "select count(*) from information_schema.tables"
                    + " where table_schema = current_schema() and table_name like 'rhn_%'") >= 318);
            assertEquals(1, count(sql, "select count(*) from RHN_PI_PAT where ID_PAT = 362387869900101"));
            assertEquals(0, count(sql, "select count(*) from information_schema.columns"
                    + " where table_schema = current_schema() and table_name = 'rhn_bd_allergen'"
                    + " and column_name = 'id_allergen'"));
            assertEquals(1, count(sql, "select count(*) from information_schema.columns"
                    + " where table_schema = current_schema() and table_name = 'rhn_bd_allergen'"
                    + " and column_name = 'id_alrgn'"));
            String jsonType = sql.executeQuery("select JSON_SNAP from RHN_SYS_PRINT_OUTPUT").getMetaData().getColumnTypeName(1);
            assertTrue(jsonType.equalsIgnoreCase("CHARACTER LARGE OBJECT"), jsonType);
        }
    }

    @Test
    void generated_package_is_current_and_declares_the_three_data_layers() throws Exception {
        Path manifest = path("src/main/resources/db/rebuild/manifest.json");
        String content = Files.readString(manifest);
        assertTrue(content.contains("standard-metadata"));
        assertTrue(content.contains("development-fixture"));
        assertTrue(content.contains("existing-patient-and-encounter-rows"));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/rebuild/postgresql/B1_77_0__rhn_schema_and_standard_metadata.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/rebuild/oracle/B1_77_0__rhn_schema_and_standard_metadata.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/rebuild/local/V1_77_1__development_hospital.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/rebuild/h2/V1_77_2__h2_clob_types.sql")));
    }

    private static int count(java.sql.Statement sql, String query) throws Exception {
        try (var result = sql.executeQuery(query)) {
            assertTrue(result.next());
            return result.getInt(1);
        }
    }

    private static Path path(String relative) {
        Path direct = Path.of(relative);
        if (Files.exists(direct)) return direct;
        return Path.of("../").resolve(relative);
    }
}
