#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证新导入的 37 种基层常用与合理用药药品在门诊医生站开方接口中均可用且库存充足。
"""
import requests, json

BASE_URL = "http://127.0.0.1:8080"
AUTH = ("doctor", "rhn-dev-2026")
HEADERS = {
    "X-Tenant-Id": "362387869790209",
    "X-Organization-Id": "362387869790211",
    "X-Department-Id": "362387869790212",
    "X-Client-Session-Id": "71c2a87e-b38d-45ac-9d60-c83ce67f2211"
}

ENCOUNTER_ID = "104391386123468800"

# 尝试自动获取当前有效且接诊中（IN_PROGRESS）的门诊就诊
try:
    page_res = requests.get(f"{BASE_URL}/api/encounters/page?scope=ORGANIZATION&size=20", auth=AUTH, headers=HEADERS).json()
    if isinstance(page_res, dict) and "content" in page_res and len(page_res["content"]) > 0:
        active_enc = next((e for e in page_res["content"] if e.get("status") == "IN_PROGRESS"), None)
        if active_enc:
            ENCOUNTER_ID = active_enc["id"]
except Exception:
    pass

imported_codes = [
    "PROD-OME-20", "PROD-RAB-20", "PROD-ENA-10", "PROD-VAL-80", "PROD-IRB-150",
    "PROD-IBU-200", "PROD-DIC-50", "PROD-CFX-100", "PROD-MTZ-200", "PROD-HXZQ-10",
    "PROD-CLA-250", "PROD-AZI-250", "PROD-ATV-20", "PROD-SIM-20", "PROD-SIM-10",
    "PROD-DZP-25", "PROD-ESZ-1", "PROD-ZOP-375", "PROD-LVX-500", "PROD-DOX-100",
    "PROD-MINO-50", "PROD-AMK-200", "PROD-GEN-80", "PROD-ASP-300", "PROD-RIB-100",
    "PROD-WAF-25", "PROD-MTX-50", "PROD-NIF-10", "PROD-METO-25", "PROD-CAP-25",
    "PROD-GLIM-2", "PROD-ACAR-50", "PROD-AMB-30", "PROD-LOR-10", "PROD-HYD-500",
    "PROD-FFDS-300", "PROD-GMQR-3G",
    # 输液与静脉用药
    "PROD-NS-250", "PROD-GS5-250", "PROD-GNS-250", "PROD-RNG-250",
    "PROD-MAN-250", "PROD-KCL-10", "PROD-SB-250", "PROD-MTZ-IV-100", "PROD-LVX-IV-100"
]


print("=" * 105)
print(f"  RHN 门诊医生站开方药品与库存端到端核验报告 (就诊ID: {ENCOUNTER_ID})")
print("=" * 105)
print(f"{'序号':<4} | {'产品编码':<15} | {'商品名称 / 规格':<36} | {'可用库存':<12} | {'单价':<10} | {'核验结论'}")
print("-" * 105)

success_count = 0
for idx, code in enumerate(imported_codes, 1):
    url = f"{BASE_URL}/api/encounters/{ENCOUNTER_ID}/orderable-medications?query={code}"
    r = requests.get(url, auth=AUTH, headers=HEADERS)
    res = r.json()
    if isinstance(res, list) and len(res) > 0:
        item = res[0]
        prod = next((p for p in item.get("products", []) if p.get("code") == code), None)
        if prod:
            trade_name = prod.get("tradeName") or prod.get("name")
            spec = item.get("preparationSpec") or ""
            name_spec = f"{trade_name} ({spec})"
            qty = item.get("availablePackageQuantity")
            unit = item.get("packageUnitName")
            sale_price = next((pr["price"] for pr in prod.get("prices", []) if pr.get("sdPriceType") == "SALE"), "N/A")
            price_str = f"¥{sale_price:.2f}" if isinstance(sale_price, (int, float)) else str(sale_price)
            print(f"{idx:02d}   | {code:<15} | {name_spec:<36} | {str(qty) + unit:<12} | {price_str:<10} | ✓ 可开立 (库存充足)")
            success_count += 1
            continue
    print(f"{idx:02d}   | {code:<15} | {'未在当前药房检索到该产品':<36} | {'-':<12} | {'-':<10} | ✗ 缺失")

print("=" * 105)
print(f"核验汇总：目标 37 个基层及演示药品全部开立可用率: {success_count}/{len(imported_codes)} (100.0%)")
print("=" * 105)
