import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;

import java.nio.file.*;
import java.sql.*;
import java.time.Instant;
import java.util.*;

/** Development metadata exporter. Only the random H2 test database is migrated. */
public class SchemaSnapshot {
    static Map<String, Object> object(Object... values) {
        var result = new LinkedHashMap<String, Object>();
        for (int i = 0; i < values.length; i += 2) result.put((String) values[i], values[i + 1]);
        return result;
    }

    static String upper(String value) { return value == null ? "" : value.toUpperCase(Locale.ROOT); }

    public static void main(String[] args) throws Exception {
        if (args.length != 3 || !Set.of("expected", "oracle").contains(args[0])) {
            throw new IllegalArgumentException("Usage: SchemaSnapshot expected|oracle PROJECT_ROOT OUTPUT");
        }
        String mode = args[0];
        String url;
        var properties = new Properties();
        if (mode.equals("expected")) {
            if (!"test".equals(System.getProperty("spring.profiles.active"))) {
                throw new IllegalStateException("Expected schema export requires the isolated test profile");
            }
            url = "jdbc:h2:mem:schema-" + UUID.randomUUID()
                    + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1";
            properties.setProperty("user", "sa");
            properties.setProperty("password", "");
            Path db = Path.of(args[1], "backend/src/main/resources/db");
            Flyway.configure().dataSource(url, "sa", "")
                    .locations("filesystem:" + db.resolve("migration"), "filesystem:" + db.resolve("local"), "filesystem:" + db.resolve("h2"))
                    .load().migrate();
        } else {
            url = requiredEnv("RHN_ORACLE_URL");
            if (!url.startsWith("jdbc:oracle:")) throw new IllegalArgumentException("Only the configured Oracle development connection is supported");
            properties.setProperty("user", requiredEnv("RHN_ORACLE_USER"));
            properties.setProperty("password", requiredEnv("RHN_ORACLE_PASSWORD"));
            properties.setProperty("remarksReporting", "true");
            properties.setProperty("oracle.net.CONNECT_TIMEOUT", "10000");
            properties.setProperty("oracle.jdbc.ReadTimeout", "60000");
        }
        DriverManager.setLoginTimeout(15);
        try (Connection connection = DriverManager.getConnection(url, properties)) {
            if (mode.equals("oracle")) {
                connection.setAutoCommit(false);
                try (var statement = connection.createStatement()) {
                    statement.execute("SET TRANSACTION READ ONLY");
                }
            }
            var snapshot = collect(connection, mode);
            try (var input = Files.newInputStream(Path.of(args[1], "backend/rhn-analytics/src/main/resources/semantic/outpatient-ontology.v1.yaml"))) {
                snapshot.put("semantic", new org.yaml.snakeyaml.Yaml(new org.yaml.snakeyaml.constructor.SafeConstructor(new org.yaml.snakeyaml.LoaderOptions())).load(input));
            }
            new ObjectMapper().writerWithDefaultPrettyPrinter().writeValue(Path.of(args[2]).toFile(), snapshot);
            if (mode.equals("oracle")) connection.rollback();
            System.out.println("Exported " + ((List<?>) snapshot.get("tables")).size() + " tables (" + mode + ")");
        }
    }

