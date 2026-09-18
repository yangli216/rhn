#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const jsonPath = path.join(root, "docs/essential-drugs/legacy/essential_drugs_2026.json");
const csvPath = path.join(root, "output/essential-drugs-legacy/国家基本药物目录（2026年版）_药品基本信息导入表.csv");
const pgSqlPath = path.join(root, "output/essential-drugs-legacy/postgresql/V1_47_0__national_essential_medications_2026.sql");
const oraSqlPath = path.join(root, "output/essential-drugs-legacy/oracle/V1_47_0__national_essential_medications_2026.sql");
const backendPgSqlPath = path.join(root, "backend/src/main/resources/db/migration/V1_47_0__national_essential_medications_2026.sql");
const backendOraSqlPath = path.join(root, "backend/src/main/resources/db/oracle/V1_47_0__national_essential_medications_2026.sql");

for (const output of [csvPath, pgSqlPath, oraSqlPath, backendPgSqlPath, backendOraSqlPath]) fs.mkdirSync(path.dirname(output), { recursive: true });

const catalogData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const flatItems = catalogData.flatItems;

// Deduplicate varieties by code (794 unique varieties)
const uniqueVarietiesMap = new Map();
for (const item of flatItems) {
  if (!uniqueVarietiesMap.has(item.code)) {
    uniqueVarietiesMap.set(item.code, item);
  }
}
const uniqueVarieties = Array.from(uniqueVarietiesMap.values());
console.log(`Found ${uniqueVarieties.length} unique varieties from ${flatItems.length} flat items.`);

