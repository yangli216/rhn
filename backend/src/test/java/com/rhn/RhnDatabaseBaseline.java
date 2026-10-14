package com.rhn;

import org.h2.tools.RunScript;

import javax.sql.DataSource;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * One compressed seed-data snapshot per cached Spring application context.
 *
 * <p>Restoring the whole script re-imports every seed row (the concept catalog alone is ~85% of it), so a reset
 * normally restores only tables whose H2 {@code LAST_MODIFICATION} mark changed since the baseline. Any schema
 * change (tables, columns, constraints, indexes, views, schemas, sequences) falls back to the full
 * {@code DROP ALL OBJECTS} + script replay, so the restored state is identical either way.
 */
final class RhnDatabaseBaseline {
    private static final Pattern INSERT_TARGET = Pattern.compile("^INSERT INTO (\"[^\"]*\"\\.\"[^\"]*\")[ (]");
    private static final String BASE_TABLES = "SELECT TABLE_SCHEMA, TABLE_NAME, LAST_MODIFICATION FROM INFORMATION_SCHEMA.TABLES "
            + "WHERE TABLE_TYPE = 'BASE TABLE' AND UPPER(TABLE_SCHEMA) NOT IN ('INFORMATION_SCHEMA', 'PG_CATALOG') ORDER BY TABLE_SCHEMA, TABLE_NAME";
    private static final String[] STRUCTURE_QUERIES = {
            "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES ORDER BY 1, 2",
            "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, "
                    + "IS_IDENTITY FROM INFORMATION_SCHEMA.COLUMNS ORDER BY 1, 2, 4",
            "SELECT CONSTRAINT_SCHEMA, CONSTRAINT_NAME, CONSTRAINT_TYPE, TABLE_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS ORDER BY 1, 2",
            "SELECT INDEX_SCHEMA, INDEX_NAME, TABLE_NAME, INDEX_TYPE_NAME FROM INFORMATION_SCHEMA.INDEXES ORDER BY 1, 2",
            "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY 1",
            "SELECT SEQUENCE_SCHEMA, SEQUENCE_NAME FROM INFORMATION_SCHEMA.SEQUENCES ORDER BY 1, 2",
            "SELECT TRIGGER_SCHEMA, TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS ORDER BY 1, 2",
    };

    private final DataSource dataSource;
    private byte[] compressedScript;
    /** Seed INSERT statements per quoted table name; tables without rows have no entry. */
    private Map<String, byte[]> tableData = Map.of();
    private Map<String, Long> cleanMarks = Map.of();
    /** Seed row counts, only kept when -Drhn.test.reset.verify=true audits per-table restores. */
    private Map<String, Long> seedCounts = Map.of();
    private final boolean verify = Boolean.getBoolean("rhn.test.reset.verify");
    private String structure;
    private int lastRestoredTables;
    private boolean lastRestoreFull;

