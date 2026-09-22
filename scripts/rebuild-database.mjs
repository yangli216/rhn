#!/usr/bin/env node

/**
 * Build the disposable-development database package.
 *
 * The published migration directories remain the upgrade path for existing
 * schemas.  This script folds that path into a fresh-schema baseline and keeps
 * the development fixture and H2-only type adjustments as separate steps.
 * It deliberately has no command that drops or replaces a live database.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const dbRoot = path.join(root, "backend", "src", "main", "resources", "db");
const rebuildRoot = path.join(dbRoot, "rebuild");
const manifestPath = path.join(rebuildRoot, "manifest.json");
const renameManifestPath = path.join(root, "docs", "database", "column-renames-1.77.0.json");
const targetVersion = "1.77.0";

const sourceDirs = {
  postgresql: path.join(dbRoot, "migration"),
  oracle: path.join(dbRoot, "oracle"),
  development: path.join(dbRoot, "local"),
  oracleDevelopment: path.join(dbRoot, "oracle-local"),
  h2: path.join(dbRoot, "h2"),
};

const outputs = {
  postgresql: path.join(rebuildRoot, "postgresql", "B1_77_0__rhn_schema_and_standard_metadata.sql"),
  oracle: path.join(rebuildRoot, "oracle", "B1_77_0__rhn_schema_and_standard_metadata.sql"),
  development: path.join(rebuildRoot, "local", "V1_77_1__development_hospital.sql"),
  oracleDevelopment: path.join(rebuildRoot, "oracle-local", "V1_77_1__development_hospital.sql"),
  h2: path.join(rebuildRoot, "h2", "V1_77_2__h2_clob_types.sql"),
};

// These are product-level reference rows that the published standard seed
// expects before V1.47. They originated in the old development fixture, so the
// rebuild folds only these insert statements into the base and keeps the rest
// of the hospital fixture in the separate development layer.
const foundationTables = new Set([
  "RHN_BD_ALLERGEN",
  "RHN_BD_CLASS_SYSTEM",
  "RHN_BD_CLASS_CONCEPT",
  "RHN_BD_CODE_SYSTEM",
  "RHN_BD_CONCEPT",
  "RHN_BD_ITEM_ATTR_DEF",
  "RHN_BD_ITEM_TYPE",
  "RHN_BD_ITEM_TYPE_ATTR",
  "RHN_BD_MED_ROUTE_PROF",
  "RHN_BD_ORDER_FREQ",
  "RHN_BD_ORDER_FREQ_CFG",
  "RHN_BD_UNIT_CONV",
  "RHN_BD_UNIT_DEF",
  "RHN_SYS_MGMT_MOD",
]);

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const writeFiles = !checkOnly;

function fail(message) {
  console.error(`rebuild-database: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function parseVersion(file) {
  const name = path.basename(file);
  const match = name.match(/^[BV](\d+(?:_\d+)*)(?:__|\.)/i);
  if (!match) return null;
  return match[1].split("_").map(Number);
}

function compareVersions(left, right) {
  const a = [...left];
  const b = [...right];
  while (a.length < b.length) a.push(0);
  while (b.length < a.length) b.push(0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function listVersioned(directory) {
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => path.join(directory, name))
    .filter((file) => parseVersion(file))
    .sort((left, right) => {
      const byVersion = compareVersions(parseVersion(left), parseVersion(right));
      return byVersion || path.basename(left).localeCompare(path.basename(right));
    });
}

function sourceMigrations(directory) {
  const target = targetVersion.split(".").map(Number);
  const files = listVersioned(directory);
  const baseline = files.filter((file) => path.basename(file).startsWith("B"));
  if (baseline.length !== 1) fail(`${relative(directory)} must contain exactly one B migration`);
  const baselineVersion = parseVersion(baseline[0]);
  const versions = files.filter((file) => path.basename(file).startsWith("V"));
  const selected = versions.filter((file) => compareVersions(parseVersion(file), baselineVersion) > 0
    && compareVersions(parseVersion(file), target) <= 0);
  if (selected.length === 0) fail(`${relative(directory)} has no post-baseline migrations`);
  return [baseline[0], ...selected];
}

function quotedMask(sql) {
  return sql.replace(/'(?:''|[^'])*'/g, (literal) => " ".repeat(literal.length));
}

function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const character = sql[i];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && sql[i + 1] === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (character === "'") {
      if (quote && sql[i + 1] === "'") {
        i++;
        continue;
      }
      quote = !quote;
    } else if (!quote && character === "-" && sql[i + 1] === "-") {
      lineComment = true;
      i++;
    } else if (!quote && character === "/" && sql[i + 1] === "*") {
      blockComment = true;
      i++;
    } else if (character === ";" && !quote) {
      statements.push(sql.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (sql.slice(start).trim()) statements.push(sql.slice(start));
  return statements;
}

function replaceOutsideLiterals(sql, replacements) {
  if (replacements.size === 0) return sql;
  const pattern = [...replacements.keys()]
    .sort((left, right) => right.length - left.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!pattern) return sql;
  const token = new RegExp(`(?<![A-Za-z0-9_])(?:${pattern})(?![A-Za-z0-9_])`, "g");
  let result = "";
  let start = 0;
  let quote = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] !== "'") continue;
    if (quote && sql[i + 1] === "'") {
      i++;
      continue;
    }
    if (!quote) {
      result += sql.slice(start, i);
      quote = true;
    } else {
      result += sql.slice(start, i + 1);
      start = i + 1;
      quote = false;
    }
  }
  if (start < sql.length) result += sql.slice(start);
  // The preceding loop appended quoted sections to result, so apply the
  // replacement to each non-quoted segment rather than to the full statement.
  const chunks = [];
  let cursor = 0;
  quote = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] !== "'") continue;
    if (quote && sql[i + 1] === "'") {
      i++;
      continue;
    }
    if (!quote) {
      chunks.push(sql.slice(cursor, i).replace(token, (value) => replacements.get(value) ?? value));
      cursor = i;
      quote = true;
    } else {
      chunks.push(sql.slice(cursor, i + 1));
      cursor = i + 1;
      quote = false;
    }
  }
  chunks.push(sql.slice(cursor).replace(token, (value) => replacements.get(value) ?? value));
  return chunks.join("");
}

function loadRenames() {
  const manifest = JSON.parse(read(renameManifestPath));
  const byTable = new Map();
  for (const row of manifest.renames) {
    const table = row.table.toUpperCase();
    const before = row.before.toUpperCase();
    const after = row.after.toUpperCase();
    if (!byTable.has(table)) byTable.set(table, new Map());
    const tableMap = byTable.get(table);
    if (tableMap.has(before) && tableMap.get(before) !== after) {
      fail(`conflicting rename for ${table}.${before}`);
    }
    tableMap.set(before, after);
  }
  return byTable;
}

function tablesIn(statement) {
  const masked = quotedMask(statement).replace(/--[^\n]*/g, " ");
  const names = new Set();
  const patterns = [
    /\b(?:insert\s+into|update|delete\s+from|alter\s+table|truncate\s+table)\s+([A-Za-z0-9_]+)/gi,
    /\bcomment\s+on\s+column\s+([A-Za-z0-9_]+)\s*\./gi,
  ];
  for (const pattern of patterns) {
    for (const match of masked.matchAll(pattern)) names.add(match[1].toUpperCase());
  }
  return names;
}

