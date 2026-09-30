package com.rhn;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 物理字段缩写重命名治理：评审清单登记的每次重命名都必须由压平的库基线落地，
 * 重命名后的物理列名在重建库中真实存在，重命名前的列名不再残留。
 */
@ActiveProfiles("test")
class PhysicalColumnAbbreviationMigrationTest {
    private static final String BASELINE = "B1_84_0__rhn_schema_and_metadata.sql";

    @Test
    void governed_abbreviation_renames_are_applied_by_the_flattened_baseline() throws Exception {
        var mapper = JsonMapper.builder().build();
        var manifest = mapper.readTree(Files.readString(Path.of("../docs/database/column-renames-1.77.0.json")));
        String migration = Files.readString(Path.of("src/main/resources/db/migration", BASELINE));
        String oracle = Files.readString(Path.of("src/main/resources/db/oracle", BASELINE));

        var governed = new TreeSet<String>();
        for (var row : manifest.get("renames")) {
            String statement = "ALTER TABLE " + row.get("table").asString() + " RENAME COLUMN "
                    + row.get("before").asString() + " TO " + row.get("after").asString() + ";";
            assertTrue(migration.contains(statement), () -> "基线迁移缺少清单登记的重命名：" + statement);
            assertTrue(oracle.contains(statement), () -> "Oracle 基线迁移缺少清单登记的重命名：" + statement);
            governed.add(statement);
        }
        assertFalse(governed.isEmpty(), "重命名清单不能为空");
        // 两种方言使用同一套可移植的重命名语句，必须逐条一致。
        assertEquals(renames(migration), renames(oracle), "迁移与 Oracle 基线的重命名语句必须一致");
        assertTrue(renames(migration).containsAll(governed), "基线重命名语句必须覆盖全部清单登记项");

        String url = "jdbc:h2:mem:column-naming-test-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        var result = Flyway.configure().dataSource(url, "sa", "")
                .locations("classpath:db/migration", "classpath:db/h2", "classpath:db/local")
                .load().migrate();
        assertTrue(result.migrationsExecuted > 0, "重建基线必须执行迁移");
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            Map<String, TreeSet<String>> columns = new LinkedHashMap<>();
            try (var sql = connection.createStatement(); var rows = sql.executeQuery("""
                    select table_name, column_name from information_schema.columns
                    where table_schema = current_schema()
                    """)) {
                while (rows.next()) {
                    columns.computeIfAbsent(rows.getString(1).toUpperCase(Locale.ROOT), ignored -> new TreeSet<>())
                            .add(rows.getString(2).toUpperCase(Locale.ROOT));
                }
            }
            for (var row : manifest.get("renames")) {
                String table = row.get("table").asString().toUpperCase(Locale.ROOT);
                var actual = columns.getOrDefault(table, new TreeSet<>());
                assertFalse(actual.isEmpty(), () -> "重建库缺少重命名清单涉及的表：" + table);
                assertTrue(actual.contains(row.get("after").asString().toUpperCase(Locale.ROOT)),
                        () -> "重建库缺少重命名后的列：" + table + "." + row.get("after").asString());
                assertFalse(actual.contains(row.get("before").asString().toUpperCase(Locale.ROOT)),
                        () -> "重建库仍残留重命名前的列：" + table + "." + row.get("before").asString());
            }
        }
    }

    /** 提取基线中的全部 ALTER TABLE ... RENAME COLUMN 语句，用于比对不同方言的可移植性。 */
    private static TreeSet<String> renames(String sql) {
        var result = new TreeSet<String>();
        for (String line : sql.split("\n")) {
            String statement = line.strip();
            if (statement.regionMatches(true, 0, "ALTER TABLE ", 0, "ALTER TABLE ".length())
                    && statement.toUpperCase(Locale.ROOT).contains(" RENAME COLUMN ")
                    && statement.endsWith(";")) {
                result.add(statement);
            }
        }
        return result;
    }
}
