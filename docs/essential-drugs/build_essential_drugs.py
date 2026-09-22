#!/usr/bin/env python3
"""Build a traceable reference catalog. Never infer prescribing instructions.

Run from any directory. Requires python-docx and pypinyin. No database writes.
The supplied document's official publication status is deliberately unverified.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter
from decimal import Decimal
from pathlib import Path
from extract_essential_source import extract_rows, extract_notes

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SOURCE = ROOT / 'docs/国家基本药物目录（2026年版）.docx'
RESOURCE = ROOT / 'backend/rhn-platform/src/main/resources/medication-standard-catalog.json'
# These are scope entries, as stated by the supplied document's numbered notes.
SCOPE_SEQUENCES = {35, 51, 56, 292, 429, 431, 471}
# Preserve release characteristics and route-specific dosage forms as distinct concepts.
FORMS = {
 '片剂': ('TABLET', '片'), '分散片': ('DISPERSIBLE_TABLET', '片'),
 '咀嚼片': ('CHEWABLE_TABLET', '片'), '肠溶片': ('ENTERIC_TABLET', '片'),
 '缓释片': ('EXTENDED_RELEASE_TABLET', '片'), '控释片': ('CONTROLLED_RELEASE_TABLET', '片'),
 '肠溶缓释片': ('ENTERIC_EXTENDED_TABLET', '片'), '舌下片': ('SUBLINGUAL_TABLET', '片'),
 '泡腾片': ('EFFERVESCENT_TABLET', '片'), '口崩片': ('ORODISPERSIBLE_TABLET', '片'),
 '胶囊': ('CAPSULE', '粒'), '软胶囊': ('SOFT_CAPSULE', '粒'),
 '肠溶胶囊': ('ENTERIC_CAPSULE', '粒'), '缓释胶囊': ('EXTENDED_RELEASE_CAPSULE', '粒'),
 '颗粒剂': ('GRANULE', None), '缓释颗粒': ('EXTENDED_RELEASE_GRANULE', None),
 '干混悬剂': ('DRY_SUSPENSION', None), '肠溶干混悬剂': ('ENTERIC_DRY_SUSPENSION', None),
 '口服溶液剂': ('ORAL_SOLUTION', None), '混悬液': ('SUSPENSION', None),
 '合剂': ('MIXTURE', None), '糖浆剂': ('SYRUP', None),
 '散剂': ('POWDER', None), '粉剂': ('POWDER_FORM', None), '丸剂': ('PILL', '丸'),
 '滴丸剂': ('DROPPING_PILL', '丸'), '口溶膜': ('ORAL_FILM', '片'),
 '注射液': ('INJECTION', None), '氯化钠注射液': ('SODIUM_CHLORIDE_INJECTION', None),
 '葡萄糖注射液': ('GLUCOSE_INJECTION', None), '乳状注射液': ('INJECTION_EMULSION', None),
 '注射用无菌粉末': ('POWDER_FOR_INJECTION', None), '注射用浓溶液': ('CONCENTRATE_FOR_INJECTION', None),
 '乳膏剂': ('CREAM', None), '软膏剂': ('OINTMENT', None), '凝胶剂': ('GEL', None),
 '胶浆剂': ('MUCILAGE', None), '外用溶液剂': ('TOPICAL_SOLUTION', None),
 '贴剂': ('PATCH', '贴'), '贴膏剂': ('PLASTER', '贴'), '酊剂': ('TINCTURE', None),
 '煎膏剂': ('ELECTUARY', None), '酒剂': ('MEDICINAL_WINE', None),
 '洗剂': ('LOTION', None), '涂剂': ('LINIMENT', None),
 '滴眼剂': ('EYE_DROPS', None), '眼膏剂': ('EYE_OINTMENT', None),
 '眼用凝胶': ('EYE_GEL', None), '眼用注射液': ('EYE_INJECTION', None),
 '滴鼻剂': ('NASAL_DROPS', None), '滴耳剂': ('EAR_DROPS', None), '滴剂': ('DROPS_UNSPECIFIED', None),
 '气雾剂': ('AEROSOL', None), '吸入气雾剂': ('INHALATION_AEROSOL', None),
 '吸入粉雾剂': ('INHALATION_POWDER', None), '吸入溶液剂': ('INHALATION_SOLUTION', None),
 '吸入用溶液': ('SOLUTION_FOR_INHALATION', None), '雾化吸入用混悬液': ('NEBULISER_SUSPENSION', None),
 '喷雾剂': ('SPRAY', None), '鼻喷雾剂': ('NASAL_SPRAY', None),
 '灌肠剂': ('ENEMA', None), '栓剂': ('SUPPOSITORY', '枚'),
 '阴道片': ('VAGINAL_TABLET', '片'), '阴道泡腾片': ('VAGINAL_EFFERVESCENT_TABLET', '片'),
 '阴道软胶囊': ('VAGINAL_SOFT_CAPSULE', '粒'), '膏药': ('MEDICATED_PLASTER', None),
}
ALIASES = {'片':'片剂','胶囊剂':'胶囊','缓释片剂':'缓释片','缓释胶囊剂':'缓释胶囊','口服液':'合剂','颗粒':'颗粒剂','丸':'丸剂'}
CLINICAL_FIELDS = ('defaultDose','defaultDoseUnit','defaultRoute','defaultFrequency','skinTestRequired',
                   'antimicrobial','antimicrobialLevel','prescriptionDrug','storageType','chronicDiseaseDrug')


def norm(text: str) -> str:
    # Retain semantics, normalize OCR spacing and full-width punctuation only.
    s = unicodedata.normalize('NFKC', text).replace('∶', ':').replace('μ', 'u').replace('µ', 'u')
    s = re.sub(r'(?<=\d)\s*\.\s*(?=\d)', '.', s)
    # Adjacent numbers may be a substance suffix and its dose (D3 200 IU).
    # Keep that boundary; ambiguous OCR-separated integers require review.
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'(?<=\d)\s+(?=[a-zA-Z%])', '', s)
    s = re.sub(r'(?<=\d)\s+(?=万单位|单位)', '', s)
    s = re.sub(r'\s*([:()])\s*', r'\1', s)
    s = re.sub(r'(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])', '', s)
    return s


def split_top(text: str, delimiters: str) -> list[str]:
    out, start, depth = [], 0, 0
    for i, ch in enumerate(text):
        if ch in '([': depth += 1
        elif ch in ')]': depth = max(0, depth-1)
        elif ch in delimiters and not depth:
            if text[start:i].strip(): out.append(text[start:i].strip())
            start = i+1
    if text[start:].strip(): out.append(text[start:].strip())
    return out


def stable_id(prefix: str, *parts: str) -> str:
    key = '|'.join(norm(p) for p in parts)
    return prefix + hashlib.sha256(key.encode()).hexdigest()[:24].upper()


def forms(header: str) -> list[dict]:
    header = norm(header)
    # Expand explicit shared release modifiers without treating salt notes as release forms.
    for modifier in ['肠溶','缓释','控释']:
        header = re.sub(modifier+r'\((片剂、胶囊)\)', modifier+'片、'+modifier+'胶囊', header)
    result = []
    salt = ''
    for piece in split_top(header, '、,'):
        match = re.match(r'^\(([^)]+)\)(.*)$', piece)
        if match:
            salt, piece = match.groups()
        piece = ALIASES.get(piece, piece)
        if piece not in FORMS:
            return []  # Do not guess from a substring or silently discard qualifiers.
        code, unit = FORMS[piece]
        result.append({'doseForm':code, 'doseFormName':piece, 'substanceQualifier':salt, 'presentationUnit':unit})
    return result


def spec_blocks(text: str) -> list[tuple[str,str]]:
    # The DOCX wraps lines within a block. A new line is a block only if its header is a known form.
    text = norm(text.replace('\n','\n'))
    blocks = []
    for segment in split_top(text, ';；'):
        # Some OCR paragraphs lost semicolons; detect a known form followed by a colon.
        positions = []
        depth=0
        for i,ch in enumerate(segment):
            if ch=='(': depth+=1
            elif ch==')': depth=max(0,depth-1)
            elif ch==':' and depth==0: positions.append(i)
        if not positions:
            blocks.append((segment,'')); continue
        first=positions[0]
        blocks.append((segment[:first],segment[first+1:]))
    return blocks


def numeric(value: str) -> str:
    return format(Decimal(value).normalize(), 'f')


def specification_alternatives(body: str) -> list[str]:
    # Ingredient lists are a single composition, not alternative products.
    if re.search(r'每[^,、;]*含', body):
        return [body]
    result = []
    prefix = ''
    for token in split_top(body, '、,'):
        match = re.match(r'(每[^\d]*?(?:装|重)|每\s*\d+\s*[^\d]*?(?:装|重))\s*', token)
        if match:
            prefix = match.group(0).strip()
        elif prefix and re.match(r'^\d+(?:\.\d+)?(?:mg|g|ml|mL)', token):
            token = prefix + token
        else:
            prefix = ''
        result.append(token)
    return result


def amount(text: str):
    m = re.fullmatch(r'(\d+(?:\.\d+)?)(mg|g|ug|mL|ml|L|l|IU|万单位|单位|mmol|%)',text.strip())
    if not m:return None
    value,unit=m.groups();unit={'ml':'mL','l':'L'}.get(unit,unit)
    if Decimal(value)<=0:return None
    return {'value':numeric(value),'unit':unit}


def strength(spec: str, part: str) -> dict:
    if part != 'WESTERN':
        return {'kind':'TRADITIONAL_PRESENTATION','numerator':None,'denominator':None,'components':[], 'computable':False}
    # Parentheses are retained in original text; equivalence claims are never used as conversion factors.
    plain = re.sub(r'\([^()]*\)', '', norm(spec)).strip()
    single = amount(plain)
    if single:
        if single['unit'] in ['mL','L']:
            return {'kind':'PRESENTATION_VOLUME','numerator':None,'denominator':single,'components':[], 'computable':False}
        if single['unit']=='%':
            return {'kind':'PERCENT_UNSPECIFIED_BASIS','numerator':single,'denominator':None,'components':[], 'computable':False}
        return {'kind':'AMOUNT_PER_PRESENTATION','numerator':single,'denominator':None,'components':[], 'computable':True}
    pair=split_top(plain, ':')
    vals=[amount(x) for x in pair]
    if len(vals)==2 and all(vals):
        if vals[0]['unit'] in ['mL','L'] and vals[1]['unit'] not in ['mL','L','%']:
            return {'kind':'CONCENTRATION','numerator':vals[1],'denominator':vals[0],'components':[], 'computable':True}
        if all(v['unit'] not in ['mL','L','%'] for v in vals):
            return {'kind':'MULTI_COMPONENT','numerator':None,'denominator':None,
                    'components':[{'ordinal':i+1,**v} for i,v in enumerate(vals)], 'computable':False}
    return {'kind':'TEXT_REQUIRES_REVIEW','numerator':None,'denominator':None,'components':[], 'computable':False}


def build_catalog(source=SOURCE):
    rows=extract_rows(source)
    notes=extract_notes(source)
    grouped={}
    for row in rows: grouped.setdefault(row['code'],[]).append(row)
    source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    entries=[];specifications=[];issues=[]
    for old_code, group in grouped.items():
        row=next((x for x in group if not x['is_duplicate']),group[0])
        name=norm(row['cn_name'])
        eid=stable_id('GEN-',row['part'],name)
        scope=row['part']=='WESTERN' and row['num'] in SCOPE_SEQUENCES
        raw_spec=row['spec']
        note_match=re.search(r'注释\s*(\d+)',row['note'])
        note=notes.get((row['part'],int(note_match.group(1)))) if note_match else None
        # Preserve original and normalized text, and all cross-category source occurrences.
        entry={'id':eid,'legacyCode':old_code,'name':name,'innName':norm(row['en_name']),
            'pinyinCode':row['pinyin_code'],'medicationType':row['part'],
            'entryType':'SCOPE' if scope else 'MEDICATION',
            'sourceSpecification':raw_spec,'sourceNote':note['text'] if note else row['note'],
            'sourceNoteLocation':note['location'] if note else None,
            'specialistGuidance':any(x['has_guidance'] for x in group),
            'sourceLocations':[x['sourceLocation'] for x in group],
            'categories':[{'major':x['major_cat'],'sub':x['sub_cat'],'function':x['func']} for x in group],
            'sourceVersion':source_hash,'semanticVersion':1,'reviewStatus':'SOURCE_UNVERIFIED',
            'orderable':False}
        entries.append(entry)
        if scope:
            issues.append({'entryId':eid,'legacyCode':old_code,'name':name,'reason':'SCOPE_NOT_ORDERABLE','sourceText':raw_spec})
            continue
        seen=set()
        # Use the source extractor's conservative line join, which keeps explicit block boundaries.
        from extract_essential_source import clean_spec_display
        for header, body in spec_blocks(clean_spec_display(raw_spec)):
            parsed=forms(header)
            if not parsed or not body:
                issues.append({'entryId':eid,'legacyCode':old_code,'name':name,'reason':'FORM_OR_SPEC_REQUIRES_REVIEW',
                               'sourceText':(header+(':'+body if body else ''))})
                continue
            specs=specification_alternatives(body)
            for f in parsed:
                for text in specs:
                    text=norm(text)
                    sid=stable_id('STD-',eid,f['substanceQualifier'],f['doseForm'],text)
                    if sid in seen:continue
                    seen.add(sid)
                    s=strength(text,row['part'])
                    # A ratio or a source list is retained, never collapsed into one scalar strength.
                    record={'id':sid,'entryId':eid,'legacyCode':old_code,'name':name,
                        'medicationType':row['part'],**f,'specification':text,'strength':s,
                        'semanticVersion':1,'sourceVersion':source_hash,'sourceLocations':entry['sourceLocations'],
                        'sourceBlock':header+':'+body,
                        'reviewStatus':'SOURCE_UNVERIFIED','orderable':False,
                        'clinicalAttributes':{key:None for key in CLINICAL_FIELDS}}
                    specifications.append(record)
                    if s['kind'] in ['TEXT_REQUIRES_REVIEW','MULTI_COMPONENT','PERCENT_UNSPECIFIED_BASIS']:
                        issues.append({'entryId':eid,'specificationId':sid,'legacyCode':old_code,'name':name,
                                       'reason':s['kind'],'sourceText':text})
    catalog={'schemaVersion':1,'catalogId':'RHN-MEDICATION-REFERENCE','catalogVersion':'1.0.0',
        'source':{'title':'国家基本药物目录（2026年版）','suppliedFile':source.name,
            'sha256':source_hash,'claimedEdition':'2026','verificationStatus':'UNVERIFIED',
            'officialUrl':None,'publicationNumber':None,'effectiveFrom':None,
            'note':'依据用户提供文件整理；标题年份不代表已核实官方发布。'},
        'scopeNote':'中药饮片按原文范围说明收录，未伪造具体饮片品种。',
        'entries':entries,'specifications':sorted(specifications,key=lambda x:(x['legacyCode'],x['doseForm'],x['specification'])),
        'issues':issues}
    catalog['statistics']={'sourceRows':len(rows),'entries':len(entries),
        'westernEntries':sum(x['medicationType']=='WESTERN' for x in entries),
        'traditionalEntries':sum(x['medicationType']=='CHINESE_PATENT' for x in entries),
        'crossCategoryRows':len(rows)-len(entries),'scopeEntries':sum(x['entryType']=='SCOPE' for x in entries),
        'specifications':len(specifications),'issues':len(issues),
        'structuredStrengths':sum(x['strength']['computable'] for x in specifications),
        'entriesWithSpecifications':len({x['entryId'] for x in specifications}),
        'orderableSpecifications':0}
    semantic=json.dumps({'entries':entries,'specifications':catalog['specifications']},ensure_ascii=False,sort_keys=True,separators=(',',':'))
    catalog['contentHash']=hashlib.sha256(semantic.encode()).hexdigest()
    validate(catalog)
    return catalog, rows


def validate(catalog):
    assert catalog['statistics']['entries']==794, 'Source entry count changed; investigate before publication'
    assert catalog['statistics']['sourceRows']==816
    for key in ['entries','specifications']:
        assert len({x['id'] for x in catalog[key]})==len(catalog[key]), 'Duplicate canonical identities'
    assert catalog['statistics']['scopeEntries']==7
    scopes={x['id'] for x in catalog['entries'] if x['entryType']=='SCOPE'}
    entries={x['id'] for x in catalog['entries']}
    for spec in catalog['specifications']:
        assert spec['entryId'] in entries-scopes
        assert not spec['orderable']
        assert all(x is None for x in spec['clinicalAttributes'].values())
        assert spec['doseForm'] and spec['specification']
        assert len(split_top(spec['specification'],'、'))==1 or re.search(r'每[^,、;]*含', spec['specification'])
    covered={x['entryId'] for x in catalog['specifications']}|{x['entryId'] for x in catalog['issues']}
    assert covered==entries, 'Source entry silently lost'


def write_csv(path, headers, rows):
    with path.open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f, lineterminator='\n');writer.writerow(headers);writer.writerows(rows)


def write_outputs(catalog,rows,out=HERE,resource=RESOURCE):
    out.mkdir(parents=True,exist_ok=True)
    data=json.dumps(catalog,ensure_ascii=False,indent=2)+'\n'
    (out/'standard_medication_catalog.json').write_text(data)
    if resource:
        resource.parent.mkdir(parents=True,exist_ok=True)
        resource.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
    write_csv(out/'标准药品目录_品种.csv',
        ['标准品种ID','旧目录编码','名称','英文名称','药品类型','条目类型','原文规格','专科指导','来源位置','来源版本','审核状态'],
        [[r['id'],r['legacyCode'],r['name'],r['innName'],r['medicationType'],r['entryType'],r['sourceSpecification'],
          r['specialistGuidance'],';'.join(r['sourceLocations']),r['sourceVersion'],r['reviewStatus']] for r in catalog['entries']])
    write_csv(out/'标准药品目录_剂型规格.csv',
        ['标准药品ID','标准品种ID','旧目录编码','名称','物质限定','剂型编码','剂型名称','单一规格','强度类型','分子数值','分子单位','分母数值','分母单位','多成分数值','审核状态','可开立'],
        [[r['id'],r['entryId'],r['legacyCode'],r['name'],r['substanceQualifier'],r['doseForm'],r['doseFormName'],r['specification'],
          r['strength']['kind'],(r['strength']['numerator'] or {}).get('value'),(r['strength']['numerator'] or {}).get('unit'),
          (r['strength']['denominator'] or {}).get('value'),(r['strength']['denominator'] or {}).get('unit'),
          json.dumps(r['strength']['components'],ensure_ascii=False),r['reviewStatus'],'否'] for r in catalog['specifications']])
    write_csv(out/'标准药品目录_待核验.csv',['标准品种ID','旧目录编码','名称','问题类型','原文'],
        [[r['entryId'],r['legacyCode'],r['name'],r['reason'],r['sourceText']] for r in catalog['issues']])
    (out/'source_rows.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    (out/'validation_summary.json').write_text(json.dumps({'contentHash':catalog['contentHash'],**catalog['statistics'],
        'issueCounts':dict(Counter(x['reason'] for x in catalog['issues']))},ensure_ascii=False,indent=2)+'\n')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Verify committed artifacts are reproducible without writing')
    args=parser.parse_args()
    catalog,rows=build_catalog()
    if args.check:
        previous=json.loads((HERE/'standard_medication_catalog.json').read_text())
        assert previous==catalog,'Generated catalog is stale'
        assert json.loads(RESOURCE.read_text())==catalog,'Runtime resource is stale'
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            write_outputs(catalog, rows, Path(tmp), resource=None)
            for generated in Path(tmp).iterdir():
                assert generated.read_bytes()==(HERE/generated.name).read_bytes(), 'Stale output: '+generated.name
    else:write_outputs(catalog,rows)
    print(json.dumps(catalog['statistics'],ensure_ascii=False))

if __name__=='__main__':main()
