#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const write = process.argv.includes("--write");
const logical = process.argv.includes("--logical");
const mappingPath = path.join(root, "docs/foundation/rhn-physical-schema-map.json");
const mappings = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
const tableAliases = mappings.flatMap((table) => [
  table.logical,
  table.legacy,
  table.previousPhysical,
  table.physical,
].filter(Boolean).map((name) => [name, table]));
const byName = new Map(tableAliases);
const backendRoot = path.join(root, "backend");
const javaRoots = fs.readdirSync(backendRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("rhn-"))
  .map((entry) => path.join(backendRoot, entry.name, "src/main/java"))
  .filter((sourceRoot) => fs.existsSync(sourceRoot));

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
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Unmatched class brace at ${opening}`);
}

function tableMapping(name) {
  const mapping = byName.get(name);
  if (!mapping) throw new Error(`Unknown table mapping: ${name}`);
  return mapping;
}

function columnMapping(table, name) {
  const mapping = table.columns.find((column) =>
    column.logical === name || column.previousPhysical === name || column.physical === name
  );
  if (mapping) return mapping;
  const semantic = name?.match(/^(ID|CD|SD|NA|DES|FG|DT|DA|SN|AMT|QTY|PRICE|JSON|HASH)_(.+)$/);
  if (semantic) {
    const [, prefix, tail] = semantic;
    const candidates = table.columns.filter((column) => {
      const physical = column.physical.match(new RegExp(`^${prefix}_(.+)$`));
      return physical && (physical[1].endsWith(`_${tail}`) || tail.endsWith(`_${physical[1]}`));
    });
    if (candidates.length === 1) return candidates[0];
  }
  throw new Error(`Unknown column mapping: ${table.logical}.${name}`);
}

function annotationArgument(annotation, argument) {
  return annotation.match(new RegExp(`\\b${argument}\\s*=\\s*"([^"]+)"`))?.[1];
}

function replaceArgument(annotation, argument, value) {
  const pattern = new RegExp(`(\\b${argument}\\s*=\\s*)"[^"]+"`);
  return pattern.test(annotation) ? annotation.replace(pattern, `$1"${value}"`) : annotation;
}

function upsertColumnAnnotation(annotations, physicalColumn, physicalTable) {
  const columnPattern = /@Column(?:\(([^)]*)\))?/;
  const match = annotations.match(columnPattern);
  if (!match) {
    const tablePart = physicalTable ? `, table = "${physicalTable}"` : "";
    return `${annotations}@Column(name = "${physicalColumn}"${tablePart}) `;
  }
  const args = (match[1] ?? "").trim();
  const kept = args.split(",").map((part) => part.trim()).filter(Boolean)
    .filter((part) => !/^(name|table)\s*=/.test(part));
  const rebuilt = [`name = "${physicalColumn}"`];
  if (physicalTable) rebuilt.push(`table = "${physicalTable}"`);
  rebuilt.push(...kept);
  return annotations.replace(columnPattern, `@Column(${rebuilt.join(", ")})`);
}

function depthAt(source, target) {
  let depth = 0;
  for (let index = 0; index < target; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
  }
  return depth;
}

function transformEntity(segment, primary) {
  let transformed = segment;
  transformed = transformed.replace(/@SecondaryTable\(([^\n]*)\)/g, (annotation) => {
    const logicalTable = annotationArgument(annotation, "name");
    const secondary = tableMapping(logicalTable);
    let result = replaceArgument(annotation, "name", logical ? secondary.logical : secondary.physical);
    const joinColumn = result.match(/@PrimaryKeyJoinColumn\(([^)]*)\)/)?.[0];
    if (joinColumn) {
      const logicalColumn = annotationArgument(joinColumn, "name");
      let column;
      try {
        column = columnMapping(secondary, logicalColumn);
      } catch {
        column = secondary.columns[0];
        if (!column?.physical.startsWith("ID_")) throw new Error(`Cannot infer secondary-table primary key: ${secondary.logical}`);
      }
      result = result.replace(joinColumn, replaceArgument(joinColumn, "name", logical ? column.logical : column.physical));
    }
    return result;
  });
  transformed = transformed.replace(/@Table\(([^\n]*)\)/, (annotation) =>
    replaceArgument(annotation, "name", logical ? primary.logical : primary.physical)
  );

  const classOpen = transformed.indexOf("{");
  const body = transformed.slice(classOpen + 1, -1);
  const fieldPattern = /((?:[ \t]*@[A-Za-z][A-Za-z0-9_.]*(?:\([^;\n]*\))?[ \t]*(?:\r?\n[ \t]*)?)*)(private|protected)\s+(?!static\b)(?:final\s+)?[A-Za-z0-9_$.<>, ?\[\]]+\s+([A-Za-z][A-Za-z0-9_]*)\s*(?:=[^;{}]*)?;/g;
  const replacements = [];
  for (const match of body.matchAll(fieldPattern)) {
    if (depthAt(body, match.index) !== 0 || match[1].includes("@Transient")) continue;
    const annotations = match[1];
    const field = match[3];
    const columnAnnotation = annotations.match(/@Column(?:\([^)]*\))?/)?.[0];
    const declaredTable = columnAnnotation && annotationArgument(columnAnnotation, "table");
    const table = declaredTable ? tableMapping(declaredTable) : primary;
    const declaredColumn = columnAnnotation && annotationArgument(columnAnnotation, "name");
    const inferredColumn = camelToSnake(field);
    const inferredMapping = table.columns.find((candidate) => candidate.logical === inferredColumn);
    const column = inferredMapping ?? columnMapping(table, declaredColumn);
    const outputColumn = logical ? column.logical : column.physical;
    const outputTable = declaredTable ? (logical ? table.logical : table.physical) : undefined;
    const updatedAnnotations = upsertColumnAnnotation(annotations, outputColumn, outputTable);
    replacements.push({ start: match.index, end: match.index + annotations.length, value: updatedAnnotations });
  }
  let updatedBody = body;
  for (const replacement of replacements.reverse()) {
    updatedBody = updatedBody.slice(0, replacement.start) + replacement.value + updatedBody.slice(replacement.end);
  }
  return transformed.slice(0, classOpen + 1) + updatedBody + "}";
}

