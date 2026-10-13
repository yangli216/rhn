package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData;
import com.rhn.platform.maintenance.api.MaintenanceModels.Issue;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import java.sql.*;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** Shared JDBC mechanics; domains declare their owned tables, retained facts and business compensation. */
@Component
public class JdbcMaintenanceRelationalData implements MaintenanceRelationalData {
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private volatile Schema schema;
    public JdbcMaintenanceRelationalData(JdbcTemplate jdbc) { this.jdbc = jdbc; named = new NamedParameterJdbcTemplate(jdbc); }

    @Override public List<TableDefinition> schemaTables() {
        return schema().tables().values().stream().filter(table -> table.key() != null)
                .map(table -> new TableDefinition(table.name(), table.key(), "", table.label(), true)).toList();
    }
    @Override public Capture capture(Long tenant, List<TableDefinition> definitions, Map<String, Set<Long>> initial) {
        schema = null; // Capture newly migrated columns/constraints as part of the immutable plan.
        Map<String, Set<Long>> identifiers = new TreeMap<>();
        initial.forEach((key, values) -> identifiers.put(identifier(key), new TreeSet<>(values)));
        Map<String, LinkedHashMap<Long, Row>> found = new LinkedHashMap<>();
        for (var definition : definitions) {
            validate(definition);
            found.put(definition.name(), new LinkedHashMap<>());
        }
        boolean changed;
        do {
            changed = false;
            for (var definition : definitions) {
                var table = schema().tables().get(definition.name());
                for (var seed : new ArrayList<>(identifiers.entrySet())) {
                    if (!table.columns().containsKey(seed.getKey()) || seed.getKey().equals("ID_TNT")) continue;
                    for (List<Long> chunk : chunks(seed.getValue())) {
                        var rows = select(tenant, definition.name(), seed.getKey(), chunk);
                        for (Row row : rows) {
                            if (found.get(definition.name()).putIfAbsent(row.id(), row) != null) continue;
                            if (!definition.retained()) identifiers.computeIfAbsent(definition.key(), key -> new TreeSet<>()).add(row.id());
                            changed = true;
                            if (found.values().stream().mapToInt(Map::size).sum() > 20000)
                                throw badRequest("MAINTENANCE_SNAPSHOT_TOO_LARGE", "当前闭包超过单次20000条记录，请拆分测试批次");
                        }
                    }
                }
            }
        } while (changed);
        List<TableSnapshot> tables = definitions.stream().map(definition -> new TableSnapshot(definition,
                found.get(definition.name()).values().stream().sorted(Comparator.comparing(Row::id)).toList())).toList();
        Map<String, Set<Long>> stable = new TreeMap<>();
        identifiers.forEach((key, values) -> stable.put(key, Collections.unmodifiableSet(new TreeSet<>(values))));
        return new Capture(tables, stable);
    }

    @Override public List<Issue> dependencies(Long tenant, Capture capture, Set<String> modules,
                                            Set<Long> rootIds, Set<Long> organizations) {
        Map<String, TableSnapshot> included = new HashMap<>();
        capture.tables().forEach(table -> included.put(table.definition().name(), table));
        List<Issue> issues = new ArrayList<>();
        for (var table : capture.tables()) {
            validate(table.definition());
            if (!deleting(table, modules)) continue;
            for (Row row : table.rows()) {
                Long org = number(row, "ID_ORG"), encounter = number(row, "ID_ENC");
                if (org != null && !organizations.contains(org) || encounter != null && !rootIds.contains(encounter))
                    issues.add(new Issue("MAINTENANCE_CROSS_SCOPE_REFERENCE",
                            table.definition().label() + "包含其他机构或未选就诊的关联记录", table.definition().module()));
            }
            for (var foreign : schema().foreignKeys()) {
                if (!foreign.parentTable().equals(table.definition().name())) continue;
                {
                    var child = schema().tables().get(foreign.childTable());
                    if (child == null || child.key() == null || !child.columns().containsKey("ID_TNT")) {
                        if (child != null && !hasLinked(tenant, foreign, table.rows())) continue;
                        issues.add(new Issue("MAINTENANCE_DEPENDENCY_UNSUPPORTED", "存在未接入的全局关联，不能清理", table.definition().module()));
                        continue;
                    }
                    var linked = linked(tenant, foreign, table.rows());
                    var selected = included.get(child.name());
                    boolean detachable = selected != null && selected.definition().retained()
                            && foreign.pairs().stream().anyMatch(pair -> selected.definition().detachColumns().contains(pair.child())
                                    && child.columns().get(pair.child()).nullable());
                    Set<Long> childIds = selected == null || !deleting(selected, modules) && !detachable ? Set.of()
                            : selected.rows().stream().map(Row::id).collect(java.util.stream.Collectors.toSet());
                    if (linked.stream().anyMatch(row -> !childIds.contains(row.id())))
                        issues.add(new Issue("MAINTENANCE_DEPENDENT_MODULE_REQUIRED",
                                "清理" + table.definition().label() + "还需处理" + child.label(),
                                selected == null ? table.definition().module() : selected.definition().module()));
                }
            }
        }
        // Logical ID references matter even when old schemas did not declare physical foreign keys.
        for (var table : schema().tables().values()) {
            if (included.containsKey(table.name()) || !table.columns().containsKey("ID_TNT") || table.key() == null) continue;
            for (var seed : capture.identifiers().entrySet()) {
                if (table.columns().containsKey(seed.getKey())) {
                    boolean present = chunks(seed.getValue()).stream()
                            .anyMatch(chunk -> !select(tenant, table.name(), seed.getKey(), chunk).isEmpty());
                    if (present) {
                        issues.add(new Issue("MAINTENANCE_UNREGISTERED_BUSINESS_REFERENCE",
                                "存在未接入清理的关联业务：" + table.label(), "OUTPATIENT"));
                        break;
                    }
                }
            }
        }
        return issues.stream().distinct().toList();
    }

