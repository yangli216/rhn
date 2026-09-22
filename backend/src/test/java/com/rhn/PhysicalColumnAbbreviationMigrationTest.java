package com.rhn;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Upgrade the existing schema in place, including all seeded data and tenant composite keys. */
@ActiveProfiles("test")
class PhysicalColumnAbbreviationMigrationTest {
    private static final String MIGRATION = "V1_77_0__governed_column_abbreviations.sql";

    @Test
    void renamed_columns_preserve_data_types_defaults_comments_keys_and_indexes() throws Exception {
        var mapper = JsonMapper.builder().build();
        var manifest = mapper.readTree(Files.readString(Path.of("../docs/database/column-renames-1.77.0.json")));
        Map<String, Map<String, String>> renames = new TreeMap<>();
        for (var row : manifest.get("renames")) {
            renames.computeIfAbsent(row.get("table").asString(), ignored -> new LinkedHashMap<>())
                    .put(row.get("before").asString(), row.get("after").asString());
        }
        // Both databases use the same portable ALTER TABLE RENAME COLUMN statements.
        String sqlMigration = Files.readString(Path.of("src/main/resources/db/migration", MIGRATION));
        assertEquals(sqlMigration,
                Files.readString(Path.of("src/main/resources/db/oracle", MIGRATION)));
        int renameCount = 0;
        for (var table : renames.entrySet()) for (var column : table.getValue().entrySet()) {
            assertTrue(sqlMigration.contains("ALTER TABLE " + table.getKey() + " RENAME COLUMN "
                    + column.getKey() + " TO " + column.getValue() + ";"), "Migration differs from the review manifest");
            renameCount++;
        }
        assertEquals(renameCount, sqlMigration.lines().filter(line -> line.startsWith("ALTER TABLE ")).count());
        String url = "jdbc:h2:mem:column-naming-test-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        var config = Flyway.configure().dataSource(url, "sa", "")
                .locations("classpath:db/migration", "classpath:db/h2", "classpath:db/local");
        config.target("1.76.0").load().migrate();
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            // Retain nonempty CLOB and timestamp values in an otherwise empty version-history table.
            try (var sql = connection.createStatement()) {
                sql.executeUpdate("""
                        insert into RHN_BD_CLIN_SEM_VER
                        (ID_CLIN_SEM_VER, ID_TNT, SD_CONCEPT_KIND, CD_CONCEPT, HASH_SEM_VER,
                         SD_CHANGE_TYPE, DES_SOURCE, JSON_SNAPSHOT, DT_RECORDED)
                        values (101, 1, 'MEDICATION', 'test', 'saved-version', 'CAPTURED',
                                '命名迁移保留证据', '{"saved":true}', current_timestamp)
                        """);
            }
            Map<String, String> dataBefore = dataDigests(connection, renames);
            var structureBefore = structures(connection, renames, true);
            var result = config.target("1.77.0").load().migrate();
            assertEquals(1, result.migrationsExecuted);
            assertEquals(dataBefore, dataDigests(connection, renames), "Column rename must not alter any existing row");
            assertEquals(structureBefore, structures(connection, renames, false),
                    "Types, defaults, comments, tenant foreign keys, unique keys and indexes must survive renaming");
            assertEquals(0, config.load().migrate().migrationsExecuted, "Flyway must not repeat the rename");
            try (var sql = connection.createStatement(); var row = sql.executeQuery(
                    "select JSON_SNAP, DT_RECDD from RHN_BD_CLIN_SEM_VER where ID_CLIN_SEM_VER=101")) {
                assertTrue(row.next());
                assertEquals("{\"saved\":true}", row.getString(1));
                assertNotNull(row.getTimestamp(2));
            }
        }
    }

    private Map<String, String> dataDigests(Connection connection, Map<String, Map<String, String>> renames) throws Exception {
        Map<String, String> result = new TreeMap<>();
        for (String table : renames.keySet()) {
            List<String> rows = new ArrayList<>();
            try (var sql = connection.createStatement(); var data = sql.executeQuery("select * from " + table)) {
                int columns = data.getMetaData().getColumnCount();
                while (data.next()) {
                    var digest = MessageDigest.getInstance("SHA-256");
                    for (int i = 1; i <= columns; i++) {
                        String value = data.getString(i);
                        digest.update((value == null ? "-1:" : value.length() + ":" + value).getBytes(StandardCharsets.UTF_8));
                    }
                    rows.add(HexFormat.of().formatHex(digest.digest()));
                }
            }
            rows.sort(String::compareTo);
            result.put(table, rows.size() + ":" + HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(String.join("", rows).getBytes(StandardCharsets.UTF_8))));
        }
        return result;
    }

    private Map<String, Object> structures(Connection connection, Map<String, Map<String, String>> renames,
                                           boolean before) throws Exception {
        Map<String, Object> result = new TreeMap<>();
        var meta = connection.getMetaData();
        for (String table : renames.keySet()) {
            String physical = table.toLowerCase(Locale.ROOT);
            try (var columns = meta.getColumns(null, connection.getSchema(), physical, null)) {
                var fields = new TreeMap<String, List<String>>();
                while (columns.next()) {
                    String column = canonical(renames, table, columns.getString("COLUMN_NAME"), before);
                    fields.put(column, List.of(columns.getString("TYPE_NAME"), columns.getString("COLUMN_SIZE"),
                            String.valueOf(columns.getString("DECIMAL_DIGITS")), columns.getString("NULLABLE"),
                            String.valueOf(columns.getString("COLUMN_DEF")), String.valueOf(columns.getString("REMARKS"))));
                }
                result.put(table + ".columns", fields);
            }
            try (var keys = meta.getPrimaryKeys(null, connection.getSchema(), physical)) {
                result.put(table + ".pk", keyRows(keys, renames, table, before, "COLUMN_NAME", "KEY_SEQ", "PK_NAME"));
            }
            try (var indexes = meta.getIndexInfo(null, connection.getSchema(), physical, false, false)) {
                result.put(table + ".indexes", keyRows(indexes, renames, table, before,
                        "COLUMN_NAME", "INDEX_NAME", "NON_UNIQUE", "ORDINAL_POSITION", "ASC_OR_DESC"));
            }
        }
        // Check every FK, including references from tables whose own columns did not change.
        int foreignKeyColumns = 0;
        try (var tables = meta.getTables(null, connection.getSchema(), "rhn_%", new String[]{"BASE TABLE"})) {
            while (tables.next()) {
                String table = tables.getString("TABLE_NAME");
                var keys = new TreeSet<String>();
                try (var rows = meta.getImportedKeys(null, connection.getSchema(), table)) {
                    while (rows.next()) keys.add(rows.getString("FK_NAME") + ":" + rows.getString("KEY_SEQ") + ":"
                            + canonical(renames, table, rows.getString("FKCOLUMN_NAME"), before) + ":"
                            + rows.getString("PKTABLE_NAME") + ":"
                            + canonical(renames, rows.getString("PKTABLE_NAME"), rows.getString("PKCOLUMN_NAME"), before)
                            + ":" + rows.getString("UPDATE_RULE") + ":" + rows.getString("DELETE_RULE"));
                }
                foreignKeyColumns += keys.size();
                result.put(table + ".fk", keys);
            }
        }
        assertTrue(foreignKeyColumns > 1000, "Must inspect actual tenant composite foreign keys");
        return result;
    }

    private TreeSet<String> keyRows(ResultSet rows, Map<String, Map<String, String>> renames, String table,
                                     boolean before, String... fields) throws Exception {
        var result = new TreeSet<String>();
        while (rows.next()) {
            List<String> values = new ArrayList<>();
            for (String field : fields) values.add(field.equals("COLUMN_NAME")
                    ? canonical(renames, table, rows.getString(field), before) : String.valueOf(rows.getString(field)));
            result.add(String.join(":", values));
        }
        return result;
    }

    private String canonical(Map<String, Map<String, String>> renames, String table, String column, boolean before) {
        if (column == null) return "";
        String name = column.toUpperCase(Locale.ROOT);
        return before ? renames.getOrDefault(table.toUpperCase(Locale.ROOT), Map.of()).getOrDefault(name, name) : name;
    }
}
