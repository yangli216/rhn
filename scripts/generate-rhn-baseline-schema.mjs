#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const archiveDir = path.join(root, "backend/src/main/resources/db/archive_v1_v131");
const genericDir = path.join(archiveDir, "migration");
const oracleDir = path.join(archiveDir, "oracle");
const targetMigrationDir = path.join(root, "backend/src/main/resources/db/migration");
const targetOracleDir = path.join(root, "backend/src/main/resources/db/oracle");
const mappingPath = path.join(root, "docs/foundation/rhn-physical-schema-map.json");
const mappings = JSON.parse(fs.readFileSync(mappingPath, "utf8"));

const tableByLegacy = new Map(mappings.map((t) => [t.legacy.toLowerCase(), t]));
const tableByPhysical = new Map(mappings.map((t) => [t.physical.toUpperCase(), t]));

function sqlFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => /^V\d+.*\.sql$/.test(name) && !name.includes("baseline") && !name.includes("rhn_physical_schema"))
    .sort((a, b) => {
      const numA = parseFloat(a.match(/^V(\d+(?:_\d+)*)/)[1].replace(/_/g, "."));
      const numB = parseFloat(b.match(/^V(\d+(?:_\d+)*)/)[1].replace(/_/g, "."));
      return numA - numB;
    })
    .map((name) => ({ name, content: fs.readFileSync(path.join(dir, name), "utf8") }));
}

function splitDefinitions(body) {
  const definitions = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];
    if (char === "'" && quoted && next === "'") {
      current += "''";
      index += 1;
      continue;
    }
    if (char === "'") quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") {
      definitions.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) definitions.push(current.trim());
  return definitions;
}

function identifiers(value) {
  return value.split(",").map((item) => item.trim().replace(/^"|"$/g, "").toLowerCase());
}