function cleanText(text) {
  if (!text) return "";
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function splitOutsideParentheses(str, delimiter) {
  const result = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(" || ch === "（" || ch === "[" || ch === "【") {
      depth++;
      current += ch;
    } else if (ch === ")" || ch === "）" || ch === "]" || ch === "】") {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (depth === 0 && (ch === delimiter || (delimiter === "、" && (ch === "、" || ch === "，" || ch === ",")))) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function cleanSpecsWithPrefix(specs) {
  let currentPrefix = "";
  return specs.map(spec => {
    let s = spec.trim();
    const m = s.match(/^(每(?:\d+)?(?:丸|片|袋|粒|瓶|支|枚)(?:重|装)?)\s*(.*)$/);
    if (m) {
      currentPrefix = m[1];
      return `${currentPrefix} ${m[2]}`.trim();
    } else if (currentPrefix && /^\d+(?:\.\d+)?\s*(?:g|mg|ml|l|万单位|IU|粒|丸|片)/i.test(s)) {
      return `${currentPrefix} ${s}`.trim();
    }
    return s;
  });
}

function cleanSpecString(spec) {
  let s = spec.trim();
  // Remove trailing variable name explanations like （阿莫西林:克拉维酸） or （阿莫西林∶克拉维酸）
  s = s.replace(/[（(][^）)]*?[∶:][^）)]*?[）)]$/, "").trim();
  // Fix spaces inside decimals: 0. 125g -> 0.125g
  s = s.replace(/(\d+)\.\s+(\d+)/g, "$1.$2");
  // Fix spaces in ratios: 5 ∶ 1 -> 5:1
  s = s.replace(/(\d+)\s*[∶:]\s*(\d+)/g, "$1:$2");
  // Fix spaces inside parentheses: （ 5:1 ） -> （5:1）
  s = s.replace(/[（(]\s+/g, "（").replace(/\s+[）)]/g, "）");
  return s.trim();
}

function mapDoseForm(text) {
  if (!text) return ["TABLET", "片"];
  if (text.includes("注射用") || text.includes("无菌粉末") || text.includes("冻干粉")) return ["INJECTION", "支"];
  if (text.includes("注射液") || text.includes("针剂") || text.includes("氯化钠") || text.includes("葡萄糖") || text.includes("灭菌注射用水") || text.includes("注射剂") || text.includes("静脉滴注")) return ["INJECTION", "支"];
  if (text.includes("软胶囊")) return ["CAPSULE", "粒"];
  if (text.includes("胶囊")) return ["CAPSULE", "粒"];
  if (text.includes("片")) return ["TABLET", "片"];
  if (text.includes("颗粒")) return ["GRANULE", "袋"];
  if (text.includes("丸")) return ["OTHER", "丸"];
  if (text.includes("糖浆") || text.includes("口服液") || text.includes("合剂") || text.includes("混悬液") || text.includes("溶液剂") || text.includes("干混悬剂") || text.includes("混悬剂") || text.includes("流浸膏") || text.includes("浸膏") || text.includes("酊剂") || text.includes("灌肠剂")) return ["ORAL_LIQUID", "瓶"];
  if (text.includes("软膏") || text.includes("乳膏") || text.includes("凝胶") || text.includes("油膏")) return ["CREAM", "支"];
  if (text.includes("滴眼") || text.includes("滴鼻") || text.includes("滴耳") || text.includes("滴剂") || text.includes("洗剂")) return ["DROPS", "瓶"];
  if (text.includes("气雾") || text.includes("喷雾") || text.includes("吸入粉雾") || text.includes("吸入溶液") || text.includes("吸入制剂") || text.includes("雾化")) return ["AEROSOL", "支"];
  if (text.includes("栓")) return ["SUPPOSITORY", "枚"];
  if (text.includes("贴") || text.includes("膏药") || text.includes("硬膏")) return ["PATCH", "贴"];
  if (text.includes("散剂") || text.includes("粉剂")) return ["POWDER", "袋"];
  return ["TABLET", "片"];
}

function formatMedName(baseName, formName, part) {
  let cleanForm = formName.replace(/^[（(][^）)]+[）)]/, "").trim();
  let stem = baseName;
  if (baseName.includes("（") || baseName.includes("(")) {
    const stemMatch = baseName.match(/^([^\(（]+?)(?:丸|片|颗粒|胶囊|软胶囊|散|栓|合剂|口服液|糖浆|软膏|滴眼液)?(?:[（(].*?[）)])$/);
    if (stemMatch) stem = stemMatch[1];
  }
  let suffix = cleanForm;
  if (cleanForm === "片剂") suffix = "片";
  else if (cleanForm === "胶囊") suffix = "胶囊";
  else if (cleanForm === "颗粒剂") suffix = "颗粒";
  else if (cleanForm === "丸剂") suffix = "丸";
  else if (cleanForm === "散剂") suffix = "散";
  else if (cleanForm === "栓剂") suffix = "栓";

  // Check prefix salt like （钾盐）注射用无菌粉末
  const saltMatch = formName.match(/^[（(]([钾钠钙镁]+盐)[）)]/);
  if (saltMatch) {
    const salt = saltMatch[1].replace("盐", "");
    return `${stem}${salt}${cleanForm}`;
  }

  if (baseName.includes(suffix) || baseName.includes(cleanForm)) return baseName;
  return `${stem}${suffix}`;
}

function extractStrength(spec) {
  spec = spec.trim();
  // Case 1: Xml:Yg or Xml:Ymg (volume with strength)
  const volMatch = spec.match(/\d+(?:\.\d+)?\s*ml[:∶](\d+(?:\.\d+)?)\s*(mg|g|ug|μg)/i);
  if (volMatch) {
    return { val: volMatch[1], unit: volMatch[2] };
  }
  // Case 2: 250mg:50mg
  const compMatch = spec.match(/(\d+(?:\.\d+)?)\s*(mg|g|ml|万单位|IU|ug|μg)[:∶]/i);
  if (compMatch) {
    return { val: compMatch[1], unit: compMatch[2] };
  }
  // Case 3: per unit packing weight
  const perMatch = spec.match(/每(?:\d+)?(?:丸|片|袋|粒|瓶|支|枚)(?:重|装)?\s*(\d+(?:\.\d+)?)\s*(g|mg|ml|万单位|IU)/i);
  if (perMatch) {
    return { val: perMatch[1], unit: perMatch[2] };
  }
  // Case 4: standard numerical strength
  const stdMatch = spec.match(/(\d+(?:\.\d+)?)\s*(mg|g|ml|万单位|IU|ug|μg)/i);
  if (stdMatch) {
    return { val: stdMatch[1], unit: stdMatch[2] };
  }
  return { val: null, unit: null };
}

function determineDrugAttributes(item, formName, specDesc, sdDoseForm, prepUnit) {
  const isWestern = item.part === "WESTERN";
  const isTcm = item.part === "CHINESE_PATENT";
  const majorCat = item.majorCategory || "";
  const subCat = item.subCategory || "";
  const name = item.name;

  // Antimicrobial
  const isAntimicrobial = isWestern && (majorCat.includes("抗微生物药") || subCat.includes("抗生素") || subCat.includes("抗菌"));
  let antimicrobialLevel = "";
  if (isAntimicrobial) {
    if (["万古霉素", "替考拉宁", "美罗培南", "亚胺培南", "伏立康唑", "卡泊芬净", "利奈唑胺", "达托霉素"].some(w => name.includes(w))) {
      antimicrobialLevel = "SPECIAL";
    } else if (["头孢呋辛", "头孢曲松", "头孢他啶", "头孢哌酮", "哌拉西林他唑巴坦", "左氧氟沙星", "莫西沙星", "氟康唑", "阿奇霉素"].some(w => name.includes(w))) {
      antimicrobialLevel = "RESTRICTED";
    } else {
      antimicrobialLevel = "NON_RESTRICTED";
    }
  }

  // Antimicrobial safety attributes
  let amOutpatient = false;
  let amConsult = false;
  let amEmergency = false;
  let amMaxDays = null;
  if (isAntimicrobial) {
    if (antimicrobialLevel === "SPECIAL") {
      amOutpatient = false;
      amConsult = true;
      amEmergency = false;
      amMaxDays = null;
    } else if (antimicrobialLevel === "RESTRICTED") {
      amOutpatient = true;
      amConsult = true;
      amEmergency = true;
      amMaxDays = 7;
    } else {
      amOutpatient = true;
      amConsult = false;
      amEmergency = true;
      amMaxDays = 7;
    }
  }

  // Skin test
  let skinTest = false;
  let skinTestMethod = null;
  let skinTestSolutionMode = null;
  let skinTestObsMinutes = null;
  let skinTestValidHours = null;
  let skinTestInstructions = null;

  if (isWestern) {
    if (["青霉素", "苄星青霉素", "普鲁卡因青霉素", "苯唑西林", "氨苄西林", "哌拉西林", "阿莫西林克拉维酸钾", "破伤风抗毒素", "抗蛇毒血清"].some(w => name.includes(w))) {
      skinTest = true;
    } else if (name.includes("头孢") && sdDoseForm === "INJECTION") {
      skinTest = true;
    }
  }

  if (skinTest) {
    skinTestMethod = "INTRADERMAL";
    skinTestObsMinutes = 20;
    skinTestValidHours = 24;
    if (name.includes("青霉素") || name.includes("氨苄西林") || name.includes("哌拉西林") || name.includes("破伤风")) {
      skinTestSolutionMode = "DILUTED_SOLUTION";
      skinTestInstructions = "需配制标准皮试稀释液（青霉素500 U/ml），皮内注射0.1ml，观察20分钟，阴性结果24小时有效。";
    } else {
      skinTestSolutionMode = "ORIGINAL_SOLUTION";
      skinTestInstructions = "使用本次处方原药按院内规程完成皮试，观察20分钟，阴性结果24小时有效。";
    }
  }

  // Chronic disease
  let chronic = false;
  if (["心血管系统用药", "治疗精神障碍药", "神经系统用药", "内分泌", "血液系统用药"].some(w => majorCat.includes(w)) ||
      ["二甲双胍", "胰岛素", "阿卡波糖", "氨氯地平", "缬沙坦", "厄贝沙坦", "美托洛尔", "阿托伐他汀", "瑞舒伐他汀", "阿司匹林", "华法林", "左甲状腺素钠"].some(w => name.includes(w))) {
    chronic = true;
  }

  // Route
  let defaultRoute = "ORAL";
  if (sdDoseForm === "INJECTION") {
    defaultRoute = (formName.includes("粉末") || formName.includes("浓溶液") || name.includes("氯化钠") || name.includes("葡萄糖")) ? "IVGTT" : "IM";
  } else if (["TABLET", "CAPSULE", "GRANULE", "ORAL_LIQUID"].includes(sdDoseForm) || formName.includes("丸")) {
    defaultRoute = "ORAL";
  } else if (["CREAM", "OINTMENT"].includes(sdDoseForm)) {
    defaultRoute = "TOPICAL";
  } else if (sdDoseForm === "DROPS") {
    defaultRoute = (formName.includes("眼") || name.includes("眼")) ? "OPHTHALMIC" : "OTIC";
  } else if (sdDoseForm === "AEROSOL") {
    defaultRoute = (formName.includes("溶液") || formName.includes("混悬")) ? "NEB" : "INHALATION";
  } else if (sdDoseForm === "SUPPOSITORY") {
    defaultRoute = (formName.includes("阴道") || name.includes("阴道")) ? "VAGINAL" : "RECTAL";
  } else if (sdDoseForm === "PATCH") {
    defaultRoute = "TRANSDERMAL";
  }

  // Frequency
  let defaultFreq = "BID";
  if (isAntimicrobial) {
    defaultFreq = ["TABLET", "CAPSULE"].includes(sdDoseForm) ? "TID" : "QD";
  } else if (chronic) {
    defaultFreq = "QD";
  } else if (["对乙酰氨基酚", "布洛芬", "氨茶碱", "硝酸甘油"].some(w => name.includes(w))) {
    defaultFreq = "PRN";
  } else {
    defaultFreq = isTcm ? "TID" : "BID";
  }

  // Storage
  let storage = "ROOM_TEMPERATURE";
  if (["胰岛素", "疫苗", "人免疫球蛋白", "凝血因子", "抗毒素", "干扰素", "生长激素", "活菌"].some(w => name.includes(w))) {
    storage = "REFRIGERATED";
  } else if (["栓剂", "软膏", "乳膏", "糖浆"].some(w => name.includes(w))) {
    storage = "COOL";
  }

  // Prescription
  let prescription = true;
  if (["板蓝根", "维C银翘", "双黄连", "牛黄解毒", "藿香正气", "保济", "健儿消食", "创可贴", "炉甘石", "红霉素软膏", "维生素C片", "维生素B1片", "复合维生素B片", "碳酸钙D3"].some(w => name.includes(w))) {
    prescription = false;
  }

  return {
    isAntimicrobial,
    antimicrobialLevel,
    amOutpatient,
    amConsult,
    amEmergency,
    amMaxDays,
    skinTest,
    skinTestMethod,
    skinTestSolutionMode,
    skinTestObsMinutes,
    skinTestValidHours,
    skinTestInstructions,
    chronic,
    defaultRoute,
    defaultFreq,
    storage,
    prescription
  };
}

// Build granular items: each distinct dose form × distinct strength is an independent master record
const items = [];
const codeSet = new Set();

for (const v of uniqueVarieties) {
  const specText = cleanText(v.spec);
  const baseCode = v.code;
  const baseName = v.name;
  const rawAlias = v.innName ? v.innName : v.pinyinCode;
  const cleanAlias = (rawAlias || "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();

  const entries = [];
  if (!specText) {
    entries.push({ form: "常规定制", spec: "以国家专项规定为准" });
  } else {
    const clauses = splitOutsideParentheses(specText, "；");
    for (const clause of clauses) {
      const colonIdx = clause.indexOf("：") !== -1 ? clause.indexOf("：") : clause.indexOf(":");
      if (colonIdx !== -1) {
        const formPart = clause.substring(0, colonIdx).trim();
        const specPart = clause.substring(colonIdx + 1).trim();
        const forms = splitOutsideParentheses(formPart, "、");
        let rawSpecs = splitOutsideParentheses(specPart, "、");
        let specs = cleanSpecsWithPrefix(rawSpecs);
        for (const f of forms) {
          for (const s of specs) {
            entries.push({ form: f, spec: cleanSpecString(s) });
          }
        }
      } else {
        const forms = splitOutsideParentheses(clause, "、");
        for (const f of forms) {
          entries.push({ form: f, spec: "常规说明书规格" });
        }
      }
    }
  }

  // Deduplicate entries by form + spec
  const seenKey = new Set();
  const dedupedEntries = [];
  for (const e of entries) {
    const key = `${e.form}|${e.spec}`;
    if (!seenKey.has(key)) {
      seenKey.add(key);
      dedupedEntries.push(e);
    }
  }

  dedupedEntries.forEach((e, idx) => {
    const subCode = dedupedEntries.length === 1 ? baseCode : `${baseCode}-${String(idx + 1).padStart(2, "0")}`;
    if (codeSet.has(subCode)) {
      throw new Error(`Duplicate drug code generated: ${subCode}`);
    }
    codeSet.add(subCode);

    const [sdDoseForm, prepUnit] = mapDoseForm(e.form);
    const fullName = formatMedName(baseName, e.form, v.part);
    const attrs = determineDrugAttributes(v, e.form, e.spec, sdDoseForm, prepUnit);
    const strengthInfo = extractStrength(e.spec);

    items.push({
      code: subCode,
      name: fullName.substring(0, 300),
      aliasName: cleanAlias.substring(0, 300),
      medicationType: v.part,
      doseForm: sdDoseForm,
      preparationSpec: e.spec.substring(0, 300),
      preparationUnit: prepUnit,
      strengthValue: strengthInfo.val,
      strengthUnit: strengthInfo.unit,
      storageType: attrs.storage,
      prescriptionDrug: attrs.prescription,
      essentialDrug: true,
      antimicrobial: attrs.isAntimicrobial,
      antimicrobialLevel: attrs.antimicrobialLevel,
      amOutpatient: attrs.amOutpatient,
      amConsult: attrs.amConsult,
      amEmergency: attrs.amEmergency,
      amMaxDays: attrs.amMaxDays,
      skinTestRequired: attrs.skinTest,
      skinTestMethod: attrs.skinTestMethod,
      skinTestSolutionMode: attrs.skinTestSolutionMode,
      skinTestObsMinutes: attrs.skinTestObsMinutes,
      skinTestValidHours: attrs.skinTestValidHours,
      skinTestInstructions: attrs.skinTestInstructions,
      defaultRoute: attrs.defaultRoute,
      defaultFrequency: attrs.defaultFreq,
      chronicDiseaseDrug: attrs.chronic,
      singleOrder: true,
      status: "ACTIVE"
    });
  });
}

console.log(`Generated ${items.length} granular specification master items for 2026 National Essential Medications.`);

// 1. Generate 31-column CSV
const csvHeaders = [
  "编码", "名称", "别名", "药品类型", "剂型",
  "制剂规格", "制剂单位", "含量数值", "含量单位", "储藏方式",
  "处方药", "基本药物", "抗菌药", "抗菌药等级", "抗菌药门诊可用",
  "抗菌药需会诊审批", "抗菌药允许紧急使用", "抗菌药门诊疗程上限", "需要皮试", "皮试方式",
  "皮试液配置方式", "皮试观察分钟", "皮试结果有效小时", "皮试配置说明", "默认剂量",
  "默认剂量单位", "默认给药途径", "默认频次", "慢病用药", "允许单开",
  "状态"
];

function escapeCsv(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const csvLines = [csvHeaders.join(",")];
for (const it of items) {
  csvLines.push([
    escapeCsv(it.code),
    escapeCsv(it.name),
    escapeCsv(it.aliasName),
    escapeCsv(it.medicationType),
    escapeCsv(it.doseForm),
    escapeCsv(it.preparationSpec),
    escapeCsv(it.preparationUnit),
    escapeCsv(it.strengthValue),
    escapeCsv(it.strengthUnit),
    escapeCsv(it.storageType),
    it.prescriptionDrug ? "是" : "否",
    "是",
    it.antimicrobial ? "是" : "否",
    escapeCsv(it.antimicrobialLevel),
    it.amOutpatient ? "是" : "否",
    it.amConsult ? "是" : "否",
    it.amEmergency ? "是" : "否",
    escapeCsv(it.amMaxDays),
    it.skinTestRequired ? "是" : "否",
    escapeCsv(it.skinTestMethod),
    escapeCsv(it.skinTestSolutionMode),
    escapeCsv(it.skinTestObsMinutes),
    escapeCsv(it.skinTestValidHours),
    escapeCsv(it.skinTestInstructions),
    "", "", // defaultDose, defaultDoseUnit
    escapeCsv(it.defaultRoute),
    escapeCsv(it.defaultFrequency),
    it.chronicDiseaseDrug ? "是" : "否",
    "是",
    "ACTIVE"
  ].join(","));
}

fs.writeFileSync(csvPath, "\ufeff" + csvLines.join("\n"), "utf8");
console.log(`Updated CSV at: ${csvPath}`);

// 2. Generate Flyway SQL (PostgreSQL and Oracle)
const baseMedId = 362387880000000n;
const baseAttrSubjectId = 362387880500000n;
const tenantId = 362387869790209n;
const userId = 362387869790222n;

function sqlStr(val) {
  if (val === null || val === undefined || val === "") return "null";
  const escaped = String(val).replace(/'/g, "''");
  return `'${escaped}'`;
}

function sqlNum(val) {
  if (val === null || val === undefined || val === "" || isNaN(Number(val))) return "null";
  return String(Number(val));
}

const pgLines = [
  "-- =============================================================================",
  "-- National Essential Medications Catalog (2026 Edition) - Master Baseline Seed",
  `-- Total Varieties: ${uniqueVarieties.length}, Total Specification Items: ${items.length}`,
  "-- Dialect: PostgreSQL",
  "-- =============================================================================",
  ""
];

const oraLines = [
  "-- =============================================================================",
  "-- National Essential Medications Catalog (2026 Edition) - Master Baseline Seed",
  `-- Total Varieties: ${uniqueVarieties.length}, Total Specification Items: ${items.length}`,
  "-- Dialect: Oracle",
  "-- =============================================================================",
  ""
];

for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const medId = baseMedId + BigInt(i + 1);
  const subjectId = baseAttrSubjectId + BigInt(i + 1);
  const itemTypeId = it.medicationType === "WESTERN" ? 362387869797012n : 362387869797013n;

  // PostgreSQL values
  const pgMedCols = [
    medId, 0, tenantId, sqlStr(it.code), sqlStr(it.name), sqlStr(it.aliasName),
    sqlStr(it.medicationType), sqlStr(it.doseForm), sqlStr(it.preparationSpec), sqlStr(it.preparationUnit),
    sqlNum(it.strengthValue), sqlStr(it.strengthUnit), sqlStr(it.storageType),
    it.prescriptionDrug ? "true" : "false", "true",
    it.antimicrobial ? "true" : "false", sqlStr(it.antimicrobialLevel),
    it.skinTestRequired ? "true" : "false", "null", "null",
    sqlStr(it.defaultRoute), sqlStr(it.defaultFrequency),
    it.chronicDiseaseDrug ? "true" : "false", "true",
    "'ACTIVE'", "timestamp with time zone '2026-01-01 00:00:00+08'", userId,
    "timestamp with time zone '2026-01-01 00:00:00+08'", userId,
    itemTypeId, "null", "null", "null",
    it.amOutpatient ? "true" : "false",
    it.amConsult ? "true" : "false",
    it.amEmergency ? "true" : "false",
    it.amMaxDays ? String(it.amMaxDays) : "null",
    sqlStr(it.skinTestMethod), sqlStr(it.skinTestSolutionMode),
    it.skinTestObsMinutes ? String(it.skinTestObsMinutes) : "null",
    it.skinTestValidHours ? String(it.skinTestValidHours) : "null",
    sqlStr(it.skinTestInstructions)
  ];

  pgLines.push(`insert into RHN_BD_MED select ${pgMedCols.join(", ")} where not exists (select 1 from RHN_BD_MED where ID_MED = ${medId});`);

  if (it.medicationType === "WESTERN") {
    pgLines.push(`insert into RHN_BD_MED_WESTERN select ${medId}, ${tenantId}, ${sqlStr(it.name)}, null, false, false where not exists (select 1 from RHN_BD_MED_WESTERN where ID_MED = ${medId});`);
  }

  pgLines.push(`insert into RHN_BD_ITEM_ATTR_SUBJECT select ${subjectId}, ${tenantId}, 'MEDICATION', 'TENANT:${tenantId}/MEDICATION:${medId}', null, ${medId}, null, null, timestamp with time zone '2026-01-01 00:00:00+08', ${userId} where not exists (select 1 from RHN_BD_ITEM_ATTR_SUBJECT where ID_ITEM_ATTR_SUBJECT = ${subjectId});`);

  // Oracle values
  const oraMedCols = [
    medId, 0, tenantId, sqlStr(it.code), sqlStr(it.name), sqlStr(it.aliasName),
    sqlStr(it.medicationType), sqlStr(it.doseForm), sqlStr(it.preparationSpec), sqlStr(it.preparationUnit),
    sqlNum(it.strengthValue), sqlStr(it.strengthUnit), sqlStr(it.storageType),
    it.prescriptionDrug ? 1 : 0, 1,
    it.antimicrobial ? 1 : 0, sqlStr(it.antimicrobialLevel),
    it.skinTestRequired ? 1 : 0, "null", "null",
    sqlStr(it.defaultRoute), sqlStr(it.defaultFrequency),
    it.chronicDiseaseDrug ? 1 : 0, 1,
    "'ACTIVE'", "timestamp '2026-01-01 00:00:00'", userId,
    "timestamp '2026-01-01 00:00:00'", userId,
    itemTypeId, "null", "null", "null",
    it.amOutpatient ? 1 : 0,
    it.amConsult ? 1 : 0,
    it.amEmergency ? 1 : 0,
    it.amMaxDays ? String(it.amMaxDays) : "null",
    sqlStr(it.skinTestMethod), sqlStr(it.skinTestSolutionMode),
    it.skinTestObsMinutes ? String(it.skinTestObsMinutes) : "null",
    it.skinTestValidHours ? String(it.skinTestValidHours) : "null",
    sqlStr(it.skinTestInstructions)
  ];

  oraLines.push(`merge into RHN_BD_MED t using (select ${medId} as ID_MED from dual) s on (t.ID_MED = s.ID_MED)`);
  oraLines.push(`when not matched then insert (ID_MED, REVISION, ID_TNT, CD_MED, NA_MED, NA_ALIAS, SD_MED_TYPE, DOSE_FORM, PREPARATION_SPEC, PREPARATION_UNIT, QTY_STRENGTH_VAL, STRENGTH_UNIT, SD_STORAGE_TYPE, FG_PRESCRIPTION_DRUG, FG_ESSENTIAL_DRUG, FG_ANTIMICROBIAL, SD_ANTIMICROBIAL_LEVEL, FG_SKIN_TEST_REQUIRED, QTY_DEFAULT_DOSE, DEFAULT_DOSE_UNIT, DEFAULT_ROUTE, DEFAULT_FREQUENCY, FG_CHRONIC_DISEASE_DRUG, FG_SINGLE_ORDER, SD_STATUS, DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED, ID_ITEM_TYPE, ID_ITEM_MASTER, ID_ORDER_FREQ_DEFAULT, ID_CONCEPT_DEFAULT_ROUTE, FG_ANTIMICROBIAL_OUTPATIENT, FG_ANTIMICROBIAL_CONSULT, FG_ANTIMICROBIAL_EMERGENCY, QTY_ANTIMICROBIAL_MAX_DAYS, SD_SKIN_TEST_METHOD, SD_SKIN_TEST_SOLUTION_MODE, QTY_SKIN_TEST_OBS_MINUTES, QTY_SKIN_TEST_VALID_HOURS, DES_SKIN_TEST_INSTRUCTION)`);
  oraLines.push(`values (${oraMedCols.join(", ")});`);

  if (it.medicationType === "WESTERN") {
    oraLines.push(`merge into RHN_BD_MED_WESTERN t using (select ${medId} as ID_MED from dual) s on (t.ID_MED = s.ID_MED)`);
    oraLines.push(`when not matched then insert (ID_MED, ID_TNT, ACTIVE_INGREDIENT, SD_THERAPEUTIC_CLASS, FG_BIOLOGIC, FG_BIOSIMILAR) values (${medId}, ${tenantId}, ${sqlStr(it.name)}, null, 0, 0);`);
  }

  oraLines.push(`merge into RHN_BD_ITEM_ATTR_SUBJECT t using (select ${subjectId} as ID_ITEM_ATTR_SUBJECT from dual) s on (t.ID_ITEM_ATTR_SUBJECT = s.ID_ITEM_ATTR_SUBJECT)`);
  oraLines.push(`when not matched then insert (ID_ITEM_ATTR_SUBJECT, ID_TNT, SD_SUBJECT_TYPE, CD_SUBJECT_KEY, ID_ITEM_MASTER, ID_MED, ID_CATALOG_ITEM, ID_SVC_VAR, DT_CREATED, ID_USER_CREATED) values (${subjectId}, ${tenantId}, 'MEDICATION', 'TENANT:${tenantId}/MEDICATION:${medId}', null, ${medId}, null, null, timestamp '2026-01-01 00:00:00', ${userId});`);
}

const pgSqlContent = pgLines.join("\n");
fs.writeFileSync(pgSqlPath, pgSqlContent, "utf8");
fs.writeFileSync(backendPgSqlPath, pgSqlContent, "utf8");
console.log(`Generated PostgreSQL migration at: ${pgSqlPath} and ${backendPgSqlPath}`);

const oraSqlContent = oraLines.join("\n");
fs.writeFileSync(oraSqlPath, oraSqlContent, "utf8");
fs.writeFileSync(backendOraSqlPath, oraSqlContent, "utf8");
console.log(`Generated Oracle migration at: ${oraSqlPath} and ${backendOraSqlPath}`);
console.log("All essential drug artifacts generated successfully.");
