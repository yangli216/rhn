"""
Enrich medication-standard-catalog.json and standard_medication_catalog.json
with exact PDF physical and printed page locations using monotonic forward alignment.
"""
import json
import os
import re
import sys
import pypdf

PDF_PATH = "docs/国家基本药物目录（2026年版）.pdf"
SOURCE_ROWS_PATH = "docs/essential-drugs/source_rows.json"
CATALOG_PATH = "docs/essential-drugs/standard_medication_catalog.json"
BACKEND_CATALOG_PATH = "backend/rhn-platform/src/main/resources/medication-standard-catalog.json"

def clean(s):
    if not s:
        return ""
    return re.sub(r'[\s\(\)（）\[\]［］、，,\.:：\.-]', '', s).lower()

def main():
    if not os.path.exists(PDF_PATH):
        print(f"Error: {PDF_PATH} does not exist", file=sys.stderr)
        sys.exit(1)

    reader = pypdf.PdfReader(PDF_PATH)
    total_pages = len(reader.pages)
    print(f"Loaded PDF with {total_pages} pages.")

    with open(SOURCE_ROWS_PATH, "r", encoding="utf-8") as f:
        source_rows = json.load(f)

    # Pre-extract cleaned page texts
    pages_text = {}
    for p in range(1, total_pages + 1):
        txt = reader.pages[p - 1].extract_text() or ""
        pages_text[p] = clean(txt)

    row_to_page = {}
    current_page = 13
    unmapped = []

    for r in source_rows:
        loc = r["sourceLocation"]
        is_w = r.get("part") == "WESTERN"
        if not is_w and current_page < 84:
            current_page = 84
        end_p = 84 if is_w else 138

        spec = r.get("spec", "")
        spec_clean = clean(spec)[:20]
        name_clean = clean(r.get("cn_name", ""))
        code = r.get("code", "")

        # Special overrides for specific glyph/character differences
        if code == "MED-2026-W026":
            name_clean = "复方磺胺"
        elif code == "MED-2026-W084":
            name_clean = "美沙拉秦"
        elif code == "MED-2026-W269":
            name_clean = "坦洛新"
        elif code == "MED-2026-W384":
            name_clean = "三氧化二砷"

        found_page = None
        for p in range(current_page, end_p + 1):
            txt = pages_text[p]
            if name_clean in txt:
                if not spec_clean or spec_clean in txt:
                    found_page = p
                    break

        if not found_page:
            for p in range(current_page, end_p + 1):
                if name_clean in pages_text[p]:
                    found_page = p
                    break

        if found_page:
            current_page = found_page
            print_page = found_page - 12
            row_to_page[loc] = {
                "location": loc,
                "page": found_page,
                "printPage": print_page
            }
        else:
            unmapped.append((loc, code, r.get("cn_name")))

    print(f"Mapped {len(row_to_page)} / {len(source_rows)} source rows to PDF pages.")
    if unmapped:
        print(f"Unmapped rows ({len(unmapped)}):", unmapped)
        sys.exit(1)

    # Now enrich standard_medication_catalog.json and backend catalog
    for cat_path in [CATALOG_PATH, BACKEND_CATALOG_PATH]:
        if not os.path.exists(cat_path):
            print(f"Warning: {cat_path} does not exist, skipping.")
            continue
        with open(cat_path, "r", encoding="utf-8") as f:
            catalog = json.load(f)

        for entry in catalog.get("entries", []):
            locs = entry.get("sourceLocations", [])
            pdf_locs = []
            for loc in locs:
                if loc in row_to_page:
                    pdf_locs.append(row_to_page[loc])
                else:
                    print(f"Warning: loc {loc} not in row_to_page for entry {entry['id']}")
            entry["pdfLocations"] = pdf_locs

        with open(cat_path, "w", encoding="utf-8") as f:
            json.dump(catalog, f, ensure_ascii=False, indent=2)
        print(f"Successfully enriched {cat_path} with pdfLocations.")

if __name__ == "__main__":
    main()