let changedFiles = 0;
let changedEntities = 0;
for (const file of javaRoots.flatMap((sourceRoot) => filesBelow(sourceRoot, ".java"))) {
  const source = fs.readFileSync(file, "utf8");
  const replacements = [];
  for (const entity of source.matchAll(/@Entity\b/g)) {
    const classMatch = /\bclass\s+[A-Za-z][A-Za-z0-9_]*[^\{]*\{/.exec(source.slice(entity.index));
    if (!classMatch) throw new Error(`Entity class not found in ${file}`);
    const opening = entity.index + classMatch.index + classMatch[0].lastIndexOf("{");
    const closing = matchingBrace(source, opening);
    const segment = source.slice(entity.index, closing + 1);
    const tableAnnotation = segment.slice(0, opening - entity.index).match(/@Table\([^\n]*\)/)?.[0];
    if (!tableAnnotation) throw new Error(`@Table not found for entity in ${file}:${entity.index}`);
    const logicalTable = annotationArgument(tableAnnotation, "name");
    const primary = tableMapping(logicalTable);
    replacements.push({ start: entity.index, end: closing + 1, value: transformEntity(segment, primary) });
    changedEntities += 1;
  }
  let transformed = source;
  for (const replacement of replacements.reverse()) {
    transformed = transformed.slice(0, replacement.start) + replacement.value + transformed.slice(replacement.end);
  }
  if (transformed !== source) {
    changedFiles += 1;
    if (write) fs.writeFileSync(file, transformed, "utf8");
  }
}

const directSqlFiles = javaRoots.flatMap((sourceRoot) => filesBelow(sourceRoot, ".java")).filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return /JdbcTemplate|NamedParameterJdbcTemplate|nativeQuery\s*=\s*true/.test(source);
});

function replaceTableNamesInSql(sql) {
  let transformed = sql;
  for (const table of mappings) {
    const sources = logical
      ? [table.physical, table.previousPhysical]
      : [table.legacy, table.previousPhysical, table.logical];
    const target = logical ? table.legacy : table.physical;
    for (const source of sources.filter(Boolean)) {
      transformed = transformed.replace(new RegExp(`\\b${source}\\b`, "g"), target);
    }
  }
  return transformed;
}

let changedDirectSqlFiles = 0;
for (const file of directSqlFiles) {
  const source = fs.readFileSync(file, "utf8");
  let transformed = source.replace(/"""([\s\S]*?)"""/g, (literal, sql) =>
    `"""${replaceTableNamesInSql(sql)}"""`
  );
  transformed = transformed.replace(/"([^"\n]*(?:select|insert\s+into|update|delete\s+from)[^"\n]*)"/gi,
    (literal, sql) => `"${replaceTableNamesInSql(sql)}"`);
  if (transformed !== source) {
    changedDirectSqlFiles += 1;
    if (write) fs.writeFileSync(file, transformed, "utf8");
  }
}

console.log(`${write ? "Updated" : "Would update"} ${changedEntities} entities in ${changedFiles} files and native SQL in ${changedDirectSqlFiles} of ${directSqlFiles.length} files to ${logical ? "logical" : "physical"} identifiers.`);