    static String requiredEnv(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + name);
        return value;
    }

    static Map<String, Object> collect(Connection connection, String mode) throws Exception {
        DatabaseMetaData metadata = connection.getMetaData();
        String schema = connection.getSchema();
        var tables = new TreeMap<String, Map<String, Object>>();
        var databaseNames = new HashMap<String, String>();
        String historyName = null;
        try (var rows = metadata.getTables(null, schema, "%", new String[]{"TABLE", "BASE TABLE", "VIEW"})) {
            while (rows.next()) {
                String rawName = rows.getString("TABLE_NAME"), name = upper(rawName);
                if (name.equals("FLYWAY_SCHEMA_HISTORY")) historyName = rawName;
                if (!name.startsWith("RHN_")) continue;
                databaseNames.put(name, rawName);
                tables.put(name, object("physical", name, "kind", rows.getString("TABLE_TYPE"),
                        "comment", Objects.toString(rows.getString("REMARKS"), ""),
                        "columns", new ArrayList<>(), "primaryKey", new ArrayList<>(),
                        "uniqueKeys", new ArrayList<>(), "indexes", new ArrayList<>(), "checks", new ArrayList<>()));
            }
        }
        try (var rows = metadata.getColumns(null, schema, "%", "%")) {
            while (rows.next()) {
                var table = tables.get(upper(rows.getString("TABLE_NAME")));
                if (table == null) continue;
                list(table, "columns").add(object("physical", upper(rows.getString("COLUMN_NAME")),
                        "type", upper(rows.getString("TYPE_NAME")), "size", rows.getInt("COLUMN_SIZE"),
                        "scale", rows.getObject("DECIMAL_DIGITS"), "nullable", rows.getInt("NULLABLE") != DatabaseMetaData.columnNoNulls,
                        "defaultValue", rows.getString("COLUMN_DEF"), "ordinal", rows.getInt("ORDINAL_POSITION"),
                        "comment", Objects.toString(rows.getString("REMARKS"), "")));
            }
        }
        var relations = new ArrayList<Map<String, Object>>();
        for (var entry : tables.entrySet()) {
            String name = entry.getKey(), rawName = databaseNames.get(name);
            var table = entry.getValue();
            var pk = new TreeMap<Integer, String>();
            try (var rows = metadata.getPrimaryKeys(null, schema, rawName)) {
                while (rows.next()) pk.put(rows.getInt("KEY_SEQ"), upper(rows.getString("COLUMN_NAME")));
            }
            table.put("primaryKey", new ArrayList<>(pk.values()));
            var foreignKeys = new TreeMap<String, Map<String, Object>>();
            // Oracle JDBC omits some references to unique keys; its dictionary is read below.
            if (!mode.equals("oracle")) try (var rows = metadata.getImportedKeys(null, schema, rawName)) {
                while (rows.next()) {
                    String key = upper(rows.getString("FK_NAME"));
                    var relation = foreignKeys.computeIfAbsent(key, ignored -> object("id", key, "sourceTable", name,
                            "sourceColumns", new ArrayList<>(), "targetColumns", new ArrayList<>(), "kind", "foreign-key"));
                    relation.put("targetTable", upper(rows.getString("PKTABLE_NAME")));
                    relation.put("deleteRule", switch (rows.getInt("DELETE_RULE")) {
                        case DatabaseMetaData.importedKeyCascade -> "CASCADE";
                        case DatabaseMetaData.importedKeySetNull -> "SET NULL";
                        default -> "NO ACTION";
                    });
                    list(relation, "sourceColumns").add(object("position", rows.getInt("KEY_SEQ"), "name", upper(rows.getString("FKCOLUMN_NAME"))));
                    list(relation, "targetColumns").add(object("position", rows.getInt("KEY_SEQ"), "name", upper(rows.getString("PKCOLUMN_NAME"))));
                }
            }
            for (var relation : foreignKeys.values()) {
                for (String side : List.of("sourceColumns", "targetColumns")) {
                    var columns = list(relation, side);
                    columns.sort(Comparator.comparingInt(c -> ((Number)c.get("position")).intValue()));
                    relation.put(side, columns.stream().map(c -> c.get("name")).toList());
                }
                relations.add(relation);
            }
            var indexes = new TreeMap<String, Map<String, Object>>();
            try (var rows = metadata.getIndexInfo(null, schema, rawName, false, true)) {
                while (rows.next()) {
                    String indexName = upper(rows.getString("INDEX_NAME"));
                    if (indexName.isBlank() || rows.getShort("TYPE") == DatabaseMetaData.tableIndexStatistic) continue;
                    var index = indexes.computeIfAbsent(indexName, ignored -> object("name", indexName, "columns", new ArrayList<>()));
                    index.put("unique", !rows.getBoolean("NON_UNIQUE"));
                    list(index, "columns").add(object("position", rows.getInt("ORDINAL_POSITION"),
                            "name", upper(rows.getString("COLUMN_NAME")), "direction", rows.getString("ASC_OR_DESC")));
                }
            }
            for (var index : indexes.values()) list(index, "columns").sort(Comparator.comparingInt(c -> ((Number)c.get("position")).intValue()));
            table.put("indexes", new ArrayList<>(indexes.values()));
            list(table, "columns").sort(Comparator.comparingInt(c -> ((Number)c.get("ordinal")).intValue()));
        }
        if (mode.equals("oracle")) {
            var foreignKeys = new LinkedHashMap<String, Map<String, Object>>();
            String sql = """
                    select c.constraint_name,c.table_name,cc.column_name,p.table_name,pc.column_name,
                           c.delete_rule,c.status,c.validated
                    from user_constraints c
                    join user_cons_columns cc on cc.constraint_name=c.constraint_name
                    join all_constraints p on p.owner=c.r_owner and p.constraint_name=c.r_constraint_name
                    join all_cons_columns pc on pc.owner=p.owner and pc.constraint_name=p.constraint_name and pc.position=cc.position
                    where c.constraint_type='R' and substr(c.table_name,1,4)='RHN_'
                    order by c.table_name,c.constraint_name,cc.position
                    """;
            try (var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) {
                while (rows.next()) {
                    String key = upper(rows.getString(1)), table = upper(rows.getString(2));
                    if (!tables.containsKey(table)) continue;
                    var relation = foreignKeys.computeIfAbsent(key, ignored -> object("id", key,
                            "sourceTable", table, "sourceColumns", new ArrayList<String>(),
                            "targetColumns", new ArrayList<String>(), "kind", "foreign-key"));
                    ((List<String>)relation.get("sourceColumns")).add(upper(rows.getString(3)));
                    relation.put("targetTable", upper(rows.getString(4)));
                    ((List<String>)relation.get("targetColumns")).add(upper(rows.getString(5)));
                    relation.put("deleteRule", rows.getString(6));
                    relation.put("status", rows.getString(7));
                    relation.put("validated", rows.getString(8));
                }
            }
            relations.addAll(foreignKeys.values());
        }
        String uniqueSql = mode.equals("oracle")
                ? "select c.table_name, c.constraint_name, cc.column_name, cc.position from user_constraints c join user_cons_columns cc on cc.constraint_name=c.constraint_name where c.constraint_type='U' order by c.table_name,c.constraint_name,cc.position"
                : "select c.table_name, c.constraint_name, cc.column_name, cc.ordinal_position from information_schema.table_constraints c join information_schema.key_column_usage cc on cc.constraint_schema=c.constraint_schema and cc.constraint_name=c.constraint_name where c.table_schema=current_schema() and c.constraint_type='UNIQUE' order by c.table_name,c.constraint_name,cc.ordinal_position";
        var uniqueKeys = new LinkedHashMap<String, Map<String, Object>>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(uniqueSql)) {
            while (rows.next()) {
                String table = upper(rows.getString(1)), key = upper(rows.getString(2));
                if (!tables.containsKey(table)) continue;
                var unique = uniqueKeys.computeIfAbsent(table + "." + key, ignored -> {
                    var result = object("name", key, "columns", new ArrayList<String>());
                    list(tables.get(table), "uniqueKeys").add(result);
                    return result;
                });
                ((List<String>)unique.get("columns")).add(upper(rows.getString(3)));
            }
        }
        String checksSql = mode.equals("oracle")
                ? "select table_name, constraint_name, search_condition_vc from user_constraints where constraint_type='C' order by table_name,constraint_name"
                : "select t.table_name,t.constraint_name,c.check_clause from information_schema.table_constraints t join information_schema.check_constraints c on t.constraint_schema=c.constraint_schema and t.constraint_name=c.constraint_name where t.table_schema=current_schema() and t.constraint_type='CHECK' order by t.table_name,t.constraint_name";
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(checksSql)) {
            while (rows.next()) {
                var table = tables.get(upper(rows.getString(1)));
                if (table != null) list(table, "checks").add(object("name", upper(rows.getString(2)), "expression", rows.getString(3)));
            }
        }
        var migrations = new ArrayList<Map<String, Object>>();
        if (historyName != null && historyName.matches("[A-Za-z_]+")) {
            // Flyway uses quoted lowercase names on both supported databases.
            try (var statement = connection.createStatement(); var rows = statement.executeQuery(
                    "select \"version\",\"script\",\"checksum\",\"success\" from \"" + historyName + "\" order by \"installed_rank\"")) {
                while (rows.next()) migrations.add(object("version", rows.getString(1), "script", rows.getString(2),
                        "checksum", rows.getObject(3), "success", rows.getBoolean(4)));
            }
        }
        if (mode.equals("oracle")) {
            try (var statement = connection.createStatement(); var rows = statement.executeQuery(
                    "select count(*) from user_constraints where constraint_type='R' and substr(table_name,1,4)='RHN_'")) {
                rows.next();
                if (rows.getInt(1) != relations.size()) throw new IllegalStateException("Oracle foreign-key export does not cover the constraint catalog");
            }
        }
        return object("formatVersion", 2, "source", mode, "profile", mode.equals("expected") ? "test" : "oracle-local",
                "database", metadata.getDatabaseProductName(), "capturedAt", Instant.now().toString(),
                "tables", new ArrayList<>(tables.values()), "relations", relations, "migrations", migrations);
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> list(Map<String, Object> map, String key) {
        return (List<Map<String, Object>>)map.get(key);
    }
}