    RhnDatabaseBaseline(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    synchronized void restoreOrCapture() throws Exception {
        try (Connection connection = connection()) {
            if (compressedScript == null) {
                capture(connection);
                lastRestoredTables = 0;
                lastRestoreFull = false;
                return;
            }
            Map<String, Long> marks = marks(connection);
            if (!marks.keySet().equals(cleanMarks.keySet()) || !structure(connection).equals(structure)) {
                restoreAll(connection);
                return;
            }
            List<String> dirty = new ArrayList<>();
            marks.forEach((table, mark) -> { if (!mark.equals(cleanMarks.get(table))) dirty.add(table); });
            lastRestoreFull = false;
            lastRestoredTables = dirty.size();
            if (dirty.isEmpty()) return;
            restoreTables(connection, dirty);
            cleanMarks = marks(connection);
            if (verify) verifyCounts(connection, dirty);
        }
    }

    /** Audit mode: a clean-marked table whose row count drifted means a modification was not detected. */
    private void verifyCounts(Connection connection, List<String> restored) throws SQLException {
        var drifted = new ArrayList<String>();
        var current = counts(connection);
        seedCounts.forEach((table, count) -> {
            if (!count.equals(current.get(table))) drifted.add(table + " expected=" + count + " actual=" + current.get(table));
        });
        if (!drifted.isEmpty()) {
            throw new IllegalStateException("Per-table reset left drifted tables " + drifted + " after restoring " + restored);
        }
    }

    private Map<String, Long> counts(Connection connection) throws SQLException {
        var result = new LinkedHashMap<String, Long>();
        try (var statement = connection.createStatement()) {
            for (String table : cleanMarks.keySet()) {
                try (var rows = statement.executeQuery("SELECT COUNT(*) FROM " + table)) {
                    rows.next();
                    result.put(table, rows.getLong(1));
                }
            }
        }
        return result;
    }

    /** Diagnostics for isolation tests: how the most recent reset restored the database. */
    synchronized int lastRestoredTables() { return lastRestoredTables; }
    synchronized boolean lastRestoreFull() { return lastRestoreFull; }

    private void capture(Connection connection) throws Exception {
        var script = new ByteArrayOutputStream();
        var perTable = new LinkedHashMap<String, ByteArrayOutputStream>();
        var writers = new LinkedHashMap<String, Writer>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery("SCRIPT");
             var writer = new OutputStreamWriter(new GZIPOutputStream(script), StandardCharsets.UTF_8)) {
            while (rows.next()) {
                String line = rows.getString(1);
                writer.write(line);
                writer.write('\n');
                var target = INSERT_TARGET.matcher(line);
                if (target.find()) {
                    Writer tableWriter = writers.computeIfAbsent(target.group(1), table -> {
                        var bytes = new ByteArrayOutputStream();
                        perTable.put(table, bytes);
                        try {
                            return new OutputStreamWriter(new GZIPOutputStream(bytes), StandardCharsets.UTF_8);
                        } catch (java.io.IOException exception) {
                            throw new java.io.UncheckedIOException(exception);
                        }
                    });
                    tableWriter.write(line);
                    tableWriter.write('\n');
                }
            }
        } finally {
            for (Writer tableWriter : writers.values()) tableWriter.close();
        }
        compressedScript = script.toByteArray();
        var data = new LinkedHashMap<String, byte[]>();
        perTable.forEach((table, bytes) -> data.put(table, bytes.toByteArray()));
        tableData = Map.copyOf(data);
        cleanMarks = marks(connection);
        structure = structure(connection);
        if (verify) seedCounts = counts(connection);
    }

    private void restoreAll(Connection connection) throws Exception {
        try (var statement = connection.createStatement()) {
            statement.execute("DROP ALL OBJECTS");
        }
        run(connection, compressedScript);
        cleanMarks = marks(connection);
        structure = structure(connection);
        lastRestoreFull = true;
        lastRestoredTables = cleanMarks.size();
    }

    private void restoreTables(Connection connection, List<String> tables) throws Exception {
        try (var statement = connection.createStatement()) {
            // Restored rows are the consistent baseline; constraints are not re-validated row by row.
            statement.execute("SET REFERENTIAL_INTEGRITY FALSE");
            try {
                for (String table : tables) statement.execute("TRUNCATE TABLE " + table);
                for (String table : tables) {
                    byte[] rows = tableData.get(table);
                    if (rows != null) run(connection, rows);
                }
            } finally {
                statement.execute("SET REFERENTIAL_INTEGRITY TRUE");
            }
        }
    }

    private static void run(Connection connection, byte[] compressed) throws Exception {
        try (var input = new GZIPInputStream(new ByteArrayInputStream(compressed));
             var reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
            RunScript.execute(connection, reader);
        }
    }

    private static Map<String, Long> marks(Connection connection) throws SQLException {
        var result = new LinkedHashMap<String, Long>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(BASE_TABLES)) {
            while (rows.next()) {
                result.put(quoted(rows.getString(1)) + "." + quoted(rows.getString(2)), rows.getLong(3));
            }
        }
        return result;
    }

    private static String structure(Connection connection) throws Exception {
        var digest = MessageDigest.getInstance("SHA-256");
        try (var statement = connection.createStatement()) {
            for (String query : STRUCTURE_QUERIES) {
                digest.update(query.getBytes(StandardCharsets.UTF_8));
                try (var rows = statement.executeQuery(query)) {
                    int columns = rows.getMetaData().getColumnCount();
                    while (rows.next()) {
                        for (int column = 1; column <= columns; column++) {
                            String value = rows.getString(column);
                            digest.update((value == null ? "\u0000" : value).getBytes(StandardCharsets.UTF_8));
                            digest.update((byte) 0x1f);
                        }
                        digest.update((byte) 0x1e);
                    }
                }
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private static String quoted(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private Connection connection() throws Exception {
        Connection connection = dataSource.getConnection();
        if (!connection.getMetaData().getURL().startsWith("jdbc:h2:mem:rhn-")) {
            connection.close();
            throw new IllegalStateException("Database reset requires an isolated in-memory RHN test database");
        }
        return connection;
    }
}
