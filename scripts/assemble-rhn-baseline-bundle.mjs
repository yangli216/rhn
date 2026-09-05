#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { convertInsertSql } from "./convert-inserts-to-rhn.mjs";

const root = process.cwd();
const archiveDir = path.join(root, "backend/src/main/resources/db/archive_v1_v131");
const migrationDir = path.join(root, "backend/src/main/resources/db/migration");
const oracleDir = path.join(root, "backend/src/main/resources/db/oracle");
const localDir = path.join(root, "backend/src/main/resources/db/local");
const oracleLocalDir = path.join(root, "backend/src/main/resources/db/oracle-local");
const h2Dir = path.join(root, "backend/src/main/resources/db/h2");

// 1. Metadata migration files from archive
const metadataFiles = [
  "V11__persisted_system_dictionaries.sql",
  "V12_0_1__organization_dictionary_baseline.sql",
  "V13_0_1__department_dictionary_baseline.sql",
  "V14__parameter_classification_and_system_parameter_baseline.sql",
  "V15_0_1__basic_data_dictionary_baseline.sql",
  "V16__dictionary_classification.sql",
  "V18__master_data_capability_completion.sql",
  "V19__master_data_type_model.sql",
  "V27__controlled_printing_foundation.sql",
  "V35__pharmacy_organization_semantics.sql",
  "V36__primary_care_scheduling.sql",
  "V37__dictionary_category_taxonomy.sql",
  "V38__resident_profile_management.sql",
  "V41__resident_registration_completion.sql",
  "V44__grid_address_management.sql",
  "V46__medical_operations_master_data.sql",
  "V51__dictionary_item_attribute_configuration.sql",
  "V53__common_platform_dictionaries.sql",
  "V57__formal_billing_settlement.sql",
  "V81__order_frequency_master_data.sql",
  "V115__dispense_route_care_setting.sql",
  "V116__inpatient_supply_auto_generation.sql",
  "V119__prescription_review_policy.sql",
  "V120__separate_insurance_settlement_from_payment_method.sql",
  "V127__standard_resident_dictionaries_alignment.sql",
  "V129__medication_administration_routes.sql",
  "V130__refund_policy_configuration.sql",
];

function extractInserts(dir, files, isOracle = false) {
  const parts = [];
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf8");
    // Extract insert statements
    const converted = convertInsertSql(content);
    // Keep insert into / insert all into and comments
    const lines = converted.split("\n");
    const collected = [];
    let inInsert = false;
    for (const line of lines) {
      if (/\binsert\s+(into|all)\b/i.test(line) || inInsert) {
        inInsert = true;
        collected.push(line);
        if (line.trim().endsWith(";") || (isOracle && line.trim() === "/")) {
          inInsert = false;
          collected.push("");
        }
      }
    }
    if (collected.length > 0) {
      parts.push(`-- Source: ${f}\n` + collected.join("\n"));
    }
  }
  return parts.join("\n\n");
}

function extractDemoInserts(dir, isOracle = false) {
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => {
      const numA = parseFloat(a.match(/^V(\d+(?:_\d+)*)/)[1].replace(/_/g, "."));
      const numB = parseFloat(b.match(/^V(\d+(?:_\d+)*)/)[1].replace(/_/g, "."));
      return numA - numB;
    });

  const parts = [];
  for (const f of files) {
    // Skip disease management files since we have our new rich dataset
    if (f.includes("disease_management") || f.includes("demo_basic_data")) {
      // In demo_basic_data, we still need the catalog items/medications/service items!
      if (f.includes("demo_basic_data")) {
        const content = fs.readFileSync(path.join(dir, f), "utf8");
        const converted = convertInsertSql(content);
        // Exclude code_systems and concepts (which are now in V1_2_0)
        const filteredLines = [];
        let skipBlock = false;
        for (const line of converted.split("\n")) {
          if (/\b(RHN_BD_CODE_SYSTEM|RHN_BD_CONCEPT)\b/.test(line)) {
            skipBlock = true;
          }
          if (!skipBlock) {
            filteredLines.push(line);
          }
          if (line.trim().endsWith(";") || (isOracle && line.trim().endsWith("dual;"))) {
            skipBlock = false;
          }
        }
        parts.push(`-- Source: ${f}\n` + filteredLines.join("\n"));
        continue;
      }
      continue;
    }

    const content = fs.readFileSync(path.join(dir, f), "utf8");
    const converted = convertInsertSql(content);
    parts.push(`-- Source: ${f}\n` + converted);
  }
  return parts.join("\n\n");
}

console.log("Assembling V1_1_0 System Metadata...");
const genericMeta = [
  "-- =============================================================================",
  "-- RHN Baseline System Metadata (PostgreSQL / H2)",
  "-- Platform Configuration, Parameters, Standard Dictionaries & Routes",
  "-- =============================================================================",
  "",
  extractInserts(path.join(archiveDir, "migration"), metadataFiles, false),
].join("\n");

const oracleMeta = [
  "-- =============================================================================",
  "-- RHN Baseline System Metadata (Oracle 19c)",
  "-- Platform Configuration, Parameters, Standard Dictionaries & Routes",
  "-- =============================================================================",
  "",
  extractInserts(path.join(archiveDir, "oracle"), metadataFiles, true),
].join("\n");

fs.writeFileSync(path.join(migrationDir, "V1_1_0__rhn_system_metadata.sql"), genericMeta, "utf8");
fs.writeFileSync(path.join(oracleDir, "V1_1_0__rhn_system_metadata.sql"), oracleMeta, "utf8");
console.log("Wrote V1_1_0__rhn_system_metadata.sql");

console.log("Assembling V1_3_0 Hospital Demo Data...");
const genericDemo = [
  "-- =============================================================================",
  "-- RHN Baseline Hospital Demo Data (PostgreSQL / H2)",
  "-- Demo Tenant, Organizations, Staff, Schedules, Catalog & Prices",
  "-- =============================================================================",
  "",
  extractDemoInserts(path.join(archiveDir, "local"), false),
].join("\n");

const oracleDemo = [
  "-- =============================================================================",
  "-- RHN Baseline Hospital Demo Data (Oracle 19c)",
  "-- Demo Tenant, Organizations, Staff, Schedules, Catalog & Prices",
  "-- =============================================================================",
  "",
  extractDemoInserts(path.join(archiveDir, "oracle-local"), true),
].join("\n");

fs.writeFileSync(path.join(localDir, "V1_3_0__rhn_demo_hospital.sql"), genericDemo, "utf8");
fs.writeFileSync(path.join(oracleLocalDir, "V1_3_0__rhn_demo_hospital.sql"), oracleDemo, "utf8");
console.log("Wrote V1_3_0__rhn_demo_hospital.sql");

// Clean old files from main directories
function cleanLegacyFiles(dir, keepPrefix) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(keepPrefix) && f.endsWith(".sql")) {
      fs.unlinkSync(path.join(dir, f));
    }
  }
}

cleanLegacyFiles(migrationDir, "V1_");
cleanLegacyFiles(oracleDir, "V1_");
cleanLegacyFiles(localDir, "V1_");
cleanLegacyFiles(oracleLocalDir, "V1_");
cleanLegacyFiles(h2Dir, "V1_");

console.log("Cleaned legacy incremental files from main migration directories.");
console.log("Migration directories now only contain pure V1_* baseline scripts.");
