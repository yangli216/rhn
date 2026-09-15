#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const write = process.argv.includes("--write");
const mappings = JSON.parse(fs.readFileSync(
  path.join(root, "docs/foundation/rhn-physical-schema-map.json"), "utf8"
));
const byLegacy = new Map(mappings.map((table) => [table.legacy, table]));
const byPhysical = new Map(mappings.flatMap((table) =>
  [table.physical, table.previousPhysical].filter(Boolean).map((name) => [name, table])
));
const backendRoot = path.join(root, "backend");
const javaRoots = fs.readdirSync(backendRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("rhn-"))
  .map((entry) => path.join(backendRoot, entry.name, "src/main/java"))
  .filter((sourceRoot) => fs.existsSync(sourceRoot));
const testRoot = path.join(root, "backend/src/test/java");
const aliasStopWords = new Set([
  "where", "join", "left", "right", "full", "inner", "outer", "cross", "on", "set",
  "values", "group", "order", "having", "union", "offset", "fetch", "returning",
]);
const manuallyMappedSqlFiles = new Set([
  "InventoryPeriodCloseApplicationService.java",
  "InventoryReconciliationApplicationService.java",
]);
const discoveredColumnAliases = new Map();

function filesBelow(dir, suffix) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(resolved, suffix) : entry.name.endsWith(suffix) ? [resolved] : [];
  });
}

function camelToSnake(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function matchingBrace(source, opening) {
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return index;
  }
  throw new Error(`Unmatched class brace at ${opening}`);
}

function depthAt(source, target) {
  let depth = 0;
  for (let index = 0; index < target; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
  }
  return depth;
}

function annotationArgument(annotation, argument) {
  return annotation?.match(new RegExp(`\\b${argument}\\s*=\\s*"([^"]+)"`))?.[1];
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function columnSources(table, column) {
  return [...new Set([
    column.logical,
    column.previousPhysical,
    ...(discoveredColumnAliases.get(`${table.legacy}.${column.logical}`) ?? []),
  ].filter(Boolean))];
}

function collectEntityColumnAliases() {
  for (const file of javaRoots.flatMap((sourceRoot) => filesBelow(sourceRoot, ".java"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const entity of source.matchAll(/@Entity\b/g)) {
      const classMatch = /\bclass\s+[A-Za-z][A-Za-z0-9_]*[^\{]*\{/.exec(source.slice(entity.index));
      if (!classMatch) continue;
      const opening = entity.index + classMatch.index + classMatch[0].lastIndexOf("{");
      const closing = matchingBrace(source, opening);
      const segment = source.slice(entity.index, closing + 1);
      const tableAnnotation = segment.slice(0, opening - entity.index).match(/@Table\([^\n]*\)/)?.[0];
      const primary = byPhysical.get(annotationArgument(tableAnnotation, "name")?.toUpperCase());
      if (!primary) continue;
      const body = segment.slice(segment.indexOf("{") + 1, -1);
      const fieldPattern = /((?:[ \t]*@[A-Za-z][A-Za-z0-9_.]*(?:\([^;\n]*\))?[ \t]*(?:\r?\n[ \t]*)?)*)(?:private|protected)\s+(?!static\b)(?:final\s+)?[A-Za-z0-9_$.<>, ?\[\]]+\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:=[^;{}]*)?;/g;
      for (const match of body.matchAll(fieldPattern)) {
        if (depthAt(body, match.index) !== 0 || match[1].includes("@Transient")) continue;
        const columnAnnotation = match[1].match(/@Column(?:\([^)]*\))?/)?.[0];
        const physicalColumn = annotationArgument(columnAnnotation, "name");
        if (!physicalColumn) continue;
        const declaredTable = annotationArgument(columnAnnotation, "table");
        const table = declaredTable ? byPhysical.get(declaredTable.toUpperCase()) : primary;
        const column = table?.columns.find((candidate) => candidate.logical === camelToSnake(match[2]));
        if (!column || physicalColumn === column.physical) continue;
        const key = `${table.legacy}.${column.logical}`;
        const aliases = discoveredColumnAliases.get(key) ?? new Set();
        aliases.add(physicalColumn);
        discoveredColumnAliases.set(key, aliases);
      }
    }
  }
}

function sqlLiterals(source) {
  const literals = [];
  for (const match of source.matchAll(/"""([\s\S]*?)"""/g)) {
    literals.push(match[1]);
  }
  for (const match of source.matchAll(/"([^"\n]*)"/g)) {
    literals.push(match[1]);
  }
  return literals;
}

function tableAliases(sql) {
  const aliases = new Map();
  const tables = new Set();
  const pattern = /\b(?:from|join|update|into)\s+(RHN_[A-Z0-9_]+)\b(?:\s+(?:as\s+)?([a-z][a-z0-9_]*))?/gi;
  for (const match of sql.matchAll(pattern)) {
    const table = byPhysical.get(match[1].toUpperCase());
    if (!table) continue;
    tables.add(table);
    let alias = match[2]?.toLowerCase();
    if (!alias || aliasStopWords.has(alias)) alias = match[1].toLowerCase();
    aliases.set(alias, table);
  }
  return { aliases, tables };
}

function stableFileAliases(literals) {
  const values = new Map();
  const ambiguous = new Set();
  for (const sql of literals) {
    for (const [alias, table] of tableAliases(sql).aliases) {
      if (values.has(alias) && values.get(alias) !== table) ambiguous.add(alias);
      else values.set(alias, table);
    }
  }
  for (const alias of ambiguous) values.delete(alias);
  return values;
}

function splitExpressions(value) {
  const expressions = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && value[index + 1] === "'") {
      current += "''";
      index += 1;
      continue;
    }
    if (char === "'") quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") {
      expressions.push(current);
      current = "";
    } else current += char;
  }
  expressions.push(current);
  return expressions;
}

