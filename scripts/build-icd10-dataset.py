#!/usr/bin/env python3
"""
Build national healthcare security ICD-10 catalog migration scripts (V1.85.0).
Source: docs/terminology/icd10_chs_v2.0.csv (CHS-ICD10 v2.0)
Targets:
  - backend/src/main/resources/db/migration/V1_85_0__national_healthcare_security_icd10_catalog.sql (PostgreSQL / H2)
  - backend/src/main/resources/db/oracle/V1_85_0__national_healthcare_security_icd10_catalog.sql (Oracle)
"""

import csv
import os
import re
import sys
import pypinyin

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CSV_PATH = os.path.join(ROOT_DIR, "docs", "terminology", "icd10_chs_v2.0.csv")
BASELINE_PG_PATH = os.path.join(ROOT_DIR, "backend", "src", "main", "resources", "db", "migration", "B1_84_0__rhn_schema_and_metadata.sql")

TARGET_PG_PATH = os.path.join(ROOT_DIR, "backend", "src", "main", "resources", "db", "migration", "V1_85_0__national_healthcare_security_icd10_catalog.sql")
TARGET_ORA_PATH = os.path.join(ROOT_DIR, "backend", "src", "main", "resources", "db", "oracle", "V1_85_0__national_healthcare_security_icd10_catalog.sql")

ROMAN_CHAPTERS = {
    '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V',
    '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X',
    '11': 'XI', '12': 'XII', '13': 'XIII', '14': 'XIV', '15': 'XV',
    '16': 'XVI', '17': 'XVII', '18': 'XVIII', '19': 'XIX', '20': 'XX',
    '21': 'XXI', '22': 'XXII'
}

def escape_sql(val):
    if val is None:
        return "null"
    return "'" + str(val).replace("'", "''") + "'"

def generate_search_code(text):
    if not text:
        return ""
    pinyin_list = pypinyin.lazy_pinyin(text, style=pypinyin.Style.FIRST_LETTER)
    res = "".join(pinyin_list).upper()
    res = re.sub(r'[^A-Z0-9]', '', res)
    return res[:128]

def parse_baseline():
    """Extract baseline concepts, aliases and disease mgmt members for ICD-10."""
    with open(BASELINE_PG_PATH, 'r', encoding='utf-8') as f:
        text = f.read()

    # 56 baseline concepts
    old_concepts = {}
    for m in re.finditer(r'insert into RHN_BD_CONCEPT values \((.*?362387869795001.*?)\);', text):
        raw = m.group(1)
        tokens = [t.strip().strip("'") for t in raw.split(',')]
        cid = int(tokens[0])
        code = tokens[2]
        name = tokens[3]
        short_name = tokens[10] if tokens[10] != 'null' else None
        old_concepts[code] = {
            'id': cid,
            'name': name,
            'short_name': short_name,
            'search': tokens[13]
        }

    # 89 baseline aliases
    old_aliases = []
    old_cids = {info['id'] for info in old_concepts.values()}
    for m in re.finditer(r'insert into RHN_BD_CONCEPT_ALIAS values \((.*?)\);', text):
        raw = m.group(1)
        tokens = [t.strip().strip("'") for t in raw.split(',')]
        if int(tokens[1]) in old_cids:
            old_aliases.append(raw)

    return old_concepts, old_aliases