function parseDdl(files, isOracle = false) {
  const tables = new Map();

  for (const { name, content } of files) {
    // 1. Create table
    const createPattern = /create\s+table\s+([a-z][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*(?:;|\/)/gi;
    for (const match of content.matchAll(createPattern)) {
      const table = match[1].toLowerCase();
      const body = match[2];
      const tMeta = tables.get(table) ?? {
        columns: new Map(),
        uks: [],
        fks: [],
        cks: [],
        indexes: [],
      };

      for (const def of splitDefinitions(body)) {
        const trimmed = def.trim();
        const pkMatch = trimmed.match(/^(?:constraint\s+([a-z0-9_]+)\s+)?primary\s+key\s*\(([^)]+)\)/i);
        if (pkMatch) {
          tMeta.pkn = (pkMatch[1] || "").toLowerCase();
          tMeta.pk = identifiers(pkMatch[2]);
          continue;
        }
        const ukMatch = trimmed.match(/^constraint\s+([a-z0-9_]+)\s+unique\s*\(([^)]+)\)/i);
        if (ukMatch) {
          tMeta.uks.push({ name: ukMatch[1].toLowerCase(), cols: identifiers(ukMatch[2]) });
          continue;
        }
        const fkMatch = trimmed.match(/^(?:constraint\s+([a-z0-9_]+)\s+)?foreign\s+key\s*\(([^)]+)\)\s+references\s+([a-z0-9_]+)\s*\(([^)]+)\)/i);
        if (fkMatch) {
          tMeta.fks.push({
            name: (fkMatch[1] || "").toLowerCase(),
            cols: identifiers(fkMatch[2]),
            refTable: fkMatch[3].toLowerCase(),
            refCols: identifiers(fkMatch[4]),
          });
          continue;
        }
        const ckMatch = trimmed.match(/^constraint\s+([a-z0-9_]+)\s+check\s*\(([\s\S]+)\)/i);
        if (ckMatch) {
          tMeta.cks.push({ name: ckMatch[1].toLowerCase(), expr: ckMatch[2].trim() });
          continue;
        }

        const colMatch = trimmed.match(/^([a-z][a-z0-9_]*)\s+([\s\S]+)$/i);
        if (colMatch && !/^(constraint|primary|foreign|check|unique)\b/i.test(colMatch[1])) {
          const colName = colMatch[1].toLowerCase();
          let colDef = colMatch[2].trim();
          if (/\bprimary\s+key\b/i.test(colDef)) {
            tMeta.pk = [colName];
            colDef = colDef.replace(/\s+primary\s+key/i, "");
          }
          tMeta.columns.set(colName, colDef);
        }
      }
      tables.set(table, tMeta);
    }

    // 2. Alter table add column
    const alterAddColPattern = /alter\s+table\s+([a-z][a-z0-9_]*)\s+add\s+([\s\S]+?)(?:;|\/)/gi;
    for (const match of content.matchAll(alterAddColPattern)) {
      const table = match[1].toLowerCase();
      let body = match[2].trim();
      if (/^constraint\b/i.test(body)) continue;
      const tMeta = tables.get(table);
      if (!tMeta) continue;

      if (body.startsWith("(") && body.endsWith(")")) {
        body = body.slice(1, -1).trim();
      } else if (/^column\s+/i.test(body)) {
        body = body.replace(/^column\s+/i, "").trim();
      }

      for (const singleDef of splitDefinitions(body)) {
        const trimmed = singleDef.trim();
        if (/^(constraint|foreign|primary|unique|check)\b/i.test(trimmed)) continue;
        const singleMatch = trimmed.match(/^([a-z][a-z0-9_]*)\s+([\s\S]+)$/i);
        if (singleMatch) {
          tMeta.columns.set(singleMatch[1].toLowerCase(), singleMatch[2].trim());
        }
      }
    }

    // 2.5 Alter table alter column (PostgreSQL / H2)
    const alterColumnPattern = /alter\s+table\s+([a-z][a-z0-9_]*)\s+alter\s+column\s+([a-z][a-z0-9_]*)\s+([\s\S]+?)(?:;|\/)/gi;
    for (const match of content.matchAll(alterColumnPattern)) {
      const table = match[1].toLowerCase();
      const col = match[2].toLowerCase();
      const op = match[3].trim();
      const tMeta = tables.get(table);
      if (!tMeta || !tMeta.columns.has(col)) continue;
      let def = tMeta.columns.get(col);
      if (/drop\s+not\s+null/i.test(op)) {
        def = def.replace(/\bnot\s+null\b/gi, "").trim();
      } else if (/set\s+not\s+null/i.test(op)) {
        if (!/\bnot\s+null\b/i.test(def)) {
          def = `${def} not null`;
        }
      } else if (/^type\s+/i.test(op)) {
        const newType = op.replace(/^type\s+/i, "").trim();
        def = def.replace(/^[a-z0-9_]+(?:\([^)]+\))?/i, newType);
      }
      tMeta.columns.set(col, def.replace(/\s+/g, " ").trim());
    }

    // 2.6 Alter table modify (Oracle)
    const alterModifyPattern = /alter\s+table\s+([a-z][a-z0-9_]*)\s+modify\s*(\([\s\S]+?\)|\b[a-z][a-z0-9_]*\s+[^;]+?)(?:;|\/)/gi;
    for (const match of content.matchAll(alterModifyPattern)) {
      const table = match[1].toLowerCase();
      let raw = match[2].trim();
      if (raw.startsWith("(") && raw.endsWith(")")) {
        raw = raw.slice(1, -1).trim();
      }
      const tMeta = tables.get(table);
      if (!tMeta) continue;
      for (const item of splitDefinitions(raw)) {
        const itemTrim = item.trim();
        const modMatch = itemTrim.match(/^([a-z][a-z0-9_]*)\s+([\s\S]+)$/i);
        if (modMatch) {
          const col = modMatch[1].toLowerCase();
          const spec = modMatch[2].trim();
          if (!tMeta.columns.has(col)) continue;
          let def = tMeta.columns.get(col);
          if (spec.toLowerCase() === "null") {
            def = def.replace(/\bnot\s+null\b/gi, "").trim();
          } else if (spec.toLowerCase() === "not null") {
            if (!/\bnot\s+null\b/i.test(def)) {
              def = `${def} not null`;
            }
          } else {
            if (/\bnot\s+null\b/i.test(spec)) {
              if (!/\bnot\s+null\b/i.test(def)) def = `${def} not null`;
            } else if (/\bnull\b/i.test(spec)) {
              def = def.replace(/\bnot\s+null\b/gi, "").trim();
            }
            const typeMatch = spec.match(/^([a-z0-9_]+(?:\([^)]+\))?)/i);
            if (typeMatch && !/^(null|not)$/i.test(typeMatch[1])) {
              def = def.replace(/^[a-z0-9_]+(?:\([^)]+\))?/i, typeMatch[1]);
            }
          }
          tMeta.columns.set(col, def.replace(/\s+/g, " ").trim());
        }
      }
    }

    // 3. Alter table add constraint
    const alterAddConstraintPattern = /alter\s+table\s+([a-z][a-z0-9_]*)\s+add\s+constraint\s+([a-z0-9_]+)\s+([\s\S]+?)(?:;|\/)/gi;
    for (const match of content.matchAll(alterAddConstraintPattern)) {
      const table = match[1].toLowerCase();
      const cName = match[2].toLowerCase();
      const rest = match[3].trim();
      const tMeta = tables.get(table);
      if (!tMeta) continue;

      const ukMatch = rest.match(/^unique\s*\(([^)]+)\)/i);
      if (ukMatch) {
        tMeta.uks.push({ name: cName, cols: identifiers(ukMatch[1]) });
        continue;
      }
      const fkMatch = rest.match(/^foreign\s+key\s*\(([^)]+)\)\s+references\s+([a-z0-9_]+)\s*\(([^)]+)\)/i);
      if (fkMatch) {
        tMeta.fks.push({
          name: cName,
          cols: identifiers(fkMatch[1]),
          refTable: fkMatch[2].toLowerCase(),
          refCols: identifiers(fkMatch[3]),
        });
        continue;
      }
      const ckMatch = rest.match(/^check\s*\(([\s\S]+)\)/i);
      if (ckMatch) {
        tMeta.cks.push({ name: cName, expr: ckMatch[1].trim() });
        continue;
      }
    }

    // 4. Alter table drop constraint
    const alterDropConstraintPattern = /alter\s+table\s+([a-z][a-z0-9_]*)\s+drop\s+constraint\s+([a-z0-9_]+)\s*(?:;|\/)/gi;
    for (const match of content.matchAll(alterDropConstraintPattern)) {
      const table = match[1].toLowerCase();
      const cName = match[2].toLowerCase();
      const tMeta = tables.get(table);
      if (tMeta) {
        tMeta.uks = tMeta.uks.filter((c) => c.name !== cName);
        tMeta.fks = tMeta.fks.filter((c) => c.name !== cName);
        tMeta.cks = tMeta.cks.filter((c) => c.name !== cName);
      }
    }

    // 5. Create index
    const indexPattern = /create\s+(unique\s+)?index\s+([a-z0-9_]+)\s+on\s+([a-z0-9_]+)\s*\(([\s\S]+?)\)\s*(?:;|\/)/gi;
    for (const match of content.matchAll(indexPattern)) {
      const unique = Boolean(match[1]);
      const idxName = match[2].toLowerCase();
      const table = match[3].toLowerCase();
      const colExprs = splitDefinitions(match[4]);
      const tMeta = tables.get(table);
      if (tMeta) {
        tMeta.indexes.push({ name: idxName, unique, colExprs });
      }
    }

    // 6. Drop index
    const dropIndexPattern = /drop\s+index\s+([a-z0-9_]+)\s*(?:;|\/)/gi;
    for (const match of content.matchAll(dropIndexPattern)) {
      const idxName = match[1].toLowerCase();
      for (const tMeta of tables.values()) {
        tMeta.indexes = tMeta.indexes.filter((idx) => idx.name !== idxName);
      }
    }
  }

  return tables;
}