function preserveSelectLabels(sql, aliases, tables) {
  return sql.replace(/\bselect\s+([\s\S]*?)\s+from\b/gi, (selection, body) => {
    const expressions = splitExpressions(body).map((expression) => {
      if (/\bas\s+[a-z][a-z0-9_]*\s*$/i.test(expression)) return expression;
      const match = expression.match(/^(\s*(?:distinct\s+)?)(?:([a-z][a-z0-9_]*)\.)?([a-z][a-z0-9_]*)(\s*)$/i);
      if (!match) return expression;
      const [, prefix, alias, logicalColumn, suffix] = match;
      let table;
      if (alias) table = aliases.get(alias.toLowerCase());
      else {
        const owners = [...tables].filter((candidate) => candidate.columns.some((column) => column.logical === logicalColumn));
        if (owners.length === 1) table = owners[0];
      }
      const column = table?.columns.find((candidate) => candidate.logical === logicalColumn);
      return column && column.physical !== logicalColumn.toUpperCase()
        ? `${prefix}${alias ? `${alias}.` : ""}${logicalColumn} as ${logicalColumn}${suffix}`
        : expression;
    });
    return `select ${expressions.join(",")} from`;
  });
}

function protect(sql) {
  const values = [];
  const protectedSql = sql.replace(/'(?:''|[^'])*'|\bas\s+[a-z][a-z0-9_]*|:[a-z][a-z0-9_]*/gi, (value) => {
    values.push(value);
    return `__RHN_PROTECTED_${values.length - 1}__`;
  });
  return { protectedSql, restore: (value) => value.replace(/__RHN_PROTECTED_(\d+)__/g, (_, index) => values[Number(index)]) };
}

function isSqlStatement(value) {
  return /\b(?:select|insert\s+into|update|delete\s+from)\b/i.test(value);
}

function transformSql(sql, fileAliases) {
  let transformed = sql;
  if (isSqlStatement(transformed)) {
    for (const table of byLegacy.values()) {
      for (const source of [table.legacy, table.previousPhysical, table.logical].filter(Boolean)) {
        transformed = transformed.replace(new RegExp(`\\b${regexEscape(source)}\\b`, "g"), table.physical);
      }
    }
  } else if (![...fileAliases.keys()].some((alias) => transformed.includes(`${alias}.`))) return transformed;
  const context = tableAliases(transformed);
  const aliases = new Map([...fileAliases, ...context.aliases]);
  transformed = preserveSelectLabels(transformed, aliases, context.tables);

  for (const [alias, table] of aliases) {
      for (const column of table.columns) {
        for (const source of columnSources(table, column)) {
        transformed = transformed.replace(
          new RegExp(`\\b${regexEscape(alias)}\\.${regexEscape(source)}\\b`, "gi"),
          (value) => `${value.slice(0, value.indexOf(".") + 1)}${column.physical}`
        );
        }
      }
  }

  if (context.tables.size > 0) {
    const candidates = new Map();
    for (const table of context.tables) {
      for (const column of table.columns) {
        for (const source of columnSources(table, column)) {
          const values = candidates.get(source) ?? new Set();
          values.add(column.physical);
          candidates.set(source, values);
        }
      }
    }
    const guarded = protect(transformed);
    transformed = guarded.protectedSql;
    for (const [logicalColumn, physicalColumns] of candidates) {
      if (physicalColumns.size !== 1) continue;
      const physicalColumn = [...physicalColumns][0];
      transformed = transformed.replace(
        new RegExp(`(?<![.:A-Za-z0-9_])${logicalColumn}(?![A-Za-z0-9_])`, "gi"),
        physicalColumn
      );
    }
    transformed = guarded.restore(transformed);
  }
  return transformed;
}

const directSqlFiles = [...javaRoots, testRoot].flatMap((sourceRoot) => filesBelow(sourceRoot, ".java")).filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return !manuallyMappedSqlFiles.has(path.basename(file))
    && /JdbcTemplate|NamedParameterJdbcTemplate|nativeQuery\s*=\s*true|\b(?:select|insert\s+into|update|delete\s+from)\b/i.test(source);
});

collectEntityColumnAliases();

let changedFiles = 0;
const changedPaths = [];
for (const file of directSqlFiles) {
  const source = fs.readFileSync(file, "utf8");
  const fileAliases = stableFileAliases(sqlLiterals(source));
  let transformed = source.replace(/"""([\s\S]*?)"""/g, (literal, sql) =>
    `"""${transformSql(sql, fileAliases)}"""`
  );
  transformed = transformed.replace(/"([^"\n]*)"/g,
    (literal, sql) => `"${transformSql(sql, fileAliases)}"`);
  if (transformed !== source) {
    changedFiles += 1;
    changedPaths.push(path.relative(root, file));
    if (write) fs.writeFileSync(file, transformed, "utf8");
  }
}

console.log(`${write ? "Updated" : "Would update"} native SQL in ${changedFiles} of ${directSqlFiles.length} files.`);
if (!write && changedPaths.length > 0) console.log(changedPaths.join("\n"));