def main():
    print(f"Reading CSV from {CSV_PATH}...")
    if not os.path.exists(CSV_PATH):
        print(f"Error: CSV file not found at {CSV_PATH}")
        sys.exit(1)

    old_concepts, old_aliases = parse_baseline()
    print(f"Found {len(old_concepts)} baseline concepts to preserve IDs, {len(old_aliases)} aliases to preserve.")

    with open(CSV_PATH, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Total rows in CSV: {len(rows)}")

    # Collect unique concepts across categories, subcategories, and detailed diagnoses
    # We want to maintain structural integrity: Category -> Subcategory -> Detailed diagnosis
    categories = {}      # code -> dict
    subcategories = {}   # code -> dict
    detailed = {}        # code -> dict

    for r in rows:
        chap_num = r['章'].strip()
        chap_roman = ROMAN_CHAPTERS.get(chap_num, chap_num)
        chap_name = r['章的名称'].strip()
        sec_name = r['节名称'].strip()

        cat_code = r['类目代码'].strip()
        cat_name = r['类目名称'].strip()

        sub_code = r['亚目代码'].strip()
        sub_name = r['亚目名称'].strip()

        diag_code = r['诊断代码'].strip()
        diag_name = r['诊断名称'].strip()

        if cat_code and cat_code not in categories:
            categories[cat_code] = {
                'code': cat_code,
                'name': cat_name,
                'chapter_cd': chap_roman,
                'chapter_na': chap_name,
                'sec_name': sec_name,
                'level': 'CATEGORY',
                'desc': f"{chap_name} / {sec_name} / {cat_name} (类目)"
            }

        if sub_code and sub_code not in subcategories:
            subcategories[sub_code] = {
                'code': sub_code,
                'name': sub_name,
                'chapter_cd': chap_roman,
                'chapter_na': chap_name,
                'sec_name': sec_name,
                'level': 'SUBCATEGORY',
                'desc': f"{chap_name} / {sec_name} / {cat_name} / {sub_name} (亚目)"
            }

        if diag_code and diag_code not in detailed:
            detailed[diag_code] = {
                'code': diag_code,
                'name': diag_name,
                'chapter_cd': chap_roman,
                'chapter_na': chap_name,
                'sec_name': sec_name,
                'level': 'DETAIL',
                'desc': f"{sec_name} / {cat_name} / {diag_name}"
            }

    print(f"Parsed unique: {len(categories)} categories, {len(subcategories)} subcategories, {len(detailed)} detailed diagnoses.")

    # Combine into unified concept list
    # Order: Category, Subcategory, Detailed diagnosis, sorted by code
    combined = []
    seen_codes = set()

    for item in sorted(categories.values(), key=lambda x: x['code']):
        if item['code'] not in seen_codes:
            combined.append(item)
            seen_codes.add(item['code'])

    for item in sorted(subcategories.values(), key=lambda x: x['code']):
        if item['code'] not in seen_codes:
            combined.append(item)
            seen_codes.add(item['code'])

    for item in sorted(detailed.values(), key=lambda x: x['code']):
        if item['code'] not in seen_codes:
            combined.append(item)
            seen_codes.add(item['code'])

    total_concepts = len(combined)
    print(f"Total unified concepts: {total_concepts}")

    # Assign IDs
    # Preserve old 56 IDs; for new ones, start from 362387900000001
    next_id = 362387900000001
    records = []

    preserved_count = 0
    for c in combined:
        code = c['code']
        if code in old_concepts:
            old_info = old_concepts[code]
            cid = old_info['id']
            name = old_info['name']
            short_name = old_info['short_name']
            search = old_info['search']
            preserved_count += 1
        else:
            cid = next_id
            next_id += 1
            name = c['name']
            short_name = None
            search = generate_search_code(name)

        records.append({
            'id': cid,
            'id_code_system': 362387869795001,
            'code': code,
            'name': name,
            'desc': c['desc'],
            'status': 'ACTIVE',
            'effective_from': '2026-01-01',
            'effective_to': None,
            'created_at_pg': "timestamp with time zone '2026-09-25 12:00:00+08'",
            'created_at_ora': "to_timestamp_tz('2026-09-25 12:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS.FF TZH:TZM')",
            'concept_type': 'DISEASE',
            'short_name': short_name,
            'chapter_cd': c['chapter_cd'],
            'chapter_na': c['chapter_na'],
            'search': search,
            'src_type': 'EXTERNAL_IMPORT',
            'replacement_id': None,
            'revision': 0,
            'updated_at_pg': "timestamp with time zone '2026-09-25 12:00:00+08'",
            'updated_at_ora': "to_timestamp_tz('2026-09-25 12:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS.FF TZH:TZM')"
        })

    print(f"Assigned IDs: {preserved_count} preserved, {len(records) - preserved_count} newly assigned (up to {next_id - 1}).")

    # Generate PostgreSQL / H2 migration file
    print(f"Writing PostgreSQL migration to {TARGET_PG_PATH}...")
    with open(TARGET_PG_PATH, 'w', encoding='utf-8') as f:
        f.write("-- V1_85_0: Import National Healthcare Security ICD-10 Catalog (CHS-ICD10 v2.0)\n")
        f.write("-- Replaces legacy 56 baseline demo diagnoses with full 45,523 standard concepts\n")
        f.write("-- Covers 22 chapters, 2,048 categories, 10,171 subcategories, and 33,304 detailed diagnoses\n\n")

        # Cleanup legacy
        f.write("-- 1. Clean up legacy aliases, disease management members, and demo concepts\n")
        f.write("delete from RHN_BD_CONCEPT_ALIAS where ID_CONCEPT in (select ID_CONCEPT from RHN_BD_CONCEPT where ID_CODE_SYSTEM = 362387869795001);\n")
        f.write("delete from RHN_HPL_DISEASE_MGMT_MEMBER where ID_CONCEPT in (select ID_CONCEPT from RHN_BD_CONCEPT where ID_CODE_SYSTEM = 362387869795001);\n")
        f.write("delete from RHN_BD_CONCEPT where ID_CODE_SYSTEM = 362387869795001;\n\n")

        # Update code system metadata
        f.write("-- 2. Update Code System metadata to National Healthcare Security ICD-10 v2.0\n")
        f.write("update RHN_BD_CODE_SYSTEM\n")
        f.write("set NA_CODE_SYSTEM = 'ICD-10 疾病分类（国家医保版 2.0）',\n")
        f.write("    PUBLSHR = '国家医疗保障局',\n")
        f.write("    DES_CODE_SYSTEM = '国家医疗保障疾病诊断分类与代码 (ICD-10 医保版 2.0)，收录国家标准章节、类目、亚目与细目全量诊断目录',\n")
        f.write("    DT_UPDATED = timestamp with time zone '2026-09-25 12:00:00+08'\n")
        f.write("where ID_CODE_SYSTEM = 362387869795001;\n\n")

        # Batch insert concepts (500 per batch)
        f.write("-- 3. Batch insert full national standard ICD-10 concepts\n")
        batch_size = 500
        cols = ("ID_CONCEPT, ID_CODE_SYSTEM, CD_CONCEPT, NA_DISPLAY, DES_DEF, SD_STATUS, "
                "DA_EFF_FROM, DA_EFF_TO, DT_CREATED, SD_CONCEPT_TYPE, NA_SHORT, "
                "CD_CHAPTER, NA_CHAPTER, CD_SEARCH, SD_SRC_TYPE, ID_CONCEPT_RPLCMNT, REVISION, DT_UPDATED")

        for i in range(0, len(records), batch_size):
            batch = records[i:i+batch_size]
            values_clauses = []
            for r in batch:
                v = (f"({r['id']}, {r['id_code_system']}, {escape_sql(r['code'])}, {escape_sql(r['name'])}, "
                     f"{escape_sql(r['desc'])}, '{r['status']}', date '{r['effective_from']}', null, "
                     f"{r['created_at_pg']}, '{r['concept_type']}', {escape_sql(r['short_name'])}, "
                     f"{escape_sql(r['chapter_cd'])}, {escape_sql(r['chapter_na'])}, {escape_sql(r['search'])}, "
                     f"'{r['src_type']}', null, {r['revision']}, {r['updated_at_pg']})")
                values_clauses.append(v)
            f.write(f"insert into RHN_BD_CONCEPT ({cols})\nvalues\n" + ",\n".join(values_clauses) + ";\n\n")

        # Re-insert disease management members
        f.write("-- 4. Re-bind baseline disease management members\n")
        f.write("insert into RHN_HPL_DISEASE_MGMT_MEMBER values (362387870124001, 362387870123001, 362387869795011, 'ACTIVE', date '2026-01-01', null, 'ICD-10 I10 高血压管理', timestamp with time zone '2026-09-15 13:51:07.52759+08', 'INCLUDE');\n")
        f.write("insert into RHN_HPL_DISEASE_MGMT_MEMBER values (362387870124002, 362387870123002, 362387869795012, 'ACTIVE', date '2026-01-01', null, 'ICD-10 E11.9 糖尿病管理', timestamp with time zone '2026-09-15 13:51:07.52759+08', 'INCLUDE');\n\n")

        # Re-insert aliases
        f.write("-- 5. Re-bind baseline clinical aliases\n")
        for a in old_aliases:
            f.write(f"insert into RHN_BD_CONCEPT_ALIAS values ({a});\n")

    # Generate Oracle migration file
    print(f"Writing Oracle migration to {TARGET_ORA_PATH}...")
    with open(TARGET_ORA_PATH, 'w', encoding='utf-8') as f:
        f.write("-- V1_85_0: Import National Healthcare Security ICD-10 Catalog (CHS-ICD10 v2.0)\n")
        f.write("-- Replaces legacy 56 baseline demo diagnoses with full 45,523 standard concepts\n")
        f.write("-- Covers 22 chapters, 2,048 categories, 10,171 subcategories, and 33,304 detailed diagnoses\n\n")

        # Cleanup legacy
        f.write("-- 1. Clean up legacy aliases, disease management members, and demo concepts\n")
        f.write("delete from RHN_BD_CONCEPT_ALIAS where ID_CONCEPT in (select ID_CONCEPT from RHN_BD_CONCEPT where ID_CODE_SYSTEM = 362387869795001);\n")
        f.write("delete from RHN_HPL_DISEASE_MGMT_MEMBER where ID_CONCEPT in (select ID_CONCEPT from RHN_BD_CONCEPT where ID_CODE_SYSTEM = 362387869795001);\n")
        f.write("delete from RHN_BD_CONCEPT where ID_CODE_SYSTEM = 362387869795001;\n\n")

        # Update code system metadata
        f.write("-- 2. Update Code System metadata to National Healthcare Security ICD-10 v2.0\n")
        f.write("update RHN_BD_CODE_SYSTEM\n")
        f.write("set NA_CODE_SYSTEM = 'ICD-10 疾病分类（国家医保版 2.0）',\n")
        f.write("    PUBLSHR = '国家医疗保障局',\n")
        f.write("    DES_CODE_SYSTEM = '国家医疗保障疾病诊断分类与代码 (ICD-10 医保版 2.0)，收录国家标准章节、类目、亚目与细目全量诊断目录',\n")
        f.write("    DT_UPDATED = to_timestamp_tz('2026-09-25 12:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS.FF TZH:TZM')\n")
        f.write("where ID_CODE_SYSTEM = 362387869795001;\n\n")

        # Single row inserts for Oracle compatibility
        f.write("-- 3. Insert full national standard ICD-10 concepts\n")
        for r in records:
            f.write(f"insert into RHN_BD_CONCEPT values ({r['id']}, {r['id_code_system']}, {escape_sql(r['code'])}, "
                    f"{escape_sql(r['name'])}, {escape_sql(r['desc'])}, '{r['status']}', date '{r['effective_from']}', null, "
                    f"{r['created_at_ora']}, '{r['concept_type']}', {escape_sql(r['short_name'])}, "
                    f"{escape_sql(r['chapter_cd'])}, {escape_sql(r['chapter_na'])}, {escape_sql(r['search'])}, "
                    f"'{r['src_type']}', null, {r['revision']}, {r['updated_at_ora']});\n")

        f.write("\n-- 4. Re-bind baseline disease management members\n")
        f.write("insert into RHN_HPL_DISEASE_MGMT_MEMBER values (362387870124001, 362387870123001, 362387869795011, 'ACTIVE', date '2026-01-01', null, 'ICD-10 I10 高血压管理', to_timestamp_tz('2026-09-15 13:51:07.52759 +08:00', 'YYYY-MM-DD HH24:MI:SS.FF TZH:TZM'), 'INCLUDE');\n")
        f.write("insert into RHN_HPL_DISEASE_MGMT_MEMBER values (362387870124002, 362387870123002, 362387869795012, 'ACTIVE', date '2026-01-01', null, 'ICD-10 E11.9 糖尿病管理', to_timestamp_tz('2026-09-15 13:51:07.52759 +08:00', 'YYYY-MM-DD HH24:MI:SS.FF TZH:TZM'), 'INCLUDE');\n\n")

        f.write("-- 5. Re-bind baseline clinical aliases\n")
        for a in old_aliases:
            f.write(f"insert into RHN_BD_CONCEPT_ALIAS values ({a});\n")

    pg_size = os.path.getsize(TARGET_PG_PATH) / (1024 * 1024)
    ora_size = os.path.getsize(TARGET_ORA_PATH) / (1024 * 1024)
    print(f"Generated successfully!\n  PG/H2: {TARGET_PG_PATH} ({pg_size:.2f} MB)\n  Oracle: {TARGET_ORA_PATH} ({ora_size:.2f} MB)")

if __name__ == '__main__':
    main()