function cleanDefinition(def) {
  return def
    .replace(/\bprimary\s+key\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function generateBaselineSql(tablesMeta, isOracle = false) {
  const tableStatements = [];
  const foreignKeyStatements = [];
  const indexStatements = [];
  const commentStatements = [];

  const globalUsedConstraints = new Set();
  function safeConstraintName(prefix, targetTable, suffix) {
    let cleanTable = targetTable.replace(/^RHN_/, "");
    let base = `${prefix}_${cleanTable}_${suffix}`.toUpperCase().replace(/_+/g, "_");
    if (base.length > 30) {
      base = `${prefix}_${cleanTable.slice(0, 14)}_${suffix}`.toUpperCase().replace(/_+/g, "_");
    }
    if (base.length > 30) {
      base = base.slice(0, 30);
    }
    let finalName = base;
    let counter = 1;
    while (globalUsedConstraints.has(finalName)) {
      const s = `_${counter}`;
      finalName = `${base.slice(0, 30 - s.length)}${s}`;
      counter += 1;
    }
    globalUsedConstraints.add(finalName);
    return finalName;
  }

  const processedTables = [...mappings].sort((a, b) => a.physical.localeCompare(b.physical));

  for (const tableMapping of processedTables) {
    const legacy = tableMapping.legacy.toLowerCase();
    const physical = tableMapping.physical.toUpperCase();
    const tMeta = tablesMeta.get(legacy);
    if (!tMeta) {
      throw new Error(`Missing table metadata for ${legacy} (${physical})`);
    }

    const colMap = new Map(tableMapping.columns.map((c) => [c.logical.toLowerCase(), c.physical.toUpperCase()]));
    const colLines = [];

    for (const col of tableMapping.columns) {
      const logicalCol = col.logical.toLowerCase();
      const physicalCol = col.physical.toUpperCase();
      let rawDef = tMeta.columns.get(logicalCol);

      if (!rawDef) {
        // Check if it's oracle adapter column
        if (isOracle && logicalCol.includes("scope_key")) {
          rawDef = "NUMBER(19,0)";
        } else {
          throw new Error(`Missing column definition for ${legacy}.${logicalCol} (${physical}.${physicalCol})`);
        }
      }

      let typeAndConstraints = cleanDefinition(rawDef);
      colLines.push(`    ${physicalCol} ${typeAndConstraints}`);
    }

    // Primary key constraint
    let pkCols = tMeta.pk;
    if (!pkCols && tMeta.columns.has("id")) {
      pkCols = ["id"];
    }
    if (pkCols && pkCols.length > 0) {
      const mappedPk = pkCols.map((c) => colMap.get(c) || c.toUpperCase());
      const pkName = safeConstraintName("PK", physical, "PK");
      colLines.push(`    constraint ${pkName} primary key (${mappedPk.join(", ")})`);
    }

    // Unique constraints
    for (const uk of tMeta.uks) {
      const ukPhysicalCols = uk.cols.map((c) => colMap.get(c) || c.toUpperCase());
      const rawUkSuffix = uk.name.replace(/^uk_[a-z0-9_]*?_?/, "");
      const safeUkName = safeConstraintName("UK", physical, rawUkSuffix || "UQ");
      colLines.push(`    constraint ${safeUkName} unique (${ukPhysicalCols.join(", ")})`);
    }

    // Check constraints
    for (const ck of tMeta.cks) {
      let expr = ck.expr;
      for (const [lCol, pCol] of colMap) {
        expr = expr.replace(new RegExp(`\\b${lCol}\\b`, "gi"), pCol);
      }
      const rawCkSuffix = ck.name.replace(/^ck_[a-z0-9_]*?_?/, "");
      const safeCkName = safeConstraintName("CK", physical, rawCkSuffix || "CK");
      colLines.push(`    constraint ${safeCkName} check (${expr})`);
    }

    tableStatements.push(`create table ${physical} (\n${colLines.join(",\n")}\n);`);

    // Foreign Keys
    for (const fk of tMeta.fks) {
      const refLegacy = fk.refTable.toLowerCase();
      const refTableMapping = tableByLegacy.get(refLegacy);
      if (!refTableMapping) continue;
      const refPhysical = refTableMapping.physical.toUpperCase();
      const refColMap = new Map(refTableMapping.columns.map((c) => [c.logical.toLowerCase(), c.physical.toUpperCase()]));

      const localPhysicalCols = fk.cols.map((c) => colMap.get(c) || c.toUpperCase());
      const refPhysicalCols = fk.refCols.map((c) => refColMap.get(c) || c.toUpperCase());

      const rawFkSuffix = fk.name.replace(/^fk_[a-z0-9_]*?_?/, "");
      const safeFkName = safeConstraintName("FK", physical, `${refPhysical.slice(4, 12)}_${rawFkSuffix || "FK"}`);

      foreignKeyStatements.push(
        `alter table ${physical} add constraint ${safeFkName} foreign key (${localPhysicalCols.join(", ")}) references ${refPhysical}(${refPhysicalCols.join(", ")});`
      );
    }

    // Indexes
    for (const idx of tMeta.indexes) {
      const idxCols = idx.colExprs.map((expr) => {
        let trimmed = expr.trim();
        const parts = trimmed.split(/\s+/);
        const colName = parts[0].toLowerCase();
        const direction = parts.slice(1).join(" ");
        const pCol = colMap.get(colName) || colName.toUpperCase();
        return direction ? `${pCol} ${direction}` : pCol;
      });
      const uniquePart = idx.unique ? "unique " : "";
      const rawIdxSuffix = idx.name.replace(/^idx_[a-z0-9_]*?_?/, "");
      const safeIdxName = safeConstraintName("IDX", physical, rawIdxSuffix || "IDX");
      indexStatements.push(`create ${uniquePart}index ${safeIdxName} on ${physical} (${idxCols.join(", ")});`);
    }

    // Comments
    commentStatements.push(`comment on table ${physical} is '${tableMapping.comment.replace(/'/g, "''")}';`);
    for (const col of tableMapping.columns) {
      const physicalCol = col.physical.toUpperCase();
      commentStatements.push(`comment on column ${physical}.${physicalCol} is '${col.comment.replace(/'/g, "''")}';`);
    }
  }

  const header = [
    "-- =============================================================================",
    `-- RHN Database Baseline Schema (${isOracle ? "Oracle 19c" : "PostgreSQL / H2"})`,
    `-- Total Tables: ${processedTables.length}`,
    "-- Generated automatically. Do not edit manually.",
    "-- =============================================================================",
    "",
  ].join("\n");

  return [
    header,
    "-- 1. Table Definitions",
    tableStatements.join("\n\n"),
    "",
    "-- 2. Foreign Key Constraints",
    foreignKeyStatements.join("\n"),
    "",
    "-- 3. Indexes",
    indexStatements.join("\n"),
    "",
    "-- 4. Comments",
    commentStatements.join("\n"),
    "",
  ].join("\n");
}

console.log("Generating Generic (PostgreSQL/H2) Baseline SQL...");
const genericDdl = parseDdl(sqlFiles(genericDir), false);
const genericSql = generateBaselineSql(genericDdl, false);

console.log("Generating Oracle Baseline SQL...");
const oracleDdl = parseDdl(sqlFiles(oracleDir), true);
const oracleSql = generateBaselineSql(oracleDdl, true);

const genericBaselinePath = path.join(targetMigrationDir, "V1_0_0__rhn_baseline_schema.sql");
const oracleBaselinePath = path.join(targetOracleDir, "V1_0_0__rhn_baseline_schema.sql");

fs.writeFileSync(genericBaselinePath, genericSql, "utf8");
fs.writeFileSync(oracleBaselinePath, oracleSql, "utf8");

console.log(`Generic baseline saved to: ${genericBaselinePath} (${genericSql.length} bytes)`);
console.log(`Oracle baseline saved to: ${oracleBaselinePath} (${oracleSql.length} bytes)`);
