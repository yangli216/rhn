package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import tools.jackson.databind.JsonNode;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

class RhnPhysicalSchemaGovernanceTest extends RhnIntegrationTestSupport {
    private static final Set<String> DOMAINS = Set.of(
            "SYS", "BD", "PI", "SC", "VIS", "EX", "HPL", "BIL", "INS",
            "SUP", "META", "AI", "INT", "ANL", "AN", "OP", "AST", "AUD", "ARC");

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void migrated_schema_exactly_matches_the_governed_physical_catalog() throws Exception {
        JsonNode catalog = objectMapper.readTree(Files.readString(mappingPath()));
        JsonNode naming = objectMapper.readTree(Files.readString(mappingPath().getParent().getParent()
                .resolve("database/physical-column-abbreviations.json")));
        Set<String> logicalTables = new TreeSet<>();
        Set<String> legacyTables = new TreeSet<>();
        Set<String> mappedTables = new TreeSet<>();
        Map<String, Set<String>> mappedColumns = new TreeMap<>();
        Map<String, String> mappedTableComments = new TreeMap<>();
        Map<String, Map<String, String>> mappedColumnComments = new TreeMap<>();

        for (JsonNode table : catalog) {
            String logical = table.get("logical").asString();
            String legacy = upper(table.get("legacy").asString());
            String physical = upper(table.get("physical").asString());
            String domain = upper(table.get("domain").asString());
            String tableComment = table.get("comment").asString();
            assertTrue(DOMAINS.contains(domain), () -> "Unknown domain: " + domain);
            assertTrue(logical.matches("^[a-z]+\\.[a-z][a-z0-9_]*$"),
                    () -> "Invalid canonical logical table name: " + logical);
            assertTrue(logical.startsWith(domain.toLowerCase(Locale.ROOT) + "."),
                    () -> "Logical table does not match its domain: " + logical);
            assertTrue(physical.startsWith("RHN_" + domain + "_"),
                    () -> "Physical table does not match its domain: " + physical);
            assertTrue(physical.matches("^[A-Z][A-Z0-9_]*$") && physical.length() <= 30,
                    () -> "Invalid physical table identifier: " + physical);
            assertTrue(tableComment.matches(".*[\\p{IsHan}].*") && tableComment.contains("一行代表"),
                    () -> "Missing Chinese row-grain comment for " + physical);
            assertTrue(logicalTables.add(logical), () -> "Duplicate logical table mapping: " + logical);
            assertTrue(legacyTables.add(legacy), () -> "Duplicate legacy table mapping: " + legacy);
            assertTrue(mappedTables.add(physical), () -> "Duplicate physical table mapping: " + physical);
            mappedTableComments.put(physical, tableComment);

            Set<String> columns = new TreeSet<>();
            Map<String, String> columnComments = new TreeMap<>();
            for (JsonNode column : table.get("columns")) {
                String logicalColumn = column.get("logical").asString();
                String physicalColumn = upper(column.get("physical").asString());
                String columnComment = column.get("comment").asString();
                assertTrue(logicalColumn.matches("^[a-z][a-z0-9_]*$"),
                        () -> "Invalid logical column: " + logical + "." + logicalColumn);
                assertTrue(physicalColumn.matches("^[A-Z][A-Z0-9_]*$") && physicalColumn.length() <= 30,
                        () -> "Invalid physical column: " + physical + "." + physicalColumn);
                assertFalse(physicalColumn.contains("__") || physicalColumn.endsWith("_"),
                        () -> "Empty physical column token: " + physical + "." + physicalColumn);
                if (!naming.get("identifierExceptions").has(physicalColumn)) {
                    for (String token : physicalColumn.split("_")) {
                        assertTrue(token.length() <= naming.get("maxTokenLength").asInt(),
                                () -> "Unabbreviated physical column: " + physical + "." + physicalColumn
                                        + "; register the abbreviation in docs/database/physical-column-abbreviations.json");
                    }
                }
                assertFalse(physicalColumn.matches("^(QTY_QUANTITY|AMT_AMOUNT|PRICE_PRICE)(_|$)"),
                        () -> "Redundant semantic column name: " + physical + "." + physicalColumn);
                assertTrue(columnComment.matches(".*[\\p{IsHan}].*"),
                        () -> "Missing Chinese column comment: " + physical + "." + physicalColumn);
                if (logicalColumn.equals("id") || logicalColumn.endsWith("_id")) {
                    assertTrue(physicalColumn.startsWith("ID_"),
                            () -> "Identifier column must use ID_: " + physical + "." + physicalColumn);
                }
                if (logicalColumn.equals("status") || logicalColumn.endsWith("_status")
                        || logicalColumn.matches(".*_status_(from|to)$")) {
                    assertTrue(physicalColumn.startsWith("SD_"),
                            () -> "Status column must use SD_: " + physical + "." + physicalColumn);
                }
                assertTrue(columns.add(physicalColumn),
                        () -> "Duplicate physical column mapping: " + physical + "." + physicalColumn);
                columnComments.put(physicalColumn, columnComment);
            }
            mappedColumns.put(physical, columns);
            mappedColumnComments.put(physical, columnComments);
        }

        Map<String, String> actualTableComments = new TreeMap<>();
        jdbc.query("""
                select table_name, remarks from information_schema.tables
                where table_schema = current_schema()
                  and table_type in ('BASE TABLE', 'VIEW')
                """, (RowCallbackHandler) result -> actualTableComments.put(
                upper(result.getString("table_name")), result.getString("remarks")));
        Set<String> actualObjects = new TreeSet<>(actualTableComments.keySet());
        actualObjects.remove("FLYWAY_SCHEMA_HISTORY");
        actualTableComments.remove("FLYWAY_SCHEMA_HISTORY");
        assertTrue(actualObjects.stream().allMatch(name -> name.startsWith("RHN_")),
                () -> "Non-RHN tables or views remain: " + actualObjects.stream()
                        .filter(name -> !name.startsWith("RHN_")).toList());
        assertFalse(actualObjects.stream().anyMatch(legacyTables::contains),
                () -> "Legacy tables or views remain: " + actualObjects.stream()
                        .filter(legacyTables::contains).toList());
        assertEquals(mappedTables, actualObjects, "Physical table catalog differs from the migrated schema");
        assertEquals(mappedTableComments, actualTableComments, "Physical table comments differ from the catalog");

        for (Map.Entry<String, Set<String>> table : mappedColumns.entrySet()) {
            Map<String, String> actualColumnComments = new LinkedHashMap<>();
            jdbc.query("""
                    select column_name, remarks from information_schema.columns
                    where table_schema = current_schema() and upper(table_name) = ?
                    order by ordinal_position
                    """, (RowCallbackHandler) result -> actualColumnComments.put(
                    upper(result.getString("column_name")), result.getString("remarks")), table.getKey());
            assertEquals(table.getValue(), new TreeSet<>(actualColumnComments.keySet()),
                    "Physical columns differ for table " + table.getKey());
            assertEquals(mappedColumnComments.get(table.getKey()), new TreeMap<>(actualColumnComments),
                    "Physical column comments differ for table " + table.getKey());
        }
    }

    private static Path mappingPath() {
        for (Path candidate : new Path[]{
                Path.of("docs/foundation/rhn-physical-schema-map.json"),
                Path.of("../docs/foundation/rhn-physical-schema-map.json")}) {
            if (Files.isRegularFile(candidate)) return candidate;
        }
        return fail("Cannot locate docs/foundation/rhn-physical-schema-map.json");
    }

    private static String upper(String value) {
        return value.toUpperCase(Locale.ROOT);
    }
}