function statementTarget(statement) {
  const masked = quotedMask(statement).replace(/--[^\n]*/g, " ");
  const match = masked.match(/\b(?:insert\s+into|update|delete\s+from|alter\s+table|truncate\s+table)\s+([A-Za-z0-9_]+)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function fixtureStatements(source, { includeFoundation }) {
  return splitStatements(source).filter((statement) => {
    const target = statementTarget(statement);
    const isFoundation = target && foundationTables.has(target);
    if (includeFoundation) return /\binsert\s+into\b/i.test(statement) && isFoundation;
    return !isFoundation;
  }).join("");
}

function rewriteWithRenames(source, byTable, label) {
  const rewritten = [];
  const ambiguous = [];
  for (const statement of splitStatements(source)) {
    const replacements = new Map();
    const tables = tablesIn(statement);
    for (const table of tables) {
      for (const [before, after] of byTable.get(table) ?? []) {
        const existing = replacements.get(before);
        if (existing && existing !== after) {
          ambiguous.push(`${label}: ${before} has multiple targets in ${[...tables].join(", ")}`);
        } else {
          replacements.set(before, after);
        }
      }
    }
    rewritten.push(replaceOutsideLiterals(statement, replacements));
  }
  if (ambiguous.length) fail(ambiguous.slice(0, 5).join("; "));
  return rewritten.join("");
}

function header(title, sources) {
  return [
    `-- ${title}`,
    "-- GENERATED FILE. Run `node scripts/rebuild-database.mjs` after changing the published migrations.",
    "-- Existing schemas continue to use db/migration or db/oracle and are never rewritten by this package.",
    "-- Scope: schema plus standard metadata only; patient, encounter, workflow and audit runtime rows are excluded.",
    `-- Target migration version: ${targetVersion}`,
    "-- Source migrations:",
    ...sources.map((file) => `--   ${relative(file)} sha256=${sha256(read(file))}`),
    "",
  ].join("\n");
}

function aggregate(directory, title, foundationFile) {
  const sources = sourceMigrations(directory);
  const foundation = fixtureStatements(read(foundationFile), { includeFoundation: true });
  const body = sources.flatMap((file, index) => {
    const parts = [[
    `-- -----------------------------------------------------------------------------`,
    `-- SOURCE ${relative(file)}`,
    `-- -----------------------------------------------------------------------------`,
    read(file).trimEnd(),
    "",
    ].join("\n")];
    if (index === 0) {
      parts.push([
        "-- -----------------------------------------------------------------------------",
        `-- SOURCE ${relative(foundationFile)} (foundation inserts only)`,
        "-- -----------------------------------------------------------------------------",
        foundation.trimEnd(),
        "",
      ].join("\n"));
    }
    return parts;
  }).join("\n");
  return { content: header(title, [...sources, foundationFile]) + body, sources: [...sources, foundationFile] };
}

function fixture(file, title, byTable) {
  const source = read(file);
  const content = [
    `-- ${title}`,
    "-- GENERATED FILE. Development-only rows; no production data is copied here.",
    "-- Existing schemas are not changed by rebuilding this package.",
    `-- SOURCE ${relative(file)} sha256=${sha256(source)}`,
    "",
    rewriteWithRenames(fixtureStatements(source, { includeFoundation: false }), byTable, relative(file)).trimEnd(),
    "",
  ].join("\n");
  return { content, sources: [file] };
}

function h2Fixture(files, byTable) {
  const content = [
    "-- RHN H2 rebuild compatibility types",
    "-- GENERATED FILE. H2-only CLOB conversions for the 1.77 fresh-schema package.",
    "-- The physical column rename is already part of B1_77_0, so source identifiers are rewritten by table.",
    "",
    ...files.map((file) => [
      `-- SOURCE ${relative(file)} sha256=${sha256(read(file))}`,
      rewriteWithRenames(read(file), byTable, relative(file)).trimEnd(),
      "",
    ].join("\n")),
  ].join("\n");
  return { content, sources: files };
}

function writeOrCheck(file, content) {
  if (writeFiles) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    return true;
  }
  if (!fs.existsSync(file) || read(file) !== content) return false;
  return true;
}

function relativeEntries() {
  return Object.entries(outputs).map(([name, file]) => ({ name, file: relative(file) }));
}

function main() {
  const renames = loadRenames();
  const pg = aggregate(sourceDirs.postgresql, "RHN PostgreSQL fresh-schema baseline", path.join(sourceDirs.development, "V1_42_3__development_hospital.sql"));
  const oracle = aggregate(sourceDirs.oracle, "RHN Oracle fresh-schema baseline", path.join(sourceDirs.oracleDevelopment, "V1_42_3__development_hospital.sql"));
  const dev = fixture(sourceDirs.development && path.join(sourceDirs.development, "V1_42_3__development_hospital.sql"),
    "RHN PostgreSQL development fixture", renames);
  const oracleDev = fixture(path.join(sourceDirs.oracleDevelopment, "V1_42_3__development_hospital.sql"),
    "RHN Oracle development fixture", renames);
  const h2Files = listVersioned(sourceDirs.h2);
  const h2 = h2Fixture(h2Files, renames);
  const built = { postgresql: pg, oracle, development: dev, oracleDevelopment: oracleDev, h2 };

  const stale = [];
  for (const [name, file] of Object.entries(outputs)) {
    if (!writeOrCheck(file, built[name].content)) stale.push(relative(file));
  }

  const sourceRecords = [];
  for (const [name, result] of Object.entries(built)) {
    for (const file of result.sources) sourceRecords.push({ role: name, path: relative(file), sha256: sha256(read(file)) });
  }
  const manifest = {
    generatedBy: "scripts/rebuild-database.mjs",
    targetVersion,
    generatedAt: "source-derived",
    policy: {
      existingDatabase: "keep-and-upgrade-with-published-history",
      freshDatabase: "new-schema-only",
      dataScope: ["schema", "standard-metadata", "development-fixture"],
      excluded: ["existing-patient-and-encounter-rows", "runtime-audit-rows", "live-database-dump"],
    },
    flywayLocations: {
      h2: ["classpath:db/rebuild/postgresql", "classpath:db/rebuild/local", "classpath:db/rebuild/h2"],
      postgresql: ["classpath:db/rebuild/postgresql", "classpath:db/rebuild/local"],
      oracle: ["classpath:db/rebuild/oracle", "classpath:db/rebuild/oracle-local"],
    },
    outputs: relativeEntries(),
    sources: sourceRecords,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!writeOrCheck(manifestPath, manifestContent)) stale.push(relative(manifestPath));

  if (stale.length) {
    if (checkOnly) fail(`generated files are stale: ${stale.join(", ")}`);
    fail(`could not write generated files: ${stale.join(", ")}`);
  }
  console.log(`${checkOnly ? "checked" : "generated"} ${Object.keys(outputs).length} rebuild scripts and ${sourceRecords.length} source references`);
}

main();
