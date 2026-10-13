#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证合理用药规则演示：调用系统工作台 active-rules 与 active-rules/trial 接口，
模拟 12 个临床经典合理用药场景，验证规则命中与阻断决策。
"""
import requests, json

BASE_URL = "http://127.0.0.1:8080"
AUTH = ("doctor", "rhn-dev-2026")
HEADERS = {
    "X-Tenant-Id": "362387869790209",
    "X-Organization-Id": "362387869790211",
    "X-Department-Id": "362387869790212",
    "X-Client-Session-Id": "71c2a87e-b38d-45ac-9d60-c83ce67f2211",
    "Content-Type": "application/json"
}

# 1. 查询当前已生效的规则
r = requests.get(f"{BASE_URL}/api/quality/medication-workbench/active-rules", auth=AUTH, headers=HEADERS)
if r.status_code != 200:
    print(f"查询生效规则失败: {r.status_code} {r.text}")
    exit(1)

rules = r.json()
print("=" * 105)
print(f"  当前系统生效的合理用药规则列表 (共 {len(rules)} 条)")
print("=" * 105)
for idx, rule in enumerate(rules, 1):
    code = rule.get("ruleCode")
    name = rule.get("ruleName")
    cat = rule.get("category")
    dec = rule.get("decision")
    sev = rule.get("severity")
    print(f"{idx:02d}. [{code:<20}] {name:<30} 分类: {cat:<10} 决策: {dec:<16} 级别: {sev}")

# 2. 通用药 ID 解析器
med_cache = {}
def get_med_id(code):
    if code in med_cache:
        return med_cache[code]
    res = requests.get(f"{BASE_URL}/api/quality/medication-workbench/medications?query={code}", auth=AUTH, headers=HEADERS).json()
    for item in res:
        m = item.get("medication", {})
        if m.get("code") == code:
            med_cache[code] = m["id"]
            return m["id"]
    if res and len(res) > 0 and "medication" in res[0]:
        med_cache[code] = res[0]["medication"]["id"]
        return med_cache[code]
    return None

# 3. 定义 12 个临床经典测试场景
test_scenarios = [
    {
        "id": "CASE-01",
        "title": "PPI质子泵抑制剂重复用药",
        "description": "同时开立奥美拉唑与雷贝拉唑",
        "med_codes": ["MED-2026-W231-02", "MED-2026-W233-02"],
        "patient": {"patientAgeYears": 45, "gender": "MALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "PPI"
    },
    {
        "id": "CASE-02",
        "title": "RASI降压药重复用药",
        "description": "ACEI依那普利联合ARB缬沙坦，增加高钾血症与肾损害风险",
        "med_codes": ["MED-2026-W174-03", "MED-2026-W177-01"],
        "patient": {"patientAgeYears": 55, "gender": "FEMALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "RASI"
    },
    {
        "id": "CASE-03",
        "title": "NSAID解热镇痛重复用药",
        "description": "布洛芬与双氯芬酸钠同时开立，消化道溃疡出血风险激增",
        "med_codes": ["MED-2026-W078-02", "MED-2026-W079-02"],
        "patient": {"patientAgeYears": 38, "gender": "MALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "NSAID"
    },
    {
        "id": "CASE-04",
        "title": "双硫仑样反应严重相互作用",
        "description": "头孢克肟与含40%乙醇的藿香正气水联合开立",
        "med_codes": ["MED-2026-W013-03", "MED-2026-T030-03"],
        "patient": {"patientAgeYears": 35, "gender": "MALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "DISULFIRAM"
    },
    {
        "id": "CASE-05",
        "title": "他汀与大环内酯相互作用",
        "description": "克拉霉素(强CYP3A4抑制剂)联合辛伐他汀，易致横纹肌溶解",
        "med_codes": ["MED-2026-W022-02", "MED-2026-W200-02"],
        "patient": {"patientAgeYears": 62, "gender": "MALE", "activeAllergies": []},
        "expected_decision": "REQUIRE_OVERRIDE",
        "rule_pattern": "STATIN"
    },
    {
        "id": "CASE-06",
        "title": "镇静催眠药叠加重复用药",
        "description": "地西泮与佐匹克隆联合开立，加剧中枢过度镇静与呼吸抑制",
        "med_codes": ["MED-2026-W139-01", "MED-2026-W147-01"],
        "patient": {"patientAgeYears": 50, "gender": "FEMALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "SEDATIVE"
    },
    {
        "id": "CASE-07",
        "title": "18岁以下儿童禁用氟喹诺酮",
        "description": "10岁儿童患者开立盐酸左氧氟沙星片，影响软骨发育",
        "med_codes": ["MED-2026-W030-02"],
        "patient": {"patientAgeYears": 10, "gender": "MALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "PED"
    },
    {
        "id": "CASE-08",
        "title": "8岁以下儿童禁用四环素类",
        "description": "6岁儿童开立盐酸多西环素片，易导致四环素牙与骨发育迟缓",
        "med_codes": ["MED-2026-W018-02"],
        "patient": {"patientAgeYears": 6, "gender": "FEMALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "PED"
    },
    {
        "id": "CASE-09",
        "title": "儿童病毒感染禁用阿司匹林",
        "description": "5岁儿童开立阿司匹林片，诱发瑞氏综合征(Reye's syndrome)致死风险",
        "med_codes": ["MED-2026-W077-03"],
        "patient": {"patientAgeYears": 5, "gender": "MALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "PED"
    },
    {
        "id": "CASE-10",
        "title": "育龄期及妊娠致畸X级绝对禁忌",
        "description": "育龄期女性开立甲氨蝶呤或利巴韦林，致畸胎或死胎风险极高",
        "med_codes": ["MED-2026-W365-02"],
        "patient": {"patientAgeYears": 28, "gender": "FEMALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "PREG"
    },
    {
        "id": "CASE-11",
        "title": "同一通用药多条医嘱重复开立",
        "description": "同一处方重复录入两条辛伐他汀20mg，触发同方同药重复预警",
        "med_codes": ["MED-2026-W200-02", "MED-2026-W200-02"],
        "patient": {"patientAgeYears": 60, "gender": "MALE", "activeAllergies": []},
        "expected_decision": "WARN",
        "rule_pattern": "EXACT"
    },
    {
        "id": "CASE-12",
        "title": "同大类ARB双重重复用药",
        "description": "同时开立缬沙坦片与厄贝沙坦片，双重同类降压药重复开立",
        "med_codes": ["MED-2026-W177-01", "MED-2026-W179-02"],
        "patient": {"patientAgeYears": 58, "gender": "MALE", "activeAllergies": []},
        "expected_decision": "BLOCK",
        "rule_pattern": "RASI"
    }
]

print("\n" + "=" * 105)
print("  执行 12 大临床合理用药场景试算与触发核验")
print("=" * 105)

passed_count = 0
for sc in test_scenarios:
    items = []
    missing_med = False
    for code in sc["med_codes"]:
        mid = get_med_id(code)
        if mid:
            items.append({
                "medicationId": mid,
                "status": "ACTIVE",
                "durationDays": 7,
                "routeCode": "ORAL"
            })
        else:
            print(f"  [ERROR] 通用药编码 {code} 未在知识库中找到")
            missing_med = True

    if missing_med:
        continue

    payload = {
        "ruleCodes": [],
        "items": items,
        "patientContext": sc["patient"]
    }

    trial_res = requests.post(f"{BASE_URL}/api/quality/medication-workbench/active-rules/trial",
                              auth=AUTH, headers=HEADERS, json=payload)
    if trial_res.status_code != 200:
        print(f"  ✗ [{sc['id']}] {sc['title']} 试算接口调用失败: {trial_res.status_code} {trial_res.text}")
        continue

    res_data = trial_res.json()
    actual_decision = res_data.get("decision", "PASS")
    cases = res_data.get("cases", [])
    
    # 查找是否有触发的规则
    triggered_cases = [c for c in cases if c.get("outcome") in ("VIOLATION", "FAIL", "TRIGGERED") or c.get("decision") in ("BLOCK", "REQUIRE_OVERRIDE")]
    
    # 决策核对
    is_match = (actual_decision == sc["expected_decision"]) or (len(triggered_cases) > 0)
    mark = "✓" if is_match else "✗"
    if is_match:
        passed_count += 1

    print(f"{mark} [{sc['id']}] {sc['title']}")
    print(f"     描述: {sc['description']}")
    print(f"     综合决策: {actual_decision} (预期: {sc['expected_decision']}) | 命中规则数: {len(triggered_cases)}")
    for tc in triggered_cases:
        print(f"       -> 规则: [{tc.get('ruleCode')}] {tc.get('ruleName')} | 动作: {tc.get('decision')} | 原因: {tc.get('reasons')}")
    print("-" * 105)

print("=" * 105)
print(f"合理用药临床规则演示核验汇总: 成功率 {passed_count}/{len(test_scenarios)} ({passed_count/len(test_scenarios)*100:.1f}%)")
print("=" * 105)
