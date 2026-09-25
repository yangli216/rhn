#!/usr/bin/env node

/**
 * Verify or maintain the squashed database baseline package.
 *
 * All historical migrations up to 1.84.0 are squashed into the canonical
 * single baseline B1_84_0 under db/migration and db/oracle.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const dbRoot = path.join(root, "backend", "src", "main", "resources", "db");
const baselineVersion = "1.84.0";

const canonicalOutputs = {
  postgresql: path.join(dbRoot, "migration", "B1_84_0__rhn_schema_and_metadata.sql"),
  oracle: path.join(dbRoot, "oracle", "B1_84_0__rhn_schema_and_metadata.sql"),
  development: path.join(dbRoot, "local", "V1_84_1__development_hospital.sql"),
  oracleDevelopment: path.join(dbRoot, "oracle-local", "V1_84_1__development_hospital.sql"),
  h2: path.join(dbRoot, "h2", "V1_84_2__h2_clob_types.sql"),
};

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

function fail(message) {
  console.error(`rebuild-database: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function main() {
  const missing = [];
  const details = [];

  for (const [name, filePath] of Object.entries(canonicalOutputs)) {
    if (!fs.existsSync(filePath)) {
      missing.push(relative(filePath));
    } else {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        missing.push(`${relative(filePath)} (empty)`);
      } else {
        const content = fs.readFileSync(filePath, "utf8");
        details.push({
          role: name,
          file: relative(filePath),
          sizeBytes: stats.size,
          sha256: sha256(content),
        });
      }
    }
  }

  if (missing.length > 0) {
    fail(`Missing required baseline files: ${missing.join(", ")}`);
  }

  console.log(`Database baseline squashed at version ${baselineVersion}.`);
  console.log(`Verified ${details.length} canonical baseline files:`);
  for (const item of details) {
    console.log(`  - [${item.role}] ${item.file} (${(item.sizeBytes / 1024).toFixed(1)} KB)`);
  }
}

main();
