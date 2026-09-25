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
                        "classpath:db/migration",
                        "classpath:db/local",
                        "classpath:db/h2")
                .load();

        var result = flyway.migrate();
        assertEquals(4, result.migrationsExecuted);
        assertEquals(0, flyway.migrate().migrationsExecuted);

        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            try (var history = sql.executeQuery("select version, type, script from flyway_schema_history order by installed_rank")) {
                assertTrue(history.next());
                assertEquals("TABLE", history.getString("type"));
                assertNull(history.getString("version"));
                assertTrue(history.next());
                assertEquals("1.84.0", history.getString("version"));
                assertTrue(history.next());
                assertEquals("1.84.1", history.getString("version"));
                assertTrue(history.next());
                assertEquals("1.84.2", history.getString("version"));
                assertTrue(history.next());
                assertEquals("1.85.0", history.getString("version"));
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
            assertEquals(247, count(sql, "select count(*) from RHN_BD_MED"
                    + " where SD_STATUS = 'RETIRED' and CD_MED like 'MED-2026-%'"));
            assertEquals(4, count(sql, "select count(*) from RHN_BD_MED"
                    + " where SD_STATUS = 'ACTIVE' and CD_MED in"
                    + " ('DEMO-DRUG-FLU-VAC','DEMO-DRUG-MEM','DEMO-DRUG-PEN-G','DEMO-DRUG-HUANGQI')"));
            assertEquals(45523, count(sql, "select count(*) from RHN_BD_CONCEPT where ID_CODE_SYSTEM = 362387869795001"));
            assertEquals(1, count(sql, "select count(*) from RHN_BD_CONCEPT where ID_CONCEPT = 362387869795011 and CD_CONCEPT = 'I10'"));
            assertEquals(89, count(sql, "select count(*) from RHN_BD_CONCEPT_ALIAS where ID_CONCEPT in (select ID_CONCEPT from RHN_BD_CONCEPT where ID_CODE_SYSTEM = 362387869795001)"));
            String jsonType = sql.executeQuery("select JSON_SNAP from RHN_SYS_PRINT_OUTPUT").getMetaData().getColumnTypeName(1);
            assertTrue(jsonType.equalsIgnoreCase("CHARACTER LARGE OBJECT"), jsonType);
        }
    }

    @Test
    void squashed_baseline_is_present_in_canonical_directories() {
        assertTrue(Files.isRegularFile(path("src/main/resources/db/migration/B1_84_0__rhn_schema_and_metadata.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/oracle/B1_84_0__rhn_schema_and_metadata.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/local/V1_84_1__development_hospital.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/oracle-local/V1_84_1__development_hospital.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/h2/V1_84_2__h2_clob_types.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/migration/V1_85_0__national_healthcare_security_icd10_catalog.sql")));
        assertTrue(Files.isRegularFile(path("src/main/resources/db/oracle/V1_85_0__national_healthcare_security_icd10_catalog.sql")));
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
