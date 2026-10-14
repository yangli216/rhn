import org.flywaydb.core.Flyway;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Squashes the published Flyway migrations into a new fresh-schema baseline.
 *
 * <ul>
 *   <li>{@code migration/} and {@code oracle/}: the current baseline and every later V migration are concatenated in
 *       version order into {@code B<version>__rhn_schema_and_metadata.sql}.</li>
 *   <li>{@code h2/}: test-only adjustments are concatenated into one file just above the baseline.</li>
 *   <li>{@code local/} and {@code oracle-local/}: development data was written against older schemas and interleaved
 *       with later migrations, so it cannot be concatenated. It is derived instead: H2 databases are built from the old
 *       migrations with and without development data, and the per-table difference (inserts, updates, deletes) is
 *       rendered with explicit column lists for both dialects.</li>
 * </ul>
 *
 * The tool then rebuilds H2 databases from the new files and fails unless schema and every row match the old
 * migrations, both with development data (test profile) and without it (fresh production schema). The Oracle files
 * are generated with the same row model but cannot be executed here.
 *
 * Usage (classpath from {@code mvn dependency:build-classpath -pl rhn-app -Dmdep.includeScope=test}):
 * {@code java -cp <classpath> scripts/schema-squash/SquashMigrations.java <old-db-dir> <new-db-dir> <baseline-version>}
 */
public class SquashMigrations {
    private static final DateTimeFormatter TZ_H2 = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSSSSSxxx");
    private static final DateTimeFormatter TZ_ORACLE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSSSSS xxx");

    public static void main(String[] args) throws Exception {
        Path oldDb = Path.of(args[0]), newDb = Path.of(args[1]);
        String version = args[2];
        String[] parts = version.split("\\.");
        String devVersion = parts[0] + "." + parts[1] + "." + (Integer.parseInt(parts[2]) + 1);
        String h2Version = parts[0] + "." + parts[1] + "." + (Integer.parseInt(parts[2]) + 2);
        String baseline = "B" + version.replace('.', '_') + "__rhn_schema_and_metadata.sql";
        String devFile = "V" + devVersion.replace('.', '_') + "__development_hospital.sql";
        String h2File = "V" + h2Version.replace('.', '_') + "__h2_compatibility.sql";

        for (String dir : List.of("migration", "oracle", "local", "oracle-local", "h2")) Files.createDirectories(newDb.resolve(dir));
        concatenate(oldDb, newDb, "migration", baseline, "RHN PostgreSQL/H2 fresh-schema baseline", version,
                "schema plus standard metadata only; runtime business rows are excluded.");
        concatenate(oldDb, newDb, "oracle", baseline, "RHN Oracle fresh-schema baseline", version,
                "schema plus standard metadata only; runtime business rows are excluded.");
        concatenate(oldDb, newDb, "h2", h2File, "RHN H2 compatibility adjustments", h2Version,
                "H2-only column type adjustments for test databases.");

        String full = build(oldDb.resolve("migration"), oldDb.resolve("local"), oldDb.resolve("h2"));
        String base = build(oldDb.resolve("migration"), oldDb.resolve("h2"));
        // Migrations stamp rows with current_timestamp; columns that differ between two builds of the same files
        // carry no migration content and are ignored when deriving and comparing rows.
        String baseAgain = build(oldDb.resolve("migration"), oldDb.resolve("h2"));
        VOLATILE.putAll(volatileColumns(base, baseAgain));
        System.out.printf("volatile timestamp columns: %d in %d tables%n",
                VOLATILE.values().stream().mapToInt(Set::size).sum(), VOLATILE.size());
        // Development scripts pin some of those timestamps; a value identical across two full builds is content.
        String fullAgain = build(oldDb.resolve("migration"), oldDb.resolve("local"), oldDb.resolve("h2"));
        Delta delta = delta(full, base, fullAgain);
        writeDevelopment(oldDb, newDb.resolve("local").resolve(devFile), "local", delta, false, devVersion);
        writeDevelopment(oldDb, newDb.resolve("oracle-local").resolve(devFile), "oracle-local", delta, true, devVersion);
        System.out.printf("development delta: %d inserts, %d updates, %d deletes across %d tables%n",
                delta.inserts.size(), delta.updates.size(), delta.deletes.size(), delta.tables().size());

        String rebuilt = build(newDb.resolve("migration"), newDb.resolve("local"), newDb.resolve("h2"));
        compare("test profile (schema + development data)", full, fullAgain, rebuilt);
        String freshOld = build(oldDb.resolve("migration"));
        String freshOldAgain = build(oldDb.resolve("migration"));
        String freshNew = build(newDb.resolve("migration"));
        compare("fresh production schema", freshOld, freshOldAgain, freshNew);
        System.out.println("SQUASH VERIFIED (H2). Oracle files are generated from the same model and need an Oracle run.");
    }

