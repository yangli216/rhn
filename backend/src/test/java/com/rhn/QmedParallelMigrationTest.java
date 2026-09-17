package com.rhn;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.context.ActiveProfiles;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Both parallel histories must converge without clearing data or repairing history. */
@ActiveProfiles("test")
class QmedParallelMigrationTest {
    @TempDir Path legacy;

    @Test
    void qmed0_history_keeps_semantics_and_gains_workbench_tables() throws Exception {
        for (String resource : new String[]{
                "migration/B1_42_1__rhn_schema_and_metadata.sql",
                "h2/V1_42_2__h2_clob_types.sql",
                "local/V1_42_3__development_hospital.sql",
                "legacy-qmed0/migration/V1_43_0__standard_medication_dose_forms.sql",
                "migration/V1_44_0__qmed_safety_foundation.sql",
                "legacy-qmed0/migration/V1_45_0__qmed_clinical_semantics.sql"}) {
            try (var input = getClass().getResourceAsStream("/db/" + resource)) {
                assertNotNull(input, resource);
                Files.copy(input, legacy.resolve(Path.of(resource).getFileName()));
            }
        }
        String url = database();
        Flyway.configure().dataSource(url, "sa", "").locations("filesystem:" + legacy).load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            sql.executeUpdate("""
                    insert into RHN_BD_CLIN_SEM_VER
                    (ID_CLIN_SEM_VER, ID_TNT, SD_CONCEPT_KIND, CD_CONCEPT, HASH_SEM_VER,
                     SD_CHANGE_TYPE, DES_SOURCE, JSON_SNAPSHOT, DT_RECORDED)
                    values (1, 1, 'MEDICATION', 'test', 'saved-version', 'CAPTURED', 'test', '{"saved":true}', current_timestamp)
                    """);
        }
        // oracle-local already tolerates historical files removed by the baseline consolidation.
        var merged = Flyway.configure().dataSource(url, "sa", "")
                .locations("classpath:db/migration", "classpath:db/h2", "classpath:db/local")
                .validateOnMigrate(false).outOfOrder(true).load();
        merged.migrate();
        assertEquals(0, merged.migrate().migrationsExecuted);
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            try (var row = sql.executeQuery("select JSON_SNAPSHOT from RHN_BD_CLIN_SEM_VER where ID_CLIN_SEM_VER=1")) {
                assertTrue(row.next());
                assertEquals("{\"saved\":true}", row.getString(1));
            }
            try (var row = sql.executeQuery("select script from flyway_schema_history where version='1.45.0'")) {
                assertTrue(row.next());
                assertEquals("V1_45_0__qmed_clinical_semantics.sql", row.getString(1));
            }
            sql.executeUpdate("insert into RHN_AUD_MED_CAND values (2, 1, 1, '{}')");
            sql.executeUpdate("insert into RHN_AUD_MED_TRIAL values (3, 1, 2, 1, '{}', '{}')");
        }
    }

    @Test
    void remote_history_keeps_workbench_data_and_gains_semantics() throws Exception {
        String url = database();
        var config = Flyway.configure().dataSource(url, "sa", "")
                .locations("classpath:db/migration", "classpath:db/h2", "classpath:db/local");
        config.target("1.48.0").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            sql.executeUpdate("insert into RHN_AUD_MED_CAND values (2, 1, 1, '{\"saved\":true}')");
        }
        config.target("latest").load().migrate();
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            try (var row = sql.executeQuery("select JSON_CONTENT from RHN_AUD_MED_CAND where ID_CAND=2")) {
                assertTrue(row.next());
                assertEquals("{\"saved\":true}", row.getString(1));
            }
            try (var row = sql.executeQuery("select count(*) from RHN_BD_CLIN_SEM_VER")) {
                assertTrue(row.next());
                assertEquals(0, row.getInt(1));
            }
        }
    }

    private static String database() {
        return "jdbc:h2:mem:qmed-merge-test-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
    }
}
