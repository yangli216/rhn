#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成《基层常用药品与合理用药规则产品导入表.xlsx》
包含：
1. 药品产品导入主表（37个基层常用药品产品，覆盖现有全部合理用药规则）
2. 合理用药规则演示速查表（12个典型处方安全演示场景与操作配对）
3. 基层全科慢病分类索引表（按临床专病科室划分）
"""

import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# 数据集定义
PRODUCTS_DATA = [
    # 1. 质子泵抑制剂（PPI重复用药）
    {
        "med_code": "MED-2026-W231-02", "med_name": "奥美拉唑肠溶胶囊", "med_type": "WESTERN", "dose_form": "CAPSULE", "spec": "20mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-OME-20", "trade_name": "奥美拉唑肠溶胶囊（洛赛克）", "approval": "国药准字H20065432",
        "pkg_spec": "20mg*14粒/盒", "pkg_unit": "盒", "factor": 14, "sale_price": 18.50, "purchase_price": 15.00,
        "shelf_life": 24, "stock": 100, "indication": "胃溃疡、十二指肠溃疡、反流性食管炎", "instruction": "口服，一次20mg，一日1次",
        "rule_tag": "质子泵抑制剂类抑酸药（PPI重复用药）", "scenario": "【场景1-PPI重复】与雷贝拉唑同方开立，触发 REQUIRE_OVERRIDE 重复用药拦截"
    },
    {
        "med_code": "MED-2026-W233-02", "med_name": "雷贝拉唑肠溶片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "20mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-RAB-20", "trade_name": "雷贝拉唑钠肠溶片（波利特）", "approval": "国药准字H20083115",
        "pkg_spec": "20mg*14片/盒", "pkg_unit": "盒", "factor": 14, "sale_price": 28.00, "purchase_price": 22.50,
        "shelf_life": 24, "stock": 100, "indication": "活动性十二指肠溃疡、胃溃疡、GERD", "instruction": "口服，一次20mg，早晨餐前服用",
        "rule_tag": "质子泵抑制剂类抑酸药（PPI重复用药）", "scenario": "【场景1-PPI重复】与奥美拉唑同方开立，触发 REQUIRE_OVERRIDE 重复用药拦截"
    },

    # 2. RASI类降压药（ACEI与ARB重复用药）
    {
        "med_code": "MED-2026-W174-03", "med_name": "依那普利片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "10mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-ENA-10", "trade_name": "马来酸依那普利片（悦宁定）", "approval": "国药准字H19980123",
        "pkg_spec": "10mg*16片/盒", "pkg_unit": "盒", "factor": 16, "sale_price": 14.80, "purchase_price": 11.50,
        "shelf_life": 36, "stock": 120, "indication": "原发性高血压、心力衰竭", "instruction": "口服，一次10mg，一日1次",
        "rule_tag": "ACEI与ARB降压药重复用药（普利类）", "scenario": "【场景2-RASI重复】与缬沙坦/厄贝沙坦同方联用，触发 BLOCK 双重阻断高钾肾衰禁忌"
    },
    {
        "med_code": "MED-2026-W177-01", "med_name": "缬沙坦片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "80mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-VAL-80", "trade_name": "缬沙坦片（代文）", "approval": "国药准字H20040211",
        "pkg_spec": "80mg*14片/盒", "pkg_unit": "盒", "factor": 14, "sale_price": 32.50, "purchase_price": 26.00,
        "shelf_life": 36, "stock": 100, "indication": "轻中度原发性高血压", "instruction": "口服，一次80mg，一日1次",
        "rule_tag": "ACEI与ARB降压药重复用药（沙坦类）", "scenario": "【场景2-RASI重复】与依那普利同方联用，触发 BLOCK 双重阻断禁忌"
    },
    {
        "med_code": "MED-2026-W179-02", "med_name": "厄贝沙坦片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.15g",
        "mfr": "示范制药有限公司", "prod_code": "PROD-IRB-150", "trade_name": "厄贝沙坦片（安博维）", "approval": "国药准字H20030045",
        "pkg_spec": "0.15g*14片/盒", "pkg_unit": "盒", "factor": 14, "sale_price": 29.80, "purchase_price": 23.50,
        "shelf_life": 36, "stock": 100, "indication": "原发性高血压、合并高血压的2型糖尿病肾病", "instruction": "口服，一次0.15g，一日1次",
        "rule_tag": "ACEI与ARB降压药重复用药（沙坦类）", "scenario": "【场景2-RASI重复】与依那普利/卡托普利同方联用，触发 BLOCK 禁忌"
    },

    # 3. 全身作用非甾体抗炎药（NSAID重复用药）
    {
        "med_code": "MED-2026-W078-02", "med_name": "布洛芬片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.2g",
        "mfr": "示范制药有限公司", "prod_code": "PROD-IBU-200", "trade_name": "布洛芬片（芬必得缓释/片）", "approval": "国药准字H20010321",
        "pkg_spec": "0.2g*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 12.00, "purchase_price": 9.20,
        "shelf_life": 36, "stock": 150, "indication": "缓解轻至中度疼痛、普通感冒或流行性感冒引起的发热", "instruction": "口服，成人一次1~2片，一日3~4次",
        "rule_tag": "全身作用非甾体抗炎药（NSAID重复）", "scenario": "【场景3-NSAID重复】与双氯芬酸钠同方开立，触发 REQUIRE_OVERRIDE 胃肠道出血高危拦截"
    },
    {
        "med_code": "MED-2026-W079-02", "med_name": "双氯芬酸钠缓释片剂", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "50mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-DIC-50", "trade_name": "双氯芬酸钠缓释片（扶他林）", "approval": "国药准字H20050892",
        "pkg_spec": "50mg*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 16.50, "purchase_price": 13.00,
        "shelf_life": 36, "stock": 120, "indication": "骨关节炎、类风湿关节炎、急性创伤疼痛", "instruction": "口服，一次50mg，一日1~2次",
        "rule_tag": "全身作用非甾体抗炎药（NSAID重复）", "scenario": "【场景3-NSAID重复】与布洛芬同方开立，触发 REQUIRE_OVERRIDE 重复用药拦截"
    },

    # 4. 双硫仑样反应相互作用（头孢/甲硝唑 + 含乙醇制剂）
    {
        "med_code": "MED-2026-W013-03", "med_name": "头孢克肟分散片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "100mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-CFX-100", "trade_name": "头孢克肟分散片（世福素）", "approval": "国药准字H20040567",
        "pkg_spec": "100mg*10片/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 26.50, "purchase_price": 20.80,
        "shelf_life": 24, "stock": 120, "indication": "支气管炎、肺炎、肾盂肾炎、胆道感染", "instruction": "口服，一次100mg，一日2次",
        "rule_tag": "双硫仑反应致敏抗菌药", "scenario": "【场景4-双硫仑反应】与藿香正气水同方联用，触发 BLOCK 严重双硫仑致死性相互作用拦截"
    },
    {
        "med_code": "MED-2026-W032-01", "med_name": "甲硝唑片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.2g",
        "mfr": "安康制药有限公司", "prod_code": "PROD-MTZ-200", "trade_name": "甲硝唑片（灭滴灵）", "approval": "国药准字H20020145",
        "pkg_spec": "0.2g*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 6.80, "purchase_price": 4.50,
        "shelf_life": 36, "stock": 150, "indication": "厌氧菌感染、滴虫病、阿米巴病", "instruction": "口服，一次0.2g~0.4g，一日3次",
        "rule_tag": "双硫仑反应致敏抗菌药", "scenario": "【场景4-双硫仑反应】与藿香正气水同方联用，触发 BLOCK 双硫仑样反应拦截"
    },
    {
        "med_code": "MED-2026-T030-03", "med_name": "藿香正气水1ml 相当于饮片 0.66g", "med_type": "CHINESE_PATENT", "dose_form": "ORAL_SOLUTION", "spec": "每支装 10ml",
        "mfr": "安康制药有限公司", "prod_code": "PROD-HXZQ-10", "trade_name": "藿香正气水（含乙醇40%~50%）", "approval": "国药准字Z20023412",
        "pkg_spec": "10ml*10支/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 15.00, "purchase_price": 11.20,
        "shelf_life": 36, "stock": 150, "indication": "解表化湿、理气和中，用于外感风寒、内伤湿滞", "instruction": "口服，一次5~10ml，一日2次，用时摇匀",
        "rule_tag": "含乙醇辅料与溶剂制剂", "scenario": "【场景4-双硫仑反应】与头孢克肟或甲硝唑联用，触发 BLOCK 相互作用拦截"
    },

    # 5. 大环内酯类与他汀类相互作用（横纹肌溶解风险）
    {
        "med_code": "MED-2026-W022-02", "med_name": "克拉霉素片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.25g（25 万单位）",
        "mfr": "示范制药有限公司", "prod_code": "PROD-CLA-250", "trade_name": "克拉霉素片（克林美）", "approval": "国药准字H20050119",
        "pkg_spec": "0.25g*6片/盒", "pkg_unit": "盒", "factor": 6, "sale_price": 22.00, "purchase_price": 17.50,
        "shelf_life": 36, "stock": 100, "indication": "鼻窦炎、咽炎、扁桃体炎、下呼吸道感染及幽门螺杆菌根除", "instruction": "口服，一次0.25g，每12小时1次",
        "rule_tag": "大环内酯类抗菌药（CYP3A4强抑制剂）", "scenario": "【场景5-大环内酯他汀冲突】与阿托伐他汀/辛伐他汀同方开立，触发 BLOCK 横纹肌溶解禁忌"
    },
    {
        "med_code": "MED-2026-W021-01", "med_name": "阿奇霉素片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.25g（25 万单位）",
        "mfr": "示范制药有限公司", "prod_code": "PROD-AZI-250", "trade_name": "阿奇霉素片（希舒美）", "approval": "国药准字H20030281",
        "pkg_spec": "0.25g*6片/盒", "pkg_unit": "盒", "factor": 6, "sale_price": 24.50, "purchase_price": 19.00,
        "shelf_life": 36, "stock": 100, "indication": "化脓性链球菌咽炎、支气管炎、肺炎、衣原体感染", "instruction": "口服，一次0.5g，一日1次，连服3日",
        "rule_tag": "大环内酯类抗菌药", "scenario": "【场景5-大环内酯他汀冲突】与辛伐他汀/阿托伐他汀联用，触发相互作用核对"
    },
    {
        "med_code": "MED-2026-W201-02", "med_name": "阿托伐他汀片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "20mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-ATV-20", "trade_name": "阿托伐他汀钙片（立普妥）", "approval": "国药准字H20051408",
        "pkg_spec": "20mg*7片/盒", "pkg_unit": "盒", "factor": 7, "sale_price": 31.00, "purchase_price": 25.00,
        "shelf_life": 36, "stock": 120, "indication": "原发性高胆固醇血症、冠心病二级预防", "instruction": "口服，常用起始剂量10~20mg，一日1次",
        "rule_tag": "他汀类调脂药（CYP3A4底物）", "scenario": "【场景5-大环内酯他汀冲突】与克拉霉素联用，触发 BLOCK 横纹肌溶解严重相互作用拦截"
    },
    {
        "med_code": "MED-2026-W200-02", "med_name": "辛伐他汀片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "20mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-SIM-20", "trade_name": "辛伐他汀片（舒降之）", "approval": "国药准字H19990311",
        "pkg_spec": "20mg*14片/盒", "pkg_unit": "盒", "factor": 14, "sale_price": 26.00, "purchase_price": 20.50,
        "shelf_life": 36, "stock": 100, "indication": "高胆固醇血症、冠心病", "instruction": "口服，常用剂量20mg，晚间顿服",
        "rule_tag": "他汀类调脂药（CYP3A4底物）", "scenario": "【场景5-大环内酯他汀冲突】与克拉霉素联用触发相互作用；【场景12-同药重复】与辛伐他汀10mg同开触发重复"
    },
    {
        "med_code": "MED-2026-W200-01", "med_name": "辛伐他汀片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "10mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-SIM-10", "trade_name": "辛伐他汀片（舒降之10mg）", "approval": "国药准字H19990310",
        "pkg_spec": "10mg*14片/盒", "pkg_unit": "盒", "factor": 14, "sale_price": 16.00, "purchase_price": 12.50,
        "shelf_life": 36, "stock": 100, "indication": "高胆固醇血症", "instruction": "口服，起始剂量10mg，晚间顿服",
        "rule_tag": "他汀类调脂药（同药不同规格重复）", "scenario": "【场景12-同药重复】与辛伐他汀20mg同时开立在同一张处方，触发 REQUIRE_OVERRIDE 重复用药拦截"
    },

    # 6. 镇静催眠类及抗焦虑药物重复用药
    {
        "med_code": "MED-2026-W139-01", "med_name": "地西泮片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "2.5mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-DZP-25", "trade_name": "地西泮片（安定）", "approval": "国药准字H19983056",
        "pkg_spec": "2.5mg*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 5.20, "purchase_price": 3.80,
        "shelf_life": 36, "stock": 100, "indication": "焦虑症、失眠症、抗癫痫抗惊厥", "instruction": "口服，镇静催眠一次2.5mg~5mg，睡前服",
        "rule_tag": "镇静催眠类药物重复用药（苯二氮䓬类）", "scenario": "【场景6-镇静催眠重复】与艾司唑仑同方开立，触发 REQUIRE_OVERRIDE 中枢及呼吸过度抑制拦截"
    },
    {
        "med_code": "MED-2026-W142-01", "med_name": "艾司唑仑片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "1mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-ESZ-1", "trade_name": "艾司唑仑片（舒乐安定）", "approval": "国药准字H19983088",
        "pkg_spec": "1mg*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 6.50, "purchase_price": 4.50,
        "shelf_life": 36, "stock": 100, "indication": "各类型失眠症、抗焦虑", "instruction": "口服，一次1~2mg，睡前服",
        "rule_tag": "镇静催眠类药物重复用药（苯二氮䓬类）", "scenario": "【场景6-镇静催眠重复】与地西泮/佐匹克隆同方开立，触发 REQUIRE_OVERRIDE 重复用药拦截"
    },
    {
        "med_code": "MED-2026-W147-01", "med_name": "佐匹克隆片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "3.75mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-ZOP-375", "trade_name": "佐匹克隆片（三辰）", "approval": "国药准字H20010452",
        "pkg_spec": "3.75mg*14片/盒", "pkg_unit": "盒", "factor": 14, "sale_price": 23.00, "purchase_price": 18.00,
        "shelf_life": 24, "stock": 80, "indication": "失眠症短程治疗", "instruction": "口服，一次3.75mg~7.5mg，睡前服",
        "rule_tag": "镇静催眠类药物重复用药（非苯二氮䓬类）", "scenario": "【场景6-镇静催眠重复】与地西泮同方开立，触发 REQUIRE_OVERRIDE 重复用药拦截"
    },

    # 7. 儿童青少年禁用氟喹诺酮类
    {
        "med_code": "MED-2026-W030-02", "med_name": "左氧氟沙星片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.5g",
        "mfr": "示范制药有限公司", "prod_code": "PROD-LVX-500", "trade_name": "盐酸左氧氟沙星片（可乐必妥）", "approval": "国药准字H20040061",
        "pkg_spec": "0.5g*10片/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 38.00, "purchase_price": 30.00,
        "shelf_life": 36, "stock": 100, "indication": "呼吸系统感染、泌尿系统感染、生殖系统感染", "instruction": "口服，一次0.5g，一日1次",
        "rule_tag": "儿童青少年禁忌氟喹诺酮类（<18岁禁用）", "scenario": "【场景7-儿童喹诺酮禁忌】为年龄 < 18 岁的未成年患者开立，触发 BLOCK 软骨发育不良禁忌拦截"
    },

    # 8. 儿童青少年禁用四环素类
    {
        "med_code": "MED-2026-W018-02", "med_name": "多西环素片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "100mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-DOX-100", "trade_name": "盐酸多西环素片（强力霉素）", "approval": "国药准字H20030176",
        "pkg_spec": "100mg*10片/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 14.50, "purchase_price": 10.80,
        "shelf_life": 36, "stock": 100, "indication": "支原体/衣原体感染、立克次体病、痤疮", "instruction": "口服，一次100mg，一日1~2次",
        "rule_tag": "儿童青少年禁用四环素类（<8岁禁用）", "scenario": "【场景8-儿童四环素禁忌】为年龄 < 8 岁的儿童开立，触发 BLOCK 永久性四环素牙骨质损害禁忌拦截"
    },
    {
        "med_code": "MED-2026-W019-02", "med_name": "米诺环素胶囊", "med_type": "WESTERN", "dose_form": "CAPSULE", "spec": "50mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-MINO-50", "trade_name": "盐酸米诺环素胶囊（美满霉素）", "approval": "国药准字H20050418",
        "pkg_spec": "50mg*10粒/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 28.50, "purchase_price": 22.00,
        "shelf_life": 24, "stock": 80, "indication": "敏感菌所致尿道炎、宫颈炎、严重中重度痤疮", "instruction": "口服，一次50mg~100mg，一日2次",
        "rule_tag": "儿童青少年禁用四环素类（<8岁禁用）", "scenario": "【场景8-儿童四环素禁忌】为年龄 < 8 岁的患儿开立，触发 BLOCK 禁忌拦截"
    },

    # 9. 儿童及特殊人群禁用氨基糖苷类
    {
        "med_code": "MED-2026-W016-02", "med_name": "阿米卡星注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "2ml ∶0.2g（20 万单位）",
        "mfr": "示范制药有限公司", "prod_code": "PROD-AMK-200", "trade_name": "硫酸阿米卡星注射液", "approval": "国药准字H19980072",
        "pkg_spec": "2ml:0.2g*10支/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 18.00, "purchase_price": 13.50,
        "shelf_life": 24, "stock": 100, "indication": "铜绿假单胞菌及革兰阴性杆菌重度感染", "instruction": "肌内注射或静脉滴注，成人一日15mg/kg",
        "rule_tag": "儿童及特殊人群禁用氨基糖苷类（<6岁禁用）", "scenario": "【场景9-儿童氨基糖苷禁忌】为年龄 < 6 岁的婴幼儿开立，触发 BLOCK 不可逆耳毒性致聋禁忌拦截"
    },
    {
        "med_code": "MED-2026-W017-02", "med_name": "庆大霉素注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "2ml ∶80mg（8 万单位）",
        "mfr": "示范制药有限公司", "prod_code": "PROD-GEN-80", "trade_name": "硫酸庆大霉素注射液", "approval": "国药准字H19980045",
        "pkg_spec": "2ml:80mg*10支/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 12.00, "purchase_price": 8.50,
        "shelf_life": 24, "stock": 100, "indication": "敏感革兰阴性杆菌引起的严重感染", "instruction": "肌内注射或静脉滴注，一次80mg，一日2~3次",
        "rule_tag": "儿童及特殊人群禁用氨基糖苷类（<6岁禁用）", "scenario": "【场景9-儿童氨基糖苷禁忌】为小儿患者开立，触发 BLOCK 耳蜗神经与肾毒性禁忌拦截"
    },

    # 10. 儿童发热禁忌阿司匹林
    {
        "med_code": "MED-2026-W077-03", "med_name": "阿司匹林肠溶片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.3g",
        "mfr": "示范制药有限公司", "prod_code": "PROD-ASP-300", "trade_name": "阿司匹林肠溶片（拜阿司匹灵0.3g）", "approval": "国药准字H20020087",
        "pkg_spec": "0.3g*30片/盒", "pkg_unit": "盒", "factor": 30, "sale_price": 15.60, "purchase_price": 11.80,
        "shelf_life": 36, "stock": 120, "indication": "解热镇痛、抗风湿、心脑血管抗血小板聚集", "instruction": "口服，一次0.3g，餐前温水送服",
        "rule_tag": "儿童发热禁忌阿司匹林制剂（<14岁儿童发热）", "scenario": "【场景10-儿童发热阿司匹林禁忌】儿童病毒感染发热开立，触发 BLOCK 致命性瑞氏综合征禁忌拦截"
    },

    # 11. 育龄期及妊娠期高危致畸禁忌
    {
        "med_code": "MED-2026-W046-01", "med_name": "利巴韦林片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.1g",
        "mfr": "示范制药有限公司", "prod_code": "PROD-RIB-100", "trade_name": "利巴韦林片（病毒唑）", "approval": "国药准字H20010188",
        "pkg_spec": "0.1g*24片/盒", "pkg_unit": "盒", "factor": 24, "sale_price": 9.50, "purchase_price": 6.80,
        "shelf_life": 36, "stock": 120, "indication": "呼吸道合胞病毒引起的病毒性肺炎、支气管炎", "instruction": "口服，一次0.15g，一日3次",
        "rule_tag": "妊娠期禁用致畸高危药物（FDA X级）", "scenario": "【场景11-妊娠致畸禁忌】为育龄期备孕或妊娠期女性开立，触发 BLOCK 严重胚胎致死与致畸禁忌拦截"
    },
    {
        "med_code": "MED-2026-W295-02", "med_name": "华法林片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "2.5mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-WAF-25", "trade_name": "华法林钠片", "approval": "国药准字H20000219",
        "pkg_spec": "2.5mg*30片/盒", "pkg_unit": "盒", "factor": 30, "sale_price": 18.00, "purchase_price": 13.80,
        "shelf_life": 36, "stock": 100, "indication": "血栓栓塞性疾病的预防及治疗、房颤抗凝", "instruction": "口服，初始一日2.5~5mg，根据INR调整",
        "rule_tag": "妊娠期禁用致畸高危药物（FDA X级）", "scenario": "【场景11-妊娠致畸禁忌】为妊娠早期孕妇开立，触发 BLOCK 华法林胚胎畸变综合征禁忌拦截"
    },
    {
        "med_code": "MED-2026-W365-02", "med_name": "甲氨蝶呤注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "2ml ∶50mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-MTX-50", "trade_name": "甲氨蝶呤注射液", "approval": "国药准字H20020311",
        "pkg_spec": "2ml:50mg*5支/盒", "pkg_unit": "盒", "factor": 5, "sale_price": 42.00, "purchase_price": 33.50,
        "shelf_life": 24, "stock": 60, "indication": "类风湿关节炎、严重银屑病、血液系统恶性肿瘤", "instruction": "肌内或静脉注射，按医嘱给药",
        "rule_tag": "妊娠期禁用致畸高危药物（FDA X级）", "scenario": "【场景11-妊娠致畸禁忌】孕妇或备孕妇女开立，触发 BLOCK 致畸及生殖毒性禁忌拦截"
    },

    # 12. 基层常用高血压与心血管慢病药品
    {
        "med_code": "MED-2026-W154-02", "med_name": "硝苯地平片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "10mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-NIF-10", "trade_name": "硝苯地平片（拜新同/普通片）", "approval": "国药准字H19990145",
        "pkg_spec": "10mg*30片/盒", "pkg_unit": "盒", "factor": 30, "sale_price": 8.50, "purchase_price": 6.00,
        "shelf_life": 36, "stock": 150, "indication": "各种类型高血压、心绞痛", "instruction": "口服，一次10mg，一日3次",
        "rule_tag": "基层心血管慢病基础药物", "scenario": "【慢病基药】基层高血压第一线长效/常规钙通道拮抗剂"
    },
    {
        "med_code": "MED-2026-W162-01", "med_name": "美托洛尔片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "25mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-METO-25", "trade_name": "酒石酸美托洛尔片（倍他乐克）", "approval": "国药准字H20010078",
        "pkg_spec": "25mg*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 14.20, "purchase_price": 10.80,
        "shelf_life": 36, "stock": 150, "indication": "高血压、心绞痛、心肌梗死后二级预防、心律失常", "instruction": "口服，一次25mg~50mg，一日2次",
        "rule_tag": "基层心血管慢病基础药物（β受体阻滞剂）", "scenario": "【慢病基药】高血压合并心率过快或冠心病首选"
    },
    {
        "med_code": "MED-2026-W173-02", "med_name": "卡托普利片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "25mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-CAP-25", "trade_name": "卡托普利片（开博通）", "approval": "国药准字H19980067",
        "pkg_spec": "25mg*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 7.50, "purchase_price": 5.20,
        "shelf_life": 36, "stock": 150, "indication": "高血压、充血性心力衰竭", "instruction": "口服，一次12.5mg~25mg，一日2~3次",
        "rule_tag": "基层心血管慢病基础药物（ACEI短效）", "scenario": "【慢病基药】基层急症降压与高血压维持治疗经典药"
    },

    # 13. 基层常用2型糖尿病口服降糖药
    {
        "med_code": "MED-2026-W318-02", "med_name": "格列美脲片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "2mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-GLIM-2", "trade_name": "格列美脲片（亚莫利）", "approval": "国药准字H20030018",
        "pkg_spec": "2mg*15片/盒", "pkg_unit": "盒", "factor": 15, "sale_price": 24.00, "purchase_price": 18.80,
        "shelf_life": 36, "stock": 120, "indication": "2型糖尿病（在饮食控制及运动治疗不满意时）", "instruction": "口服，一次1mg~2mg，一日1次，早餐前服用",
        "rule_tag": "基层内分泌慢病基础药物（磺酰脲类）", "scenario": "【慢病基药】基层2型糖尿病第二代促胰岛素分泌剂"
    },
    {
        "med_code": "MED-2026-W321-01", "med_name": "阿卡波糖片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "50mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-ACAR-50", "trade_name": "阿卡波糖片（拜唐苹）", "approval": "国药准字H20040187",
        "pkg_spec": "50mg*30片/盒", "pkg_unit": "盒", "factor": 30, "sale_price": 35.00, "purchase_price": 27.50,
        "shelf_life": 36, "stock": 120, "indication": "配合饮食治疗2型糖尿病、降低餐后血糖", "instruction": "口服，用餐前即刻整片吞服或与前几口食物咀嚼同服",
        "rule_tag": "基层内分泌慢病基础药物（α-糖苷酶抑制剂）", "scenario": "【慢病基药】基层餐后高血糖首选一线用药"
    },

    # 14. 基层常用呼吸道与抗过敏药品
    {
        "med_code": "MED-2026-W206-02", "med_name": "氨溴索分散片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "30mg",
        "mfr": "示范制药有限公司", "prod_code": "PROD-AMB-30", "trade_name": "盐酸氨溴索分散片（沐舒坦）", "approval": "国药准字H20050721",
        "pkg_spec": "30mg*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 18.00, "purchase_price": 13.80,
        "shelf_life": 36, "stock": 150, "indication": "急慢性支气管炎、痰液粘稠难咳出者", "instruction": "口服，一次30mg，一日3次，餐后服用",
        "rule_tag": "基层呼吸系统基础用药（祛痰剂）", "scenario": "【全科基药】基层呼吸道感染与慢阻肺常用排痰止咳药"
    },
    {
        "med_code": "MED-2026-W351-01", "med_name": "氯雷他定片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "10mg",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-LOR-10", "trade_name": "氯雷他定片（开瑞坦）", "approval": "国药准字H20020111",
        "pkg_spec": "10mg*10片/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 19.50, "purchase_price": 15.00,
        "shelf_life": 36, "stock": 120, "indication": "过敏性鼻炎、慢性荨麻疹、瘙痒性皮肤病", "instruction": "口服，成人一次10mg，一日1次",
        "rule_tag": "基层抗过敏基础用药（第二代抗组胺药）", "scenario": "【全科基药】第二代非镇静型抗组胺过敏一线药"
    },

    # 15. 基层常用消化系统胃黏膜保护药
    {
        "med_code": "MED-2026-W236", "med_name": "铝碳酸镁咀嚼片", "med_type": "WESTERN", "dose_form": "TABLET", "spec": "0.5g",
        "mfr": "示范制药有限公司", "prod_code": "PROD-HYD-500", "trade_name": "铝碳酸镁咀嚼片（达喜）", "approval": "国药准字H20010477",
        "pkg_spec": "0.5g*20片/盒", "pkg_unit": "盒", "factor": 20, "sale_price": 21.00, "purchase_price": 16.50,
        "shelf_life": 36, "stock": 150, "indication": "急慢性胃炎、反流性食管炎、胃痛胃灼热感", "instruction": "咀嚼后咽下，一次1~2片，一日3次，饭后1~2小时服用",
        "rule_tag": "基层消化系统基础用药（抗酸保护剂）", "scenario": "【全科基药】基层胃灼热、泛酸、胃炎对症一线药"
    },

    # 16. 基层常用中成药
    {
        "med_code": "MED-2026-T136-01", "med_name": "复方丹参片（颗粒、胶囊、滴丸）", "med_type": "CHINESE_PATENT", "dose_form": "TABLET", "spec": "每片重 0.3g",
        "mfr": "安康制药有限公司", "prod_code": "PROD-FFDS-300", "trade_name": "复方丹参片（薄膜衣片）", "approval": "国药准字Z20010156",
        "pkg_spec": "0.3g*60片/瓶", "pkg_unit": "瓶", "factor": 60, "sale_price": 16.80, "purchase_price": 12.50,
        "shelf_life": 36, "stock": 150, "indication": "活血化瘀、理气止痛，用于胸闷心痛、冠心病心绞痛", "instruction": "口服，一次3片，一日3次",
        "rule_tag": "基层中医药特色慢病用药（活血化瘀）", "scenario": "【中成药基药】基层中老年冠心病、气滞血瘀胸痹常用中成药"
    },
    {
        "med_code": "MED-2026-T002-01", "med_name": "感冒清热颗粒（胶囊）", "med_type": "CHINESE_PATENT", "dose_form": "GRANULE", "spec": "每袋装 3g",
        "mfr": "安康制药有限公司", "prod_code": "PROD-GMQR-3G", "trade_name": "感冒清热颗粒（无糖型）", "approval": "国药准字Z20020089",
        "pkg_spec": "3g*10袋/盒", "pkg_unit": "盒", "factor": 10, "sale_price": 18.50, "purchase_price": 13.90,
        "shelf_life": 36, "stock": 150, "indication": "疏风散寒、解表清热，用于风寒感冒、头痛发热", "instruction": "开水冲服，一次1袋，一日2次",
        "rule_tag": "基层呼吸道疾病常用中成药（感冒风寒）", "scenario": "【中成药基药】基层秋冬季风寒外感、头痛发热一线中成药"
    },

    # 17. 基层常用大容量输液与静脉注射用药
    {
        "med_code": "MED-2026-W411-01", "med_name": "氯化钠注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "0.9% 250ml",
        "mfr": "示范制药有限公司", "prod_code": "PROD-NS-250", "trade_name": "0.9%氯化钠注射液（生理盐水）", "approval": "国药准字H20010188",
        "pkg_spec": "250ml:2.25g/瓶", "pkg_unit": "瓶", "factor": 1, "sale_price": 3.50, "purchase_price": 2.20,
        "shelf_life": 24, "stock": 200, "indication": "各种原因所致的失水、体液丢失、低氯性代谢性碱中毒、静脉药物载体与溶媒", "instruction": "静脉滴注，遵医嘱按需给药",
        "rule_tag": "基层基础溶媒大输液（生理盐水）", "scenario": "【输液基药】门诊输液室与病房最基础静脉溶媒，水盐平衡调节"
    },
    {
        "med_code": "MED-2026-W412-01", "med_name": "葡萄糖注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "5% 250ml",
        "mfr": "示范制药有限公司", "prod_code": "PROD-GS5-250", "trade_name": "5%葡萄糖注射液（GS）", "approval": "国药准字H20010212",
        "pkg_spec": "250ml:12.5g/瓶", "pkg_unit": "瓶", "factor": 1, "sale_price": 3.80, "purchase_price": 2.40,
        "shelf_life": 24, "stock": 200, "indication": "补充能量和水分、进食不足或体液丢失、低血糖症、静脉滴注药物载体与溶媒", "instruction": "静脉滴注，遵医嘱按需给药",
        "rule_tag": "基层基础溶媒大输液（葡萄糖）", "scenario": "【输液基药】门诊常用能量补充大输液，特定配伍要求药物之专用溶媒"
    },
    {
        "med_code": "MED-2026-W413-03", "med_name": "葡萄糖氯化钠注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "250ml",
        "mfr": "示范制药有限公司", "prod_code": "PROD-GNS-250", "trade_name": "葡萄糖氯化钠注射液（糖盐水）", "approval": "国药准字H20010325",
        "pkg_spec": "250ml/瓶", "pkg_unit": "瓶", "factor": 1, "sale_price": 4.20, "purchase_price": 2.80,
        "shelf_life": 24, "stock": 150, "indication": "进食不足、出汗或腹泻等引起的失水伴体液渗透压偏低、能量与电解质补充", "instruction": "静脉滴注，遵医嘱按需给药",
        "rule_tag": "基层复方体液平衡大输液（糖盐水）", "scenario": "【输液基药】兼顾热量与电解质补充，虚脱脱水患者常用补液"
    },
    {
        "med_code": "MED-2026-W414-01", "med_name": "复方氯化钠注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "250ml",
        "mfr": "示范制药有限公司", "prod_code": "PROD-RNG-250", "trade_name": "复方氯化钠注射液（林格氏液）", "approval": "国药准字H20010411",
        "pkg_spec": "250ml/瓶", "pkg_unit": "瓶", "factor": 1, "sale_price": 5.50, "purchase_price": 3.60,
        "shelf_life": 24, "stock": 150, "indication": "各种原因所致的细胞外液减少、脱水及大量失血休克早期的液体复苏", "instruction": "静脉滴注，遵医嘱按需给药",
        "rule_tag": "基层细胞外液复苏大输液（林格液）", "scenario": "【输液基药】有效补充细胞外液与维持血容量，急症急救体液复苏"
    },
    {
        "med_code": "MED-2026-W106-03", "med_name": "甘露醇注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "250ml ∶50g",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-MAN-250", "trade_name": "甘露醇注射液（20%快速脱水剂）", "approval": "国药准字H20020138",
        "pkg_spec": "250ml:50g/瓶", "pkg_unit": "瓶", "factor": 1, "sale_price": 12.50, "purchase_price": 8.50,
        "shelf_life": 36, "stock": 100, "indication": "组织脱水药，降低颅内压、预防脑疝，青光眼急性发作降低眼内压", "instruction": "静脉滴注，一次250ml，于30分钟内快速滴注完毕",
        "rule_tag": "基层组织脱水降颅内压急救输液", "scenario": "【急救输液】急性脑水肿、脑卒中及青光眼急性发作组织脱水首选用药"
    },
    {
        "med_code": "MED-2026-W415-02", "med_name": "氯化钾注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "10ml ∶1g",
        "mfr": "示范制药有限公司", "prod_code": "PROD-KCL-10", "trade_name": "10%氯化钾注射液（高危静脉电解质）", "approval": "国药准字H20000302",
        "pkg_spec": "10ml:1g*5支/盒", "pkg_unit": "盒", "factor": 5, "sale_price": 8.00, "purchase_price": 5.20,
        "shelf_life": 36, "stock": 100, "indication": "低钾血症的预防和治疗，严重进食不足或呕吐腹泻严重缺钾的静脉补充", "instruction": "必须稀释后静脉滴注！严禁直接静脉推注！稀释后浓度不得超过0.3%，慢速滴注",
        "rule_tag": "高危静脉电解质（严禁直接静推）", "scenario": "【高危输液】纠正严重低钾血症，严格限制滴速与稀释浓度，严防致死性心律失常"
    },
    {
        "med_code": "MED-2026-W417-06", "med_name": "碳酸氢钠注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "250ml ∶12.5g",
        "mfr": "示范制药有限公司", "prod_code": "PROD-SB-250", "trade_name": "5%碳酸氢钠注射液（碱性调节剂）", "approval": "国药准字H20000455",
        "pkg_spec": "250ml:12.5g/瓶", "pkg_unit": "瓶", "factor": 1, "sale_price": 9.80, "purchase_price": 6.50,
        "shelf_life": 24, "stock": 100, "indication": "代谢性酸中毒、高钾血症伴酸中毒、碱化尿液预防尿酸性肾结石", "instruction": "静脉滴注，按血气分析或结合力计算用量，慢速给药",
        "rule_tag": "基层纠正酸中毒及碱化尿液大输液", "scenario": "【急救输液】严重腹泻脱水酸中毒、急危重症体液酸碱失衡纠正"
    },
    {
        "med_code": "MED-2026-W032-03", "med_name": "甲硝唑氯化钠注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "100ml ∶0.5g",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-MTZ-IV-100", "trade_name": "甲硝唑氯化钠注射液（抗厌氧菌）", "approval": "国药准字H20010520",
        "pkg_spec": "100ml:0.5g/瓶", "pkg_unit": "瓶", "factor": 1, "sale_price": 6.50, "purchase_price": 4.00,
        "shelf_life": 24, "stock": 150, "indication": "厌氧菌所致的腹腔感染、盆腔感染、下呼吸道感染及术前预防用药", "instruction": "静脉滴注，一次100ml(0.5g)，滴注时间不少于20分钟，用药期间严禁饮酒或使用乙醇制剂",
        "rule_tag": "抗厌氧菌感染大输液（双硫仑高危）", "scenario": "【抗感染输液】急腹症及盆腔感染一线抗厌氧菌输液；同用乙醇制剂触发双硫仑反应阻断"
    },
    {
        "med_code": "MED-2026-W030-04", "med_name": "左氧氟沙星氯化钠注射液", "med_type": "WESTERN", "dose_form": "INJECTION", "spec": "100ml ∶0.5g",
        "mfr": "青禾医药股份有限公司", "prod_code": "PROD-LVX-IV-100", "trade_name": "左氧氟沙星氯化钠注射液（可乐必妥/同类）", "approval": "国药准字H20010688",
        "pkg_spec": "100ml:0.5g/瓶", "pkg_unit": "瓶", "factor": 1, "sale_price": 22.00, "purchase_price": 15.00,
        "shelf_life": 24, "stock": 120, "indication": "呼吸系统重度感染、复杂性尿路感染、腹腔感染、重症软组织感染", "instruction": "静脉滴注，一次100ml(0.5g)，每24小时一次，滴注时间至少60分钟，未满18周岁禁用",
        "rule_tag": "重症抗感染大输液（未成年人禁用）", "scenario": "【抗感染输液】门诊急诊重症细菌感染静脉给药；<18岁患者开立触发儿童禁忌阻断"
    }
]

# 规则场景明细表
RULE_SCENARIOS = [
    {
        "scene_id": "SCENE-01",
        "rule_code": "QMED.PPI_DUPLICATE",
        "rule_name": "质子泵抑制剂（PPI）同方或重复用药核对",
        "category": "质子泵抑制剂类抑酸药 (PPI_DUPLICATE_THERAPY)",
        "decision": "REQUIRE_OVERRIDE",
        "severity": "HIGH",
        "pair_drugs": "奥美拉唑肠溶胶囊 20mg + 雷贝拉唑钠肠溶片 20mg",
        "condition": "同一患者门诊处方同时开立 2 种或以上 PPI 类抑酸药物",
        "clinical_rationale": "联合使用两种PPI不增加抑酸疗效，成倍增加艰难梭菌感染、低镁血症及骨折风险。应保留单一品种。"
    },
    {
        "scene_id": "SCENE-02",
        "rule_code": "QMED.RASI_DUPLICATE",
        "rule_name": "ACEI与ARB类降压药重复用药核对",
        "category": "ACEI与ARB降压药重复用药 (RASI_DUPLICATE_THERAPY)",
        "decision": "BLOCK",
        "severity": "CRITICAL",
        "pair_drugs": "马来酸依那普利片 10mg (ACEI) + 缬沙坦片 80mg / 厄贝沙坦片 0.15g (ARB)",
        "condition": "同一处方或活动医嘱同时开立 ACEI（普利类）与 ARB（沙坦类）",
        "clinical_rationale": "指南明确反对双重阻断RAAS系统，可诱发严重高血钾、急性肾衰竭及过低血压，临床禁止联用。"
    },
    {
        "scene_id": "SCENE-03",
        "rule_code": "NsaidDuplicateRule",
        "rule_name": "全身作用非甾体抗炎药重复开立核对",
        "category": "全身作用非甾体抗炎药 (SYSTEMIC_NSAID)",
        "decision": "REQUIRE_OVERRIDE",
        "severity": "HIGH",
        "pair_drugs": "布洛芬片 0.2g + 双氯芬酸钠缓释片 50mg",
        "condition": "同方开立 2 种或以上全身作用 NSAID 解热镇痛药",
        "clinical_rationale": "同时使用两种全身作用NSAID无协同镇痛增益，但上消化道出血穿孔和急性肾损伤发生率显著升高。"
    },
    {
        "scene_id": "SCENE-04",
        "rule_code": "DisulfiramInteractionRule",
        "rule_name": "双硫仑样反应相互作用核对",
        "category": "双硫仑反应致敏抗菌药 + 含乙醇辅料与溶剂制剂",
        "decision": "BLOCK",
        "severity": "CRITICAL",
        "pair_drugs": "头孢克肟分散片 100mg / 甲硝唑片 0.2g + 藿香正气水 10ml (含乙醇40%~50%)",
        "condition": "开立致敏抗菌药（头孢、甲硝唑）同时开立含乙醇制剂（藿香正气水、十滴水）",
        "clinical_rationale": "头孢菌素及咪唑类抑制乙醛脱氢酶，导致体内乙醛蓄积，可诱发严重双硫仑样反应、休克甚至猝死。"
    },
    {
        "scene_id": "SCENE-05",
        "rule_code": "QMED.MACROLIDE_STATIN_INTERACTION",
        "rule_name": "大环内酯类抗菌药与他汀类相互作用核对",
        "category": "大环内酯类抗菌药 + 他汀类调脂药",
        "decision": "BLOCK",
        "severity": "CRITICAL",
        "pair_drugs": "克拉霉素片 0.25g / 阿奇霉素片 0.25g + 阿托伐他汀钙片 20mg / 辛伐他汀片 20mg",
        "condition": "大环内酯类抗菌药与主要经 CYP3A4 酶代谢的他汀类药物同方开立",
        "clinical_rationale": "克拉霉素强效抑制CYP3A4酶，使他汀血药浓度骤升数倍，极易诱发致死性急性横纹肌溶解与急性肾衰竭。"
    },
    {
        "scene_id": "SCENE-06",
        "rule_code": "QMED.SEDATIVE_HYPNOTIC_DUPLICATE",
        "rule_name": "镇静催眠类及抗焦虑药物重复用药核对",
        "category": "镇静催眠类药物重复用药 (SEDATIVE_HYPNOTIC_DUPLICATE)",
        "decision": "REQUIRE_OVERRIDE",
        "severity": "HIGH",
        "pair_drugs": "地西泮片 2.5mg (安定) + 艾司唑仑片 1mg (舒乐安定) / 佐匹克隆片 3.75mg",
        "condition": "同一患者同时开立 2 种或以上镇静催眠药物",
        "clinical_rationale": "联合开立易导致中枢过度抑制、呼吸抑制及老年患者跌倒骨折风险。应精简为单一适宜方案。"
    },
    {
        "scene_id": "SCENE-07",
        "rule_code": "AgeContraindicationRule",
        "rule_name": "儿童青少年禁用氟喹诺酮类抗生素核对",
        "category": "儿童青少年禁忌氟喹诺酮类 (QUINOLONE_PEDIATRIC_CONTRA)",
        "decision": "BLOCK",
        "severity": "CRITICAL",
        "pair_drugs": "盐酸左氧氟沙星片 0.5g (单药患者年龄触发)",
        "condition": "患者年龄 < 18 周岁且开立氟喹诺酮类抗生素",
        "clinical_rationale": "动物实验和临床证实氟喹诺酮类药物可引起幼龄动物负重软骨损伤、关节病变，未成年人严禁使用。"
    },
    {
        "scene_id": "SCENE-08",
        "rule_code": "QMED.TETRACYCLINE_PEDIATRIC",
        "rule_name": "儿童青少年禁用四环素类抗生素核对",
        "category": "儿童青少年禁用四环素类 (TETRACYCLINE_PEDIATRIC_CONTRA)",
        "decision": "BLOCK",
        "severity": "CRITICAL",
        "pair_drugs": "盐酸多西环素片 100mg / 盐酸米诺环素胶囊 50mg",
        "condition": "患者年龄 < 8 周岁且开立四环素类抗生素",
        "clinical_rationale": "四环素类与牙骨组织螯合，可导致恒齿永久性黄染、牙釉质发育不良及骨骼生长迟缓，8岁以下禁用。"
    },
    {
        "scene_id": "SCENE-09",
        "rule_code": "QMED.AMINOGLYCOSIDE_PEDIATRIC",
        "rule_name": "儿童及特定年龄禁用氨基糖苷类抗生素核对",
        "category": "儿童及特殊人群禁用氨基糖苷类 (AMINOGLYCOSIDE_PEDIATRIC_CONTRA)",
        "decision": "BLOCK",
        "severity": "CRITICAL",
        "pair_drugs": "硫酸阿米卡星注射液 2ml:0.2g / 硫酸庆大霉素注射液 2ml:80mg",
        "condition": "患者年龄 < 6 周岁且开立氨基糖苷类注射制剂",
        "clinical_rationale": "具有明确且不可逆的内耳前庭及前庭毛细胞毒性（药物性致聋）及急性肾小管毒性，6岁以下儿童禁用。"
    },
    {
        "scene_id": "SCENE-10",
        "rule_code": "AgeContraindicationRule",
        "rule_name": "儿童发热禁忌阿司匹林制剂核对",
        "category": "儿童发热禁忌阿司匹林制剂 (ASPIRIN_PEDIATRIC_CONTRA)",
        "decision": "BLOCK",
        "severity": "CRITICAL",
        "pair_drugs": "阿司匹林肠溶片 0.3g (单药患者年龄及发热指征)",
        "condition": "患者年龄 < 14 周岁且因病毒性发热感冒开立阿司匹林制剂",
        "clinical_rationale": "儿童流感或水痘等病毒感染期使用阿司匹林退热，可能诱发极高致死率的瑞氏综合征（Reye综合征）。"
    },
    {
        "scene_id": "SCENE-11",
        "rule_code": "QMED.PREGNANCY_CONTRA",
        "rule_name": "育龄期及妊娠期妇女禁用高危致畸药物核对",
        "category": "妊娠期禁用致畸高危药物 (PREGNANCY_CONTRA_CATEGORY_X)",
        "decision": "BLOCK",
        "severity": "CRITICAL",
        "pair_drugs": "利巴韦林片 0.1g / 华法林钠片 2.5mg / 甲氨蝶呤注射液 2ml:50mg",
        "condition": "育龄期女性（未排除备孕）或明确妊娠期妇女开立致畸等级X级药物",
        "clinical_rationale": "利巴韦林、华法林、甲氨蝶呤等具有高度人类致畸性及致死性胚胎毒性，孕妇及备孕男女严禁使用。"
    },
    {
        "scene_id": "SCENE-12",
        "rule_code": "QMED.EXACT_GENERIC_DUPLICATE",
        "rule_name": "同处方通用药精确重复核对",
        "category": "同条目标准规格重复 (EXACT_GENERIC_DUPLICATE)",
        "decision": "WARN",
        "severity": "LOW",
        "pair_drugs": "辛伐他汀片 20mg (PROD-SIM-20) 同方录入多条医嘱",
        "condition": "同一患者同一门诊处方重复开立相同通用药的多条有效医嘱",
        "clinical_rationale": "同一处方存在相同通用药多条医嘱，提示医生核对是否为有意分次或分组开立，防范重复录入。"
    }
]

def style_header(cell, text, bg="1F497D", fg="FFFFFF"):
    cell.value = text
    cell.font = Font(name="Microsoft YaHei", size=11, bold=True, color=fg)
    cell.fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

def style_cell(cell, value, align="left", is_number=False, is_price=False):
    cell.value = value
    cell.font = Font(name="Microsoft YaHei", size=10)
    if is_price and isinstance(value, (int, float)):
        cell.number_format = '¥#,##0.00'
        align = "right"
    elif is_number and isinstance(value, (int, float)):
        cell.number_format = '#,##0'
        align = "right"
    cell.alignment = Alignment(horizontal=align, vertical="center", wrap_text=(align == "left"))

def create_excel(output_path):
    wb = openpyxl.Workbook()
    # 移除默认 sheet
    default_sheet = wb.active
    wb.remove(default_sheet)

    border_thin = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='D9D9D9'),
        bottom=Side(style='thin', color='D9D9D9')
    )

    # ----------------------------------------------------
    # Sheet 1: 药品产品导入主表
    # ----------------------------------------------------
    ws1 = wb.create_sheet(title="药品产品导入主表")
    ws1.views.sheetView[0].showGridLines = True

    headers1 = [
        "序号", "通用药品编码", "通用药品名称", "药品类型", "剂型", "制剂规格",
        "生产企业名称", "产品编码", "商品名/全称", "批准文号",
        "包装规格", "包装单位", "换算系数", "零售价格(元)", "采购价格(元)",
        "有效期(月)", "门诊初始库存(盒/支)", "适应症", "用法用量说明",
        "合理用药安全分类与标签", "临床演示场景与配对指引"
    ]

    ws1.row_dimensions[1].height = 28
    for col_idx, h in enumerate(headers1, 1):
        cell = ws1.cell(row=1, column=col_idx)
        style_header(cell, h, bg="1F497D")

    for row_idx, item in enumerate(PRODUCTS_DATA, 2):
        ws1.row_dimensions[row_idx].height = 22
        values = [
            row_idx - 1,
            item["med_code"],
            item["med_name"],
            item["med_type"],
            item["dose_form"],
            item["spec"],
            item["mfr"],
            item["prod_code"],
            item["trade_name"],
            item["approval"],
            item["pkg_spec"],
            item["pkg_unit"],
            item["factor"],
            item["sale_price"],
            item["purchase_price"],
            item["shelf_life"],
            item["stock"],
            item["indication"],
            item["instruction"],
            item["rule_tag"],
            item["scenario"]
        ]
        for col_idx, val in enumerate(values, 1):
            cell = ws1.cell(row=row_idx, column=col_idx)
            is_pr = col_idx in (14, 15)
            is_num = col_idx in (1, 13, 16, 17)
            align = "center" if col_idx in (1, 2, 4, 5, 8, 10, 12, 16) else ("right" if (is_pr or is_num) else "left")
            style_cell(cell, val, align=align, is_number=is_num, is_price=is_pr)
            cell.border = border_thin

    # ----------------------------------------------------
    # Sheet 2: 合理用药规则演示速查
    # ----------------------------------------------------
    ws2 = wb.create_sheet(title="合理用药规则演示速查")
    ws2.views.sheetView[0].showGridLines = True

    headers2 = [
        "场景ID", "规则编码", "规则名称", "所属安全分类", "系统决策动作",
        "严重程度", "演示药品与配对方案", "触发前置条件", "医学循证依据与指南规范"
    ]

    ws2.row_dimensions[1].height = 28
    for col_idx, h in enumerate(headers2, 1):
        cell = ws2.cell(row=1, column=col_idx)
        style_header(cell, h, bg="276A3C")

    for row_idx, item in enumerate(RULE_SCENARIOS, 2):
        ws2.row_dimensions[row_idx].height = 36
        values = [
            item["scene_id"],
            item["rule_code"],
            item["rule_name"],
            item["category"],
            item["decision"],
            item["severity"],
            item["pair_drugs"],
            item["condition"],
            item["clinical_rationale"]
        ]
        for col_idx, val in enumerate(values, 1):
            cell = ws2.cell(row=row_idx, column=col_idx)
            align = "center" if col_idx in (1, 2, 5, 6) else "left"
            style_cell(cell, val, align=align)
            cell.border = border_thin
            # 决策列着色
            if col_idx == 5:
                if val == "BLOCK":
                    cell.font = Font(name="Microsoft YaHei", size=10, bold=True, color="C00000")
                elif val == "REQUIRE_OVERRIDE":
                    cell.font = Font(name="Microsoft YaHei", size=10, bold=True, color="ED7D31")

    # ----------------------------------------------------
    # Sheet 3: 基层全科慢病分类索引
    # ----------------------------------------------------
    ws3 = wb.create_sheet(title="基层全科慢病分类索引")
    ws3.views.sheetView[0].showGridLines = True

    headers3 = ["临床专科与病种", "核心代表品种", "推荐规格包装", "主要临床定位", "合并用药安全审查重点"]
    ws3.row_dimensions[1].height = 28
    for col_idx, h in enumerate(headers3, 1):
        cell = ws3.cell(row=1, column=col_idx)
        style_header(cell, h, bg="7030A0")

    categories_summary = [
        ("高血压（心血管慢病）", "依那普利片、缬沙坦片、硝苯地平片、美托洛尔片、卡托普利片", "口服片剂，14~30片/盒", "基层原发性高血压第一线维持与单药/联合达标治疗", "严禁 ACEI+ARB 联用；与大环内酯联用警惕低血压与横纹肌溶解"),
        ("2型糖尿病（内分泌慢病）", "盐酸二甲双胍片、格列美脲片、阿卡波糖片", "口服片剂，15~30片/盒", "基层2型糖尿病基础降糖、胰岛素促泌及餐后血糖控制", "关注促泌剂低血糖风险，肾功能不全者调整剂量"),
        ("高脂血症（心血管慢病）", "阿托伐他汀片 20mg、辛伐他汀片 20mg / 10mg", "口服片剂，7~14片/盒", "动脉粥样硬化性心血管疾病一级与二级预防", "严禁与红霉素、克拉霉素强效CYP3A4抑制剂联用（横纹肌溶解）"),
        ("消化性溃疡与GERD", "奥美拉唑肠溶胶囊 20mg、雷贝拉唑钠肠溶片 20mg、铝碳酸镁咀嚼片", "胶囊/片剂，14~20片/盒", "胃溃疡、十二指肠溃疡、胃食管反流及黏膜保护", "避免两种PPI同方重复开立；抗酸剂与抗生素给药间隔控制"),
        ("呼吸系统与感冒发热", "氨溴索分散片、氯雷他定片、布洛芬片、对乙酰氨基酚片", "片剂，10~20片/盒", "呼吸道急慢性感染、排痰困难、过敏性鼻炎、发热镇痛", "儿童发热严禁开立阿司匹林（瑞氏综合征）；避免重复NSAID"),
        ("常见感染性疾病（抗菌药）", "头孢克肟分散片、阿奇霉素片、克拉霉素片、甲硝唑片、左氧氟沙星片", "分散片/薄膜衣片，6~10片/盒", "呼吸道、消化道、泌尿生殖道敏感菌感染", "头孢/甲硝唑禁用含乙醇药物（双硫仑）；<18岁禁用喹诺酮；<8岁禁用四环素"),
        ("失眠伴焦虑（精神健康）", "地西泮片 2.5mg、艾司唑仑片 1mg、佐匹克隆片 3.75mg", "片剂，14~20片/盒", "基层失眠症、焦虑状态短期对症调理", "严禁两种镇静催眠药叠加开立；警惕中枢及呼吸抑制"),
        ("心脑血管中成药", "复方丹参片 0.3g", "薄膜衣片，60片/瓶", "气滞血瘀型胸闷心痛、冠心病心绞痛辅助治疗", "与西药抗凝药（华法林、阿司匹林）合用时监测出血倾向"),
        ("外感风寒中成药", "感冒清热颗粒 3g、连花清瘟胶囊", "颗粒/胶囊，10袋/盒", "风寒外感或热毒袭肺初起症候", "中西药协同规范，避免与相互作用西药同用"),
        ("静脉输液与急救补充", "0.9%氯化钠注射液、5%葡萄糖注射液、葡萄糖氯化钠注射液、复方氯化钠注射液、甘露醇注射液、氯化钾注射液、碳酸氢钠注射液、甲硝唑输液、左氧氟沙星输液", "塑瓶/软袋/西林瓶，100ml~250ml", "门诊急诊输液、体液复苏、脱水利尿、电解质紊乱纠正与静脉抗感染", "严格遵守溶媒配伍禁忌；高危电解质氯化钾严禁静推并控制滴速；甲硝唑禁酒；左氧氟沙星未成年人禁用")
    ]


    for row_idx, item in enumerate(categories_summary, 2):
        ws3.row_dimensions[row_idx].height = 26
        for col_idx, val in enumerate(item, 1):
            cell = ws3.cell(row=row_idx, column=col_idx)
            align = "center" if col_idx == 1 else "left"
            style_cell(cell, val, align=align)
            cell.border = border_thin

    # 自动调整列宽
    for ws in [ws1, ws2, ws3]:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = str(cell.value or "")
                # 简单估算中英文混排宽度
                val_len = sum(2 if ord(c) > 127 else 1 for c in val)
                if val_len > max_len:
                    max_len = val_len
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)
            if ws.column_dimensions[col_letter].width > 60:
                ws.column_dimensions[col_letter].width = 60

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    wb.save(output_path)
    print(f"成功生成 Excel 文件：{output_path}")

if __name__ == "__main__":
    out_excel = "/Users/yangl/IdeaProjects/rhn/docs/architecture/rational-medication/基层常用药品与合理用药规则产品导入表.xlsx"
    create_excel(out_excel)