    // ---------------------------------------------------------------- concatenation

    static List<Path> migrations(Path dir) throws IOException {
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(p -> p.getFileName().toString().endsWith(".sql"))
                    .sorted(Comparator.comparing((Path p) -> versionKey(p.getFileName().toString()), VERSION_ORDER)).toList();
        }
    }

    static List<Integer> versionKey(String name) {
        String digits = name.substring(1, name.indexOf("__"));
        return Arrays.stream(digits.split("_")).map(Integer::valueOf).toList();
    }

    static final Comparator<List<Integer>> VERSION_ORDER = (a, b) -> {
        for (int i = 0; i < Math.max(a.size(), b.size()); i++) {
            int x = i < a.size() ? a.get(i) : 0, y = i < b.size() ? b.get(i) : 0;
            if (x != y) return Integer.compare(x, y);
        }
        return 0;
    };

    static void concatenate(Path oldDb, Path newDb, String dir, String output, String title, String target, String scope)
            throws Exception {
        List<Path> sources = new ArrayList<>(migrations(oldDb.resolve(dir)));
        sources.sort((a, b) -> VERSION_ORDER.compare(versionKey(a.getFileName().toString()), versionKey(b.getFileName().toString())));
        StringBuilder out = new StringBuilder(header(title, target, scope, dir, sources));
        for (Path source : sources) {
            String text = Files.readString(source);
            if (source.getFileName().toString().startsWith("B")) text = stripGeneratedHeader(text);
            out.append("\n-- =============================================================================\n-- Source: ")
                    .append(source.getFileName()).append("\n-- =============================================================================\n")
                    .append(text.stripTrailing()).append('\n');
        }
        Files.writeString(newDb.resolve(dir).resolve(output), out.toString());
    }

    static String header(String title, String target, String scope, String dir, List<Path> sources) throws Exception {
        StringBuilder out = new StringBuilder();
        out.append("-- ").append(title).append('\n')
                .append("-- GENERATED FILE. Regenerate with scripts/schema-squash/SquashMigrations.java; do not edit by hand.\n")
                .append("-- Applies only to empty schemas; existing databases keep their applied history.\n")
                .append("-- Scope: ").append(scope).append('\n')
                .append("-- Target migration version: ").append(target).append('\n')
                .append("-- Source migrations:\n");
        for (Path source : sources) {
            out.append("--   backend/src/main/resources/db/").append(dir).append('/').append(source.getFileName())
                    .append(" sha256=").append(sha256(Files.readAllBytes(source))).append('\n');
        }
        return out.toString();
    }

    static String stripGeneratedHeader(String text) {
        String[] lines = text.split("\n", -1);
        int i = 0;
        while (i < lines.length && (lines[i].startsWith("--") || lines[i].isBlank())) i++;
        return String.join("\n", Arrays.copyOfRange(lines, i, lines.length));
    }

    static String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    // ---------------------------------------------------------------- H2 databases

    static String build(Path... locations) {
        String url = "jdbc:h2:mem:squash-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1";
        String[] paths = Arrays.stream(locations).map(p -> "filesystem:" + p.toAbsolutePath()).toArray(String[]::new);
        Flyway.configure().dataSource(url, "sa", "").locations(paths).load().migrate();
        return url;
    }

    static final Map<String, Set<String>> VOLATILE = new HashMap<>();

    record Column(String name, String type) {}
    record Table(String name, List<Column> columns, List<String> key) {}
    record Row(Table table, Map<String, Object> values) {
        List<Object> key() { return table.key().stream().map(values::get).toList(); }
    }
    record Change(Table table, List<Object> key, Map<String, Object> values) {}

    static final class Delta {
        final List<Row> inserts = new ArrayList<>();
        final List<Change> updates = new ArrayList<>();
        final List<Row> deletes = new ArrayList<>();
        Set<String> tables() {
            Set<String> names = new TreeSet<>();
            inserts.forEach(r -> names.add(r.table().name()));
            updates.forEach(c -> names.add(c.table().name()));
            deletes.forEach(r -> names.add(r.table().name()));
            return names;
        }
    }

    static Map<String, Table> tables(Connection c) throws SQLException {
        Map<String, Table> result = new TreeMap<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(
                "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' "
                        + "and table_name <> 'flyway_schema_history' order by table_name")) {
            while (rs.next()) result.put(rs.getString(1), null);
        }
        for (String name : List.copyOf(result.keySet())) {
            List<Column> columns = new ArrayList<>();
            try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(
                    "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = '"
                            + name + "' order by ordinal_position")) {
                while (rs.next()) columns.add(new Column(rs.getString(1), rs.getString(2)));
            }
            List<String> key = new ArrayList<>();
            try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(
                    "select k.column_name from information_schema.table_constraints t join information_schema.key_column_usage k "
                            + "on k.constraint_schema = t.constraint_schema and k.constraint_name = t.constraint_name "
                            + "where t.table_schema = 'public' and t.table_name = '" + name + "' and t.constraint_type = 'PRIMARY KEY' "
                            + "order by k.ordinal_position")) {
                while (rs.next()) key.add(rs.getString(1));
            }
            if (key.isEmpty()) key = columns.stream().map(Column::name).toList();
            result.put(name, new Table(name, columns, key));
        }
        return result;
    }

    static Map<List<Object>, Row> rows(Connection c, Table table) throws SQLException {
        Map<List<Object>, Row> result = new LinkedHashMap<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("select * from " + table.name())) {
            while (rs.next()) {
                Map<String, Object> values = new LinkedHashMap<>();
                for (Column column : table.columns()) values.put(column.name(), normalize(rs.getObject(column.name())));
                Row row = new Row(table, values);
                result.put(row.key(), row);
            }
        }
        return result;
    }

    static boolean sameContent(Row a, Row b) {
        Set<String> skip = VOLATILE.getOrDefault(a.table().name(), Set.of());
        for (Column column : a.table().columns()) {
            if (skip.contains(column.name())) continue;
            if (!Objects.equals(a.values().get(column.name()), b.values().get(column.name()))) return false;
        }
        return true;
    }

    static Map<String, Set<String>> volatileColumns(String firstUrl, String secondUrl) throws SQLException {
        Map<String, Set<String>> result = new HashMap<>();
        try (Connection first = DriverManager.getConnection(firstUrl, "sa", "");
             Connection second = DriverManager.getConnection(secondUrl, "sa", "")) {
            for (Table table : tables(first).values()) {
                Map<List<Object>, Row> x = rows(first, table), y = rows(second, table);
                for (Row row : x.values()) {
                    Row other = y.get(row.key());
                    if (other == null) throw new IllegalStateException("Non-deterministic keys in " + table.name());
                    for (Column column : table.columns()) {
                        if (!Objects.equals(row.values().get(column.name()), other.values().get(column.name()))) {
                            if (!column.type().toUpperCase(Locale.ROOT).contains("TIMESTAMP"))
                                throw new IllegalStateException("Non-deterministic non-timestamp column " + table.name() + "." + column.name());
                            result.computeIfAbsent(table.name(), k -> new HashSet<>()).add(column.name());
                        }
                    }
                }
            }
        }
        return result;
    }

    static Object normalize(Object value) throws SQLException {
        if (value instanceof java.sql.Clob clob) return clob.getSubString(1, (int) clob.length());
        // Render dates and times as typed literals; Oracle must not depend on NLS formats.
        if (value instanceof java.sql.Date date) return date.toLocalDate();
        if (value instanceof java.sql.Timestamp timestamp) return timestamp.toLocalDateTime();
        if (value instanceof java.sql.Time time) return time.toLocalTime();
        if (value instanceof BigDecimal decimal) return decimal.stripTrailingZeros();
        if (value instanceof byte[] bytes) return HexFormat.of().formatHex(bytes);
        return value;
    }

    static Delta delta(String fullUrl, String baseUrl, String fullAgainUrl) throws SQLException {
        Delta delta = new Delta();
        try (Connection full = DriverManager.getConnection(fullUrl, "sa", "");
             Connection base = DriverManager.getConnection(baseUrl, "sa", "");
             Connection fullAgain = DriverManager.getConnection(fullAgainUrl, "sa", "")) {
            Map<String, Table> tables = tables(full);
            if (!tables.keySet().equals(tables(base).keySet())) throw new IllegalStateException("Development data changes the schema");
            for (Table table : tables.values()) {
                Map<List<Object>, Row> withData = rows(full, table), without = rows(base, table),
                        repeat = rows(fullAgain, table);
                Set<String> volatileColumns = VOLATILE.getOrDefault(table.name(), Set.of());
                for (Row row : withData.values()) {
                    Row before = without.get(row.key());
                    if (before == null) delta.inserts.add(row);
                    else {
                        Row again = repeat.get(row.key());
                        Map<String, Object> changed = new LinkedHashMap<>();
                        row.values().forEach((k, v) -> {
                            if (Objects.equals(before.values().get(k), v)) return;
                            boolean pinned = again != null && Objects.equals(again.values().get(k), v);
                            if (!volatileColumns.contains(k) || pinned) changed.put(k, v);
                        });
                        if (changed.isEmpty()) continue;
                        delta.updates.add(new Change(table, row.key(), changed));
                    }
                }
                for (Row row : without.values()) if (!withData.containsKey(row.key())) delta.deletes.add(row);
            }
            orderForForeignKeys(full, delta);
        }
        return delta;
    }

    /** Parent tables first for inserts (children first for deletes); self-references ordered parent row first. */
    static void orderForForeignKeys(Connection c, Delta delta) throws SQLException {
        Map<String, Set<String>> parents = new HashMap<>();
        Map<String, List<String[]>> selfRefs = new HashMap<>();
        // H2 recomputes information_schema views per joined row, so read each view once and join in memory.
        Map<String, String[]> constraintTable = new HashMap<>();   // constraint -> {table, type}
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(
                "select constraint_name, table_name, constraint_type from information_schema.table_constraints where table_schema = 'public'")) {
            while (rs.next()) constraintTable.put(rs.getString(1), new String[]{rs.getString(2), rs.getString(3)});
        }
        Map<String, List<String[]>> keyColumns = new HashMap<>();   // constraint -> [{column, ordinal, positionInUnique}]
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(
                "select constraint_name, column_name, ordinal_position, position_in_unique_constraint "
                        + "from information_schema.key_column_usage where constraint_schema = 'public'")) {
            while (rs.next()) keyColumns.computeIfAbsent(rs.getString(1), k -> new ArrayList<>())
                    .add(new String[]{rs.getString(2), rs.getString(3), rs.getString(4)});
        }
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(
                "select constraint_name, unique_constraint_name from information_schema.referential_constraints where constraint_schema = 'public'")) {
            while (rs.next()) {
                String[] fk = constraintTable.get(rs.getString(1)), pk = constraintTable.get(rs.getString(2));
                if (fk == null || pk == null) continue;
                String child = fk[0], parent = pk[0];
                if (!child.equals(parent)) { parents.computeIfAbsent(child, k -> new HashSet<>()).add(parent); continue; }
                for (String[] column : keyColumns.getOrDefault(rs.getString(1), List.of())) {
                    String referenced = keyColumns.getOrDefault(rs.getString(2), List.of()).stream()
                            .filter(u -> u[1].equals(column[2])).map(u -> u[0]).findFirst().orElse(null);
                    if (referenced != null) selfRefs.computeIfAbsent(child, k -> new ArrayList<>()).add(new String[]{column[0], referenced});
                }
            }
        }
        List<String> order = new ArrayList<>();
        Set<String> visiting = new HashSet<>(), done = new HashSet<>();
        Set<String> names = new TreeSet<>(delta.tables());
        for (String name : names) visit(name, parents, visiting, done, order);
        Map<String, Integer> rank = new HashMap<>();
        for (int i = 0; i < order.size(); i++) rank.put(order.get(i), i);
        Comparator<String> byRank = Comparator.comparingInt(n -> rank.getOrDefault(n, Integer.MAX_VALUE));
        List<Row> inserts = new ArrayList<>();
        delta.inserts.stream().collect(Collectors.groupingBy(r -> r.table().name(), TreeMap::new, Collectors.toList()))
                .entrySet().stream().sorted(Map.Entry.comparingByKey(byRank))
                .forEach(e -> inserts.addAll(selfOrdered(e.getValue(), selfRefs.getOrDefault(e.getKey(), List.of()))));
        delta.inserts.clear();
        delta.inserts.addAll(inserts);
        delta.deletes.sort(Comparator.comparing((Row r) -> r.table().name(), byRank.reversed()));
    }

    static void visit(String name, Map<String, Set<String>> parents, Set<String> visiting, Set<String> done, List<String> order) {
        if (done.contains(name) || !visiting.add(name)) return;
        for (String parent : new TreeSet<>(parents.getOrDefault(name, Set.of()))) visit(parent, parents, visiting, done, order);
        visiting.remove(name);
        done.add(name);
        order.add(name);
    }

    static List<Row> selfOrdered(List<Row> rows, List<String[]> refs) {
        if (refs.isEmpty()) return rows;
        Map<List<Object>, Row> pending = new LinkedHashMap<>();
        rows.forEach(r -> pending.put(r.key(), r));
        List<Row> ordered = new ArrayList<>();
        Set<Object> emitted = new HashSet<>();
        while (!pending.isEmpty()) {
            boolean progressed = false;
            for (Iterator<Row> it = pending.values().iterator(); it.hasNext(); ) {
                Row row = it.next();
                boolean ready = refs.stream().allMatch(ref -> {
                    Object parent = row.values().get(ref[0]);
                    return parent == null || emitted.contains(parent) || parent.equals(row.values().get(ref[1]))
                            || pending.values().stream().noneMatch(p -> Objects.equals(p.values().get(ref[1]), parent));
                });
                if (ready) {
                    ordered.add(row);
                    refs.forEach(ref -> emitted.add(row.values().get(ref[1])));
                    it.remove();
                    progressed = true;
                }
            }
            if (!progressed) throw new IllegalStateException("Cyclic self reference in " + rows.get(0).table().name());
        }
        return ordered;
    }

    // ---------------------------------------------------------------- rendering

    static void writeDevelopment(Path oldDb, Path output, String dir, Delta delta, boolean oracle, String version) throws Exception {
        StringBuilder out = new StringBuilder(header(oracle ? "RHN Oracle development fixture" : "RHN PostgreSQL/H2 development fixture",
                version, "development hospital sample and base data; derived from the per-table result of the source migrations.",
                dir, migrations(oldDb.resolve(dir))));
        out.append('\n');
        for (Row row : delta.inserts) {
            Table table = row.table();
            out.append("insert into ").append(table.name().toUpperCase(Locale.ROOT)).append(" (")
                    .append(table.columns().stream().map(c -> c.name().toUpperCase(Locale.ROOT)).collect(Collectors.joining(", ")))
                    .append(oracle ? ") select " : ") values (")
                    .append(table.columns().stream().map(c -> literal(row.values().get(c.name()), c.type(), oracle)).collect(Collectors.joining(", ")))
                    .append(oracle ? " from dual;\n" : ");\n");
        }
        for (Change change : delta.updates) {
            Table table = change.table();
            Map<String, String> types = table.columns().stream().collect(Collectors.toMap(Column::name, Column::type));
            out.append("update ").append(table.name().toUpperCase(Locale.ROOT)).append(" set ")
                    .append(change.values().entrySet().stream().map(e -> e.getKey().toUpperCase(Locale.ROOT) + " = "
                            + literal(e.getValue(), types.get(e.getKey()), oracle)).collect(Collectors.joining(", ")))
                    .append(" where ").append(where(table, change.key(), types, oracle)).append(";\n");
        }
        for (Row row : delta.deletes) {
            Table table = row.table();
            Map<String, String> types = table.columns().stream().collect(Collectors.toMap(Column::name, Column::type));
            out.append("delete from ").append(table.name().toUpperCase(Locale.ROOT)).append(" where ")
                    .append(where(table, row.key(), types, oracle)).append(";\n");
        }
        Files.writeString(output, out.toString(), StandardCharsets.UTF_8);
    }

    static String where(Table table, List<Object> key, Map<String, String> types, boolean oracle) {
        List<String> parts = new ArrayList<>();
        for (int i = 0; i < table.key().size(); i++) {
            String column = table.key().get(i);
            Object value = key.get(i);
            parts.add(value == null ? column.toUpperCase(Locale.ROOT) + " is null"
                    : column.toUpperCase(Locale.ROOT) + " = " + literal(value, types.get(column), oracle));
        }
        return String.join(" and ", parts);
    }

    static String literal(Object value, String type, boolean oracle) {
        if (value == null) return "null";
        String upper = type.toUpperCase(Locale.ROOT);
        if (value instanceof Boolean b) return oracle ? (b ? "1" : "0") : b.toString();
        if (value instanceof Number n) return n instanceof BigDecimal d ? d.toPlainString() : n.toString();
        if (value instanceof OffsetDateTime t) {
            return oracle ? "to_timestamp_tz('" + TZ_ORACLE.format(t) + "', 'YYYY-MM-DD HH24:MI:SS.FF TZH:TZM')"
                    : "timestamp with time zone '" + TZ_H2.format(t) + "'";
        }
        if (value instanceof java.time.LocalDateTime t) return "timestamp '" + t.toString().replace('T', ' ') + "'";
        if (value instanceof java.time.LocalDate d) return "date '" + d + "'";
        if (value instanceof java.time.LocalTime t) return oracle ? "'" + t + "'" : "time '" + t + "'";
        String text = value.toString();
        if (upper.contains("BINARY")) return oracle ? "hextoraw('" + text + "')" : "X'" + text + "'";
        String quoted = "'" + text.replace("'", "''") + "'";
        if (oracle && upper.contains("LARGE OBJECT")) return clob(text);
        return quoted;
    }

    /** Oracle string literals are limited to 4000 bytes; CLOB values are concatenated in safe chunks. */
    static String clob(String text) {
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int bytes = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            String ch = new String(Character.toChars(cp));
            int size = ch.getBytes(StandardCharsets.UTF_8).length * (cp == '\'' ? 2 : 1);
            if (bytes + size > 3000) { chunks.add(current.toString()); current.setLength(0); bytes = 0; }
            current.append(ch);
            bytes += size;
            i += Character.charCount(cp);
        }
        chunks.add(current.toString());
        return chunks.stream().map(c -> "to_clob('" + c.replace("'", "''") + "')").collect(Collectors.joining(" || "));
    }

    // ---------------------------------------------------------------- verification

    /** A value may differ only where the expected build itself is not reproducible (build-time timestamps). */
    static void compare(String label, String expectedUrl, String expectedAgainUrl, String actualUrl) throws SQLException {
        try (Connection expected = DriverManager.getConnection(expectedUrl, "sa", "");
             Connection expectedAgain = DriverManager.getConnection(expectedAgainUrl, "sa", "");
             Connection actual = DriverManager.getConnection(actualUrl, "sa", "")) {
            List<String> a = structure(expected), b = structure(actual);
            if (!a.equals(b)) {
                List<String> missing = new ArrayList<>(a); missing.removeAll(b);
                List<String> extra = new ArrayList<>(b); extra.removeAll(a);
                throw new IllegalStateException(label + ": schema differs; missing=" + head(missing) + " extra=" + head(extra));
            }
            Map<String, Table> tables = tables(expected);
            long rowCount = 0;
            for (Table table : tables.values()) {
                Map<List<Object>, Row> x = rows(expected, table), y = rows(actual, table), again = rows(expectedAgain, table);
                Set<List<Object>> diff = new LinkedHashSet<>();
                x.forEach((k, v) -> {
                    Row other = y.get(k), repeat = again.get(k);
                    if (other == null) { diff.add(k); return; }
                    for (Column column : table.columns()) {
                        Object want = v.values().get(column.name());
                        boolean reproducible = repeat != null && Objects.equals(want, repeat.values().get(column.name()));
                        if (reproducible && !Objects.equals(want, other.values().get(column.name()))) { diff.add(k); return; }
                    }
                });
                y.keySet().forEach(k -> { if (!x.containsKey(k)) diff.add(k); });
                if (!diff.isEmpty()) {
                    throw new IllegalStateException(label + ": rows differ in " + table.name() + " keys=" + head(new ArrayList<>(diff)));
                }
                rowCount += x.size();
            }
            System.out.printf("%s: identical (%d tables, %d rows, %d schema statements)%n", label, tables.size(), rowCount, a.size());
        }
    }

    static List<String> structure(Connection c) throws SQLException {
        List<String> lines = new ArrayList<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("SCRIPT NODATA NOPASSWORDS NOSETTINGS")) {
            while (rs.next()) {
                String line = rs.getString(1);
                // Row-count comments are data, compared separately per row.
                if (!line.contains("flyway_schema_history") && !line.startsWith("-- ")) lines.add(line);
            }
        }
        Collections.sort(lines);
        return lines;
    }

    static String head(List<?> values) {
        return values.stream().limit(5).map(String::valueOf).collect(Collectors.joining("; ")) + (values.size() > 5 ? " …" : "");
    }
}