    @Override public void delete(Long tenant, Capture capture, Set<String> modules) {
        Map<String, TableSnapshot> pending = new LinkedHashMap<>();
        capture.tables().stream().filter(table -> deleting(table, modules)).forEach(table -> {
            validate(table.definition()); pending.put(table.definition().name(), table);
        });
        // Break only nullable references inside this reviewed deletion set; snapshots preserve the originals.
        for (Foreign foreign : schema().foreignKeys()) {
            var child = capture.tables().stream().filter(table -> table.definition().name().equals(foreign.childTable()))
                    .findFirst().orElse(null);
            var parent = pending.get(foreign.parentTable());
            if (child == null || parent == null) continue;
            if (!pending.containsKey(foreign.childTable()) && !child.definition().detachColumns().contains(foreign.childColumn())) continue;
            var column = schema().tables().get(foreign.childTable()).columns().get(foreign.childColumn());
            if (column == null || !column.nullable() || foreign.childColumn().equals("ID_TNT")) continue;
            Set<Long> parentIds = parent.rows().stream().map(row -> number(row, foreign.parentColumn()))
                    .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
            var childIds = child.rows().stream().filter(row -> parentIds.contains(number(row, foreign.childColumn())))
                    .map(Row::id).toList();
            for (var ids : chunks(childIds))
                named.update("update " + child.definition().name() + " set " + foreign.childColumn() + "=null where ID_TNT=:tenant and "
                        + child.definition().key() + " in (:ids)", Map.of("tenant", tenant, "ids", ids));
        }
        while (!pending.isEmpty()) {
            var leaf = pending.values().stream().filter(parent -> schema().foreignKeys().stream().noneMatch(foreign ->
                    foreign.parentTable().equals(parent.definition().name())
                            && !foreign.childTable().equals(foreign.parentTable()) && pending.containsKey(foreign.childTable())
                            && foreign.pairs().stream().filter(pair -> !pair.child().equals("ID_TNT")).noneMatch(pair ->
                                schema().tables().get(foreign.childTable()).columns().get(pair.child()).nullable())))
                    .findFirst().orElseThrow(() -> conflict("MAINTENANCE_REQUIRED_REFERENCE_CYCLE", "存在不可解除的必填业务引用环"));
            for (var ids : chunks(leaf.rows().stream().map(Row::id).toList())) {
                int removed = named.update("delete from " + leaf.definition().name() + " where ID_TNT=:tenant and "
                        + leaf.definition().key() + " in (:ids)", Map.of("tenant", tenant, "ids", ids));
                if (removed != ids.size()) throw conflict("MAINTENANCE_DELETE_COUNT_CHANGED", "清理记录数与预览不一致");
            }
            pending.remove(leaf.definition().name());
        }
    }
    @Override public void verifyDeleted(Long tenant, Capture capture, Set<String> modules) {
        for (var table : capture.tables()) {
            if (!deleting(table, modules)) continue;
            for (var chunk : chunks(table.rows().stream().map(Row::id).toList())) {
                if (!select(tenant, table.definition().name(), table.definition().key(), chunk).isEmpty())
                    throw conflict("MAINTENANCE_DELETE_VERIFY_FAILED", table.definition().label() + "清理后仍有残留");
            }
        }
    }
    private boolean deleting(TableSnapshot table, Set<String> modules) {
        return !table.definition().retained() && modules.contains(table.definition().module()) && !table.rows().isEmpty();
    }
    private List<Row> select(Long tenant, String name, String column, List<Long> ids) {
        if (ids.isEmpty()) return List.of();
        var table = schema().tables().get(identifier(name));
        if (table == null || table.key() == null || !table.columns().containsKey(identifier(column))
                || !table.columns().containsKey("ID_TNT")) throw badRequest("MAINTENANCE_TABLE_INVALID", "维护数据集结构不符合租户规则");
        return named.query("select * from " + name + " where ID_TNT=:tenant and " + column + " in (:ids)",
                Map.of("tenant", tenant, "ids", ids), (rs, index) -> row(rs, table));
    }
    private boolean hasLinked(Long tenant, Foreign foreign, List<Row> parents) {
        for (int start = 0; start < parents.size(); start += 200) {
            var query = foreignQuery(tenant, foreign, parents.subList(start, Math.min(start + 200, parents.size())));
            if (query != null && named.queryForObject("select count(*) from " + foreign.childTable() + " where "
                    + query.predicate(), query.parameters(), Long.class) > 0) return true;
        }
        return false;
    }
    private List<Row> linked(Long tenant, Foreign foreign, List<Row> parents) {
        var child = schema().tables().get(foreign.childTable());
        Map<Long, Row> result = new LinkedHashMap<>();
        for (int start = 0; start < parents.size(); start += 200) {
            var query = foreignQuery(tenant, foreign, parents.subList(start, Math.min(start + 200, parents.size())));
            if (query != null) named.query("select * from " + child.name() + " where " + query.predicate(),
                    query.parameters(), (rs, index) -> row(rs, child)).forEach(row -> result.put(row.id(), row));
        }
        return List.copyOf(result.values());
    }
    private ForeignQuery foreignQuery(Long tenant, Foreign foreign, List<Row> parents) {
        List<String> alternatives = new ArrayList<>();
        Map<String, Object> parameters = new HashMap<>();
        for (int index = 0; index < parents.size(); index++) {
            List<String> terms = new ArrayList<>();
            boolean complete = true;
            for (int component = 0; component < foreign.pairs().size(); component++) {
                Pair pair = foreign.pairs().get(component);
                Cell cell = parents.get(index).cells().get(pair.parent());
                if (cell == null || cell.value() == null) { complete = false; break; }
                String key = "k" + index + "_" + component;
                terms.add(pair.child() + "=:" + key);
                parameters.put(key, pair.parent().startsWith("ID_") ? new java.math.BigDecimal(cell.value()) : cell.value());
            }
            if (complete) alternatives.add("(" + String.join(" and ", terms) + ")");
        }
        if (alternatives.isEmpty()) return null;
        String predicate = "(" + String.join(" or ", alternatives) + ")";
        if (schema().tables().get(foreign.childTable()).columns().containsKey("ID_TNT")) {
            predicate = "ID_TNT=:tenant and " + predicate; parameters.put("tenant", tenant);
        }
        return new ForeignQuery(predicate, parameters);
    }
    private record ForeignQuery(String predicate, Map<String, Object> parameters) {}
    private Row row(ResultSet rs, Table table) throws SQLException {
        Map<String, Cell> cells = new TreeMap<>();
        for (var entry : table.columns().entrySet()) {
            String field = entry.getKey(); int type = entry.getValue().type();
            Object value = rs.getObject(field);
            String text = null;
            if (value != null) {
                if (value instanceof Clob clob) text = clob.getSubString(1, Math.toIntExact(clob.length()));
                else if (value instanceof Blob blob) text = Base64.getEncoder().encodeToString(blob.getBytes(1, Math.toIntExact(blob.length())));
                else if (type == Types.TIMESTAMP_WITH_TIMEZONE || value instanceof OffsetDateTime)
                    text = rs.getObject(field, OffsetDateTime.class).withOffsetSameInstant(ZoneOffset.UTC).toString();
                else if (value instanceof byte[] bytes) text = Base64.getEncoder().encodeToString(bytes);
                else text = value.toString();
            }
            cells.put(field, new Cell(type, text));
        }
        return new Row(rs.getLong(table.key()), cells);
    }
    private Schema schema() {
        Schema current = schema;
        if (current != null) return current;
        synchronized (this) {
            if (schema == null) schema = jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Schema>) connection -> readSchema(connection));
            return schema;
        }
    }
    private Schema readSchema(Connection connection) throws SQLException {
        var metadata = connection.getMetaData();
        String catalog = connection.getCatalog(), namespace = connection.getSchema();
        Map<String, Table> tables = new TreeMap<>();
        List<Foreign> foreignKeys = new ArrayList<>();
        try (var names = metadata.getTables(catalog, namespace, "%", new String[]{"TABLE"})) {
            while (names.next()) {
                String actual = names.getString("TABLE_NAME"), name = actual.toUpperCase(Locale.ROOT);
                if (!name.startsWith("RHN_")) continue;
                Map<String, Column> columns = new TreeMap<>();
                try (var fields = metadata.getColumns(catalog, namespace, actual, "%")) {
                    while (fields.next()) {
                        if (!actual.equalsIgnoreCase(fields.getString("TABLE_NAME"))) continue;
                        columns.put(fields.getString("COLUMN_NAME").toUpperCase(Locale.ROOT),
                                new Column(fields.getInt("DATA_TYPE"), fields.getInt("NULLABLE") != DatabaseMetaData.columnNoNulls));
                    }
                }
                List<String> primary = new ArrayList<>();
                try (var keys = metadata.getPrimaryKeys(catalog, namespace, actual)) {
                    while (keys.next()) if (!"ID_TNT".equalsIgnoreCase(keys.getString("COLUMN_NAME")))
                        primary.add(keys.getString("COLUMN_NAME").toUpperCase(Locale.ROOT));
                }
                String remarks = names.getString("REMARKS");
                String label = remarks == null || remarks.isBlank() ? name : remarks.split("；", 2)[0];
                tables.put(name, new Table(name, primary.size() == 1 ? primary.getFirst() : null, label, columns));
                try (var keys = metadata.getImportedKeys(catalog, namespace, actual)) {
                    Map<String, List<Pair>> pairs = new LinkedHashMap<>();
                    Map<String, String> parents = new HashMap<>();
                    while (keys.next()) {
                        String childColumn = keys.getString("FKCOLUMN_NAME").toUpperCase(Locale.ROOT);
                        String parentTable = keys.getString("PKTABLE_NAME").toUpperCase(Locale.ROOT);
                        String group = keys.getString("FK_NAME");
                        pairs.computeIfAbsent(group, key -> new ArrayList<>()).add(new Pair(childColumn,
                                keys.getString("PKCOLUMN_NAME").toUpperCase(Locale.ROOT)));
                        parents.put(group, parentTable);
                    }
                    for (var group : pairs.entrySet()) {
                        for (var pair : group.getValue()) {
                            if (!pair.child().equals("ID_TNT")) foreignKeys.add(new Foreign(name, pair.child(),
                                    parents.get(group.getKey()), pair.parent(), List.copyOf(group.getValue())));
                        }
                    }
                }
            }
        }
        return new Schema(tables, foreignKeys.stream().distinct().toList());
    }
    private void validate(TableDefinition definition) {
        var table = schema().tables().get(identifier(definition.name()));
        if (table == null || !Objects.equals(table.key(), identifier(definition.key())) || !table.columns().containsKey("ID_TNT"))
            throw badRequest("MAINTENANCE_TABLE_INVALID", "维护数据集结构已变化");
    }
    private String identifier(String value) {
        if (value == null || !value.matches("[A-Z][A-Z0-9_]*")) throw badRequest("MAINTENANCE_IDENTIFIER_INVALID", "维护字段不在受控标识集合内");
        return value;
    }
    private Long number(Row row, String column) {
        Cell cell = row.cells().get(column);
        if (cell == null || cell.value() == null) return null;
        try { return new java.math.BigDecimal(cell.value()).longValueExact(); }
        catch (NumberFormatException | ArithmeticException error) { return null; }
    }
    private List<List<Long>> chunks(Collection<Long> values) {
        List<Long> ordered = values.stream().sorted().toList();
        List<List<Long>> result = new ArrayList<>();
        for (int index = 0; index < ordered.size(); index += 800)
            result.add(ordered.subList(index, Math.min(index + 800, ordered.size())));
        return result;
    }
    private record Column(int type, boolean nullable) {}
    private record Table(String name, String key, String label, Map<String, Column> columns) {}
    private record Pair(String child, String parent) {}
    private record Foreign(String childTable, String childColumn, String parentTable, String parentColumn, List<Pair> pairs) {}
    private record Schema(Map<String, Table> tables, List<Foreign> foreignKeys) {}
}
