#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mappingPath = path.join(root, "docs/foundation/rhn-physical-schema-map.json");
const mappings = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
const byLegacy = new Map(mappings.map((t) => [t.legacy.toLowerCase(), t]));

export function convertInsertSql(sql) {
  // Replace: (insert into | into ) table_name [(cols)] values (vals)
  const pattern = /\b(insert\s+into|into)\s+([a-z0-9_]+)\s*(?:\(([^)]+)\))?\s*(values\s*\([^;]+?\))/gi;

  return sql.replace(pattern, (match, prefix, tableName, colList, valuesClause) => {
    const table = byLegacy.get(tableName.toLowerCase());
    if (!table) return match;

    const physicalTable = table.physical.toUpperCase();
    const colMap = new Map(table.columns.map((c) => [c.logical.toLowerCase(), c.physical.toUpperCase()]));

    let newCols = "";
    if (colList) {
      const cols = colList.split(",").map((c) => c.trim().toLowerCase());
      const mappedCols = cols.map((c) => colMap.get(c) || c.toUpperCase());
      newCols = ` (${mappedCols.join(", ")})`;
    }

    return `${prefix} ${physicalTable}${newCols} ${valuesClause.trim()}`;
  });
}

// Test Oracle insert all
const sampleOracle = `insert all
    into parameter_categories (id, code, name) values (1, 'SYS', 'System')
    into dictionary_definitions (id, code, name) values (2, 'DICT', 'Dictionary')
select 1 from dual;`;

console.log(convertInsertSql(sampleOracle));
