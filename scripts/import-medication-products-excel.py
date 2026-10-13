#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
读取《基层常用药品与合理用药规则产品导入表.xlsx》并执行批量导入与建档入库。
特性：
1. 幂等性：已导入的产品自动识别跳过或更新，不重复创建。
2. 完整链条建档：
   - 通用药品标准关联校验（medicationStandards.requireLinked）
   - 生产企业绑定（Manufacturer）
   - 药品产品定义（MedicationProduct）
   - 包装规格建立（ItemPackage）
   - 机构目录采纳（OrganizationCatalogItem）
   - 零售价与采购价配置（CatalogPrice）
   - 门诊药房项目登记（StockItem）
   - 门诊直接到货记账入库（DirectGoodsReceipt），生成批次与可用库存
3. 支持命令行参数：
   --apply : 正式执行导入（默认仅 dry-run 校验）
   --dry-run : 仅预检，不写入系统
   --file <path> : 自定义 Excel 文件路径
"""

import sys
import os
import argparse
import base64
import json
import urllib.request
import urllib.parse
from datetime import datetime

try:
    import openpyxl
except ImportError:
    print("错误：请先安装 openpyxl：pip3 install openpyxl")
    sys.exit(1)

# 基础配置
BASE_URL = os.environ.get("RHN_API_URL", "http://127.0.0.1:8080")
USERNAME = os.environ.get("RHN_DEV_USERNAME", "doctor")
PASSWORD = os.environ.get("RHN_DEV_PASSWORD", "rhn-dev-2026")
TENANT_ID = os.environ.get("RHN_TENANT_ID", "362387869790209")
ORGANIZATION_ID = os.environ.get("RHN_ORGANIZATION_ID", "362387869790211")
DEPARTMENT_ID = os.environ.get("RHN_DEPARTMENT_ID", "362387869790212")
PHARMACY_DEPT_ID = "362387869799103"  # 门诊药房科室ID
OUTPATIENT_SITE_ID = 362387869799502  # 门诊药房站点ID
OUTPATIENT_BIN_ID = 362387869799602   # 门诊药房发药柜台货位ID

AUTH_HEADER = f"Basic {base64.b64encode(f'{USERNAME}:{PASSWORD}'.encode()).decode()}"

def api_call(method, endpoint, body=None, dept_id=DEPARTMENT_ID):
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "Authorization": AUTH_HEADER,
        "X-Tenant-Id": str(TENANT_ID),
        "X-Organization-Id": str(ORGANIZATION_ID),
        "X-Department-Id": str(dept_id),
        "X-Client-Session-Id": "71c2a87e-b38d-45ac-9d60-c83ce67f2211"
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else None
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
            msg = f"{err_json.get('code')}: {err_json.get('message')}"
        except Exception:
            msg = err_body
        raise RuntimeError(f"HTTP {err.code} {method} {endpoint} 失败: {msg}")

def load_manufacturers():
    data = api_call("GET", "/api/platform/master-data/manufacturers")
    return {m["name"]: int(m["id"]) for m in data}

def find_medication_by_code(code):
    data = api_call("GET", f"/api/platform/master-data/medications?query={urllib.parse.quote(code)}")
    for m in data:
        if m.get("code") == code:
            return m
    return None

def find_product_by_code(code):
    data = api_call("GET", f"/api/platform/master-data/medication-products/search?query={urllib.parse.quote(code)}")
    for item in data.get("content", []):
        prod = item.get("product", {})
        if prod.get("code") == code:
            return prod
    return None

def ensure_supplier():
    suppliers = api_call("GET", f"/api/pharmacy/suppliers?organizationId={ORGANIZATION_ID}", dept_id=PHARMACY_DEPT_ID)
    for s in suppliers:
        if s.get("code") == "SUP-SHOWCASE":
            return int(s["id"])
    res = api_call("POST", "/api/pharmacy/suppliers", {
        "organizationId": int(ORGANIZATION_ID),
        "code": "SUP-SHOWCASE",
        "name": "华康医药配送有限公司",
        "unifiedCreditCode": "91330100SHOWCASE01",
        "licenseNo": "浙AA5710001",
        "licenseValidTo": "2029-12-31",
        "contactName": "王敏",
        "contactPhone": "13800001234",
        "validFrom": "2026-01-01"
    }, dept_id=PHARMACY_DEPT_ID)
    return int(res["id"])

def ensure_stock_item(catalog_item_id, package_id):
    items = api_call("GET", f"/api/pharmacy/stock-sites/{OUTPATIENT_SITE_ID}/stock-items", dept_id=PHARMACY_DEPT_ID)
    for it in items:
        if int(it.get("catalogItemId")) == int(catalog_item_id):
            return int(it["id"])
    res = api_call("POST", f"/api/pharmacy/stock-sites/{OUTPATIENT_SITE_ID}/stock-items", {
        "catalogItemId": int(catalog_item_id),
        "packageId": int(package_id),
        "issuePolicy": "FEFO",
        "negativeAllowed": False,
        "lotRequired": True,
        "traceRequired": False,
        "splitAllowed": True,
        "coldChain": False,
        "controlled": False,
        "controlLevel": None,
        "highAlert": False
    }, dept_id=PHARMACY_DEPT_ID)
    return int(res["id"])

def read_excel_rows(excel_path):
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    ws = wb["药品产品导入主表"]
    rows = []
    for r in range(2, ws.max_row + 1):
        med_code = ws.cell(row=r, column=2).value
        if not med_code:
            continue
        rows.append({
            "row_idx": r,
            "med_code": str(med_code).strip(),
            "med_name": str(ws.cell(row=r, column=3).value or "").strip(),
            "med_type": str(ws.cell(row=r, column=4).value or "WESTERN").strip(),
            "dose_form": str(ws.cell(row=r, column=5).value or "").strip(),
            "spec": str(ws.cell(row=r, column=6).value or "").strip(),
            "mfr_name": str(ws.cell(row=r, column=7).value or "").strip(),
            "prod_code": str(ws.cell(row=r, column=8).value or "").strip(),
            "trade_name": str(ws.cell(row=r, column=9).value or "").strip(),
            "approval_code": str(ws.cell(row=r, column=10).value or "").strip(),
            "pkg_spec": str(ws.cell(row=r, column=11).value or "").strip(),
            "pkg_unit": str(ws.cell(row=r, column=12).value or "盒").strip(),
            "factor": float(ws.cell(row=r, column=13).value or 1),
            "sale_price": float(ws.cell(row=r, column=14).value or 10.0),
            "purchase_price": float(ws.cell(row=r, column=15).value or 8.0),
            "shelf_life": int(ws.cell(row=r, column=16).value or 24),
            "initial_stock": int(ws.cell(row=r, column=17).value or 50),
            "indication": str(ws.cell(row=r, column=18).value or "").strip(),
            "instruction": str(ws.cell(row=r, column=19).value or "").strip(),
            "rule_tag": str(ws.cell(row=r, column=20).value or "").strip(),
            "scenario": str(ws.cell(row=r, column=21).value or "").strip(),
        })
    return rows

def main():
    parser = argparse.ArgumentParser(description="RHN 基层常用药品与合理用药规则产品信息批量导入工具")
    parser.add_argument("--file", default="docs/architecture/rational-medication/基层常用药品与合理用药规则产品导入表.xlsx",
                        help="Excel 文件路径")
    parser.add_argument("--apply", action="store_true", help="是否正式执行写入（默认为 dry-run 预检模式）")
    parser.add_argument("--no-stock", action="store_true", help="仅建立产品与价格，不生成期初库存")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    excel_path = os.path.join(project_root, args.file) if not os.path.isabs(args.file) else args.file

    if not os.path.exists(excel_path):
        print(f"错误：未找到 Excel 文件 {excel_path}")
        sys.exit(1)

    print("=" * 110)
    print(f"  RHN 药品产品信息批量导入与建档服务 ({'正式写入模式 [APPLY]' if args.apply else '预检模式 [DRY-RUN]'})")
    print(f"  数据来源文件: {excel_path}")
    print(f"  服务目标: {BASE_URL} (Tenant: {TENANT_ID}, Org: {ORGANIZATION_ID})")
    print("=" * 110)

    rows = read_excel_rows(excel_path)
    print(f"成功读取待处理记录：{len(rows)} 条")

    # 1. 预检生产企业与基础字典
    mfr_map = load_manufacturers()
    print(f"已加载生产企业：{list(mfr_map.keys())}")

    supplier_id = None
    if args.apply and not args.no_stock:
        supplier_id = ensure_supplier()
        print(f"已确认药房配送供应商 ID: {supplier_id}")

    created_products = 0
    reused_products = 0
    stocked_products = 0
    errors = 0

    print("\n" + f"{'序号':<4} | {'产品编码':<15} | {'商品名称':<22} | {'通用药编码':<16} | {'标准状态':<8} | {'操作状态'}")
    print("-" * 110)

    stock_receipt_lines = []

    for item in rows:
        idx = item["row_idx"] - 1
        prod_code = item["prod_code"]
        med_code = item["med_code"]
        trade_name = item["trade_name"]

        # 检查通用药品
        med = find_medication_by_code(med_code)
        if not med:
            print(f"{idx:<4} | {prod_code:<15} | {trade_name:<22} | {med_code:<16} | {'未建档':<8} | [ERROR] 未找到通用药品档案")
            errors += 1
            continue

        std_status = med.get("standardReference", {}).get("status", "UNMAPPED")
        if std_status != "LINKED":
            print(f"{idx:<4} | {prod_code:<15} | {trade_name:<22} | {med_code:<16} | {std_status:<8} | [ERROR] 标准关联状态不是 LINKED")
            errors += 1
            continue

        mfr_id = mfr_map.get(item["mfr_name"])
        if not mfr_id:
            mfr_id = list(mfr_map.values())[0]

        # 检查产品是否已存在
        existing_prod = find_product_by_code(prod_code)
        target_prod_id = None
        target_pkg_id = None

        if existing_prod:
            target_prod_id = int(existing_prod["id"])
            pkgs = existing_prod.get("packages", [])
            target_pkg_id = int(pkgs[0]["id"]) if pkgs else None
            status_desc = f"[REUSE] 产品已存在(ID: {target_prod_id})"
            reused_products += 1
        else:
            if args.apply:
                # 构造 ProductSetupRequest 请求体
                unit_code_map = {"盒": "BOX", "瓶": "BOTTLE", "支": "BRANCH", "袋": "BAG", "粒": "GRAIN", "片": "PIECE"}
                pkg_unit_code = unit_code_map.get(item["pkg_unit"], "BOX")
                setup_body = {
                    "product": {
                        "medicationId": int(med["id"]),
                        "manufacturerId": mfr_id,
                        "code": prod_code,
                        "tradeName": trade_name,
                        "approvalCode": item["approval_code"] or None,
                        "traceCode": None,
                        "approvalFrom": "2025-01-01",
                        "approvalTo": "2030-12-31",
                        "registrationCode": None,
                        "registrationFrom": None,
                        "registrationTo": None,
                        "purchaseCode": f"PUR-{prod_code}",
                        "sdMarketStatus": "MARKETED",
                        "sdProductionPlace": "DOMESTIC",
                        "otc": False,
                        "centralPurchase": True,
                        "importAllowed": False,
                        "traceSplitRequired": False,
                        "orderable": True,
                        "chargeable": True,
                        "stocked": True,
                        "shelfLifeValue": item["shelf_life"],
                        "sdShelfLifeUnit": "MONTH",
                        "sdStatus": "ACTIVE",
                        "validFrom": "2026-01-01",
                        "validTo": None,
                        "indication": item["indication"] or None,
                        "instruction": item["instruction"] or None
                    },
                    "packaging": {
                        "basePackageId": None,
                        "unitCode": pkg_unit_code,
                        "unitName": item["pkg_unit"],
                        "packageSpec": item["pkg_spec"],
                        "quantityFactor": item["factor"],
                        "sdUsageType": "SALE",
                        "barcode": f"690{item['row_idx']:010d}",
                        "defaultPurchase": True,
                        "defaultSale": True,
                        "defaultDispense": False,
                        "sdStatus": "ACTIVE",
                        "validFrom": "2026-01-01",
                        "validTo": None
                    },
                    "organization": {
                        "organizationId": int(ORGANIZATION_ID),
                        "defaultDepartmentId": int(PHARMACY_DEPT_ID),
                        "localCode": f"P-{prod_code}",
                        "localName": f"{item['med_name']} {item['spec']}",
                        "orderable": True,
                        "executable": False,
                        "chargeable": True,
                        "purchasable": True,
                        "stocked": True,
                        "dispensable": True,
                        "returnable": True,
                        "sdStatus": "ACTIVE",
                        "validFrom": "2026-01-01",
                        "validTo": None
                    },
                    "purchasePrice": round(item["purchase_price"], 2),
                    "salePrice": round(item["sale_price"], 2),
                    "priceDocumentCode": "GOV-ESSENTIAL-2026"
                }
                res = api_call("POST", "/api/platform/master-data/medication-products/setup", setup_body)
                target_prod_id = int(res["id"])
                pkgs = res.get("packages", [])
                target_pkg_id = int(pkgs[0]["id"]) if pkgs else None
                status_desc = f"[CREATE] 成功建档(ID: {target_prod_id})"
                created_products += 1
            else:
                status_desc = "[DRY-RUN] 预检通过待创建"
                created_products += 1

        print(f"{idx:<4} | {prod_code:<15} | {trade_name[:20]:<22} | {med_code:<16} | {std_status:<8} | {status_desc}")

        # 如果需要初始库存且在正式模式下
        if args.apply and not args.no_stock and target_prod_id and target_pkg_id and item["initial_stock"] > 0:
            stock_item_id = ensure_stock_item(target_prod_id, target_pkg_id)
            stock_receipt_lines.append({
                "stockItemId": stock_item_id,
                "packageId": target_pkg_id,
                "destinationBinId": OUTPATIENT_BIN_ID,
                "lotNo": f"LOT{datetime.now().strftime('%Y%m')}{idx:02d}",
                "productionDate": "2026-01-01",
                "expiryDate": "2028-12-31",
                "quantity": item["initial_stock"],
                "unitPrice": round(item["purchase_price"], 2),
                "taxRate": 0.0,
                "description": f"期初库存建档入库-{item['trade_name']}"
            })

    # 执行批量到货入库（如果处于正式模式且有入库明细）
    if args.apply and stock_receipt_lines:
        print("\n" + "=" * 110)
        print(f"正在执行门诊药房初始库存入账记账 (共 {len(stock_receipt_lines)} 项药品)...")
        # 批量分块（单批次最多50条）
        chunk_size = 50
        for i in range(0, len(stock_receipt_lines), chunk_size):
            chunk = stock_receipt_lines[i:i + chunk_size]
            req_code = f"DGR-INIT-{datetime.now().strftime('%Y%m%d%H%M%S')}-{i // chunk_size + 1}"
            receipt_body = {
                "stockSiteId": OUTPATIENT_SITE_ID,
                "supplierId": supplier_id,
                "requestCode": req_code,
                "receivedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "description": f"基层常用药品初始库存批量入库 (批次 {i // chunk_size + 1})",
                "lines": chunk
            }
            res = api_call("POST", "/api/pharmacy/direct-goods-receipts", receipt_body, dept_id=PHARMACY_DEPT_ID)
            print(f"  -> 入库单 {res.get('receiptNo')} 已记账确认 (状态: {res.get('status')})，入账行数: {len(chunk)}")
            stocked_products += len(chunk)

    print("\n" + "=" * 110)
    print("  导入结果汇总：")
    print(f"  - 总处理记录: {len(rows)} 条")
    if args.apply:
        print(f"  - 新建药品产品: {created_products} 个")
        print(f"  - 复用已有产品: {reused_products} 个")
        print(f"  - 门诊入库上架: {stocked_products} 项")
    else:
        print(f"  - 预检通过可新建: {created_products} 个")
        print(f"  - 已存在产品: {reused_products} 个")
    print(f"  - 错误/异常: {errors} 个")
    print("=" * 110)

if __name__ == "__main__":
    main()
