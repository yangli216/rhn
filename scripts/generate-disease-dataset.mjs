#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const diseases = [
  // 心脑血管系统
  { code: "I10", name: "原发性高血压", short: "高血压", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "YFXGXY", aliases: [{ name: "高血压病", pinyin: "GXYB" }, { name: "高血压", pinyin: "GXY" }] },
  { code: "I25.1", name: "冠状动脉粥样硬化性心脏病", short: "冠心病", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "GZDMZYHHXXZB", aliases: [{ name: "冠心病", pinyin: "GXB" }, { name: "缺血性心脏病", pinyin: "QXXZB" }] },
  { code: "I20.9", name: "心绞痛，未特指", short: "心绞痛", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "XJT", aliases: [{ name: "心绞痛", pinyin: "XJT" }, { name: "劳力性心绞痛", pinyin: "LLXXJT" }] },
  { code: "I21.9", name: "急性心肌梗死，未特指", short: "心梗", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "JXXJGS", aliases: [{ name: "心肌梗死", pinyin: "XJGS" }, { name: "急性心梗", pinyin: "JXXG" }] },
  { code: "I50.9", name: "心力衰竭，未特指", short: "心衰", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "XLSJ", aliases: [{ name: "心力衰竭", pinyin: "XLSJ" }, { name: "充血性心力衰竭", pinyin: "CXXLSJ" }] },
  { code: "I48.9", name: "心房颤动和心房扑动，未特指", short: "房颤", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "XFCDHXFPD", aliases: [{ name: "心房颤动", pinyin: "XFCD" }, { name: "房颤", pinyin: "FC" }] },
  { code: "I63.9", name: "脑梗死，未特指", short: "脑梗死", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "NGS", aliases: [{ name: "脑梗死", pinyin: "NGS" }, { name: "脑梗", pinyin: "NG" }, { name: "缺血性脑卒中", pinyin: "QXXNZZ" }] },
  { code: "I61.9", name: "脑出血，未特指", short: "脑出血", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "NCX", aliases: [{ name: "脑出血", pinyin: "NCX" }, { name: "出血性脑卒中", pinyin: "CXXNZZ" }] },
  { code: "I67.2", name: "脑动脉硬化", short: "脑动脉硬化", chapterCode: "IX", chapterName: "循环系统疾病", pinyin: "NDMYH", aliases: [{ name: "脑动脉硬化症", pinyin: "NDMYHZ" }] },

  // 内分泌与代谢疾病
  { code: "E11.9", name: "2型糖尿病，不伴并发症", short: "2型糖尿病", chapterCode: "IV", chapterName: "内分泌、营养和代谢疾病", pinyin: "2XTNB", aliases: [{ name: "2型糖尿病", pinyin: "2XTNB" }, { name: "糖尿病", pinyin: "TNB" }] },
  { code: "E10.9", name: "1型糖尿病，不伴并发症", short: "1型糖尿病", chapterCode: "IV", chapterName: "内分泌、营养和代谢疾病", pinyin: "1XTNB", aliases: [{ name: "1型糖尿病", pinyin: "1XTNB" }] },
  { code: "E78.5", name: "高脂血症，未特指", short: "高脂血症", chapterCode: "IV", chapterName: "内分泌、营养和代谢疾病", pinyin: "GZXZ", aliases: [{ name: "高血脂", pinyin: "GXZ" }, { name: "血脂异常", pinyin: "XZYC" }] },
  { code: "E79.0", name: "高尿酸血症", short: "高尿酸血症", chapterCode: "IV", chapterName: "内分泌、营养和代谢疾病", pinyin: "GNSXZ", aliases: [{ name: "高尿酸", pinyin: "GNS" }] },
  { code: "M10.9", name: "痛风，未特指", short: "痛风", chapterCode: "XIII", chapterName: "肌肉骨骼系统和结缔组织疾病", pinyin: "TF", aliases: [{ name: "痛风性关节炎", pinyin: "TFXGJY" }, { name: "痛风", pinyin: "TF" }] },
  { code: "E03.9", name: "甲状腺功能减退症，未特指", short: "甲减", chapterCode: "IV", chapterName: "内分泌、营养和代谢疾病", pinyin: "JZXGNJTZ", aliases: [{ name: "甲减", pinyin: "JJ" }] },
  { code: "E05.9", name: "甲状腺功能亢进症，未特指", short: "甲亢", chapterCode: "IV", chapterName: "内分泌、营养和代谢疾病", pinyin: "JZXGNKJZ", aliases: [{ name: "甲亢", pinyin: "JK" }] },
  { code: "E66.9", name: "肥胖症，未特指", short: "肥胖症", chapterCode: "IV", chapterName: "内分泌、营养和代谢疾病", pinyin: "FPZ", aliases: [{ name: "单纯性肥胖", pinyin: "DCXFP" }] },

  // 呼吸系统疾病
  { code: "J06.9", name: "急性上呼吸道感染，未特指", short: "上感", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "JXSHDXGR", aliases: [{ name: "上呼吸道感染", pinyin: "SHDXGR" }, { name: "普通感冒", pinyin: "PTGM" }, { name: "感冒", pinyin: "GM" }] },
  { code: "J00", name: "急性鼻咽炎[感冒]", short: "急性鼻咽炎", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "JXBYY", aliases: [{ name: "急性鼻炎", pinyin: "JXBY" }] },
  { code: "J02.9", name: "急性咽炎，未特指", short: "急性咽炎", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "JXYY", aliases: [{ name: "咽炎", pinyin: "YY" }] },
  { code: "J03.9", name: "急性扁桃体炎，未特指", short: "急性扁桃体炎", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "JXBTTY", aliases: [{ name: "扁桃体炎", pinyin: "BTTY" }] },
  { code: "J20.9", name: "急性支气管炎，未特指", short: "急性支气管炎", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "JXZQGY", aliases: [{ name: "支气管炎", pinyin: "ZQGY" }] },
  { code: "J40", name: "支气管炎，未特指为急性或慢性", short: "支气管炎", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "ZQGY", aliases: [{ name: "气管炎", pinyin: "QGY" }] },
  { code: "J42", name: "慢性支气管炎，未特指", short: "慢支", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "MXZQGY", aliases: [{ name: "慢性支气管炎", pinyin: "MXZQGY" }, { name: "慢支", pinyin: "MZ" }] },
  { code: "J44.9", name: "慢性阻塞性肺疾病，未特指", short: "慢阻肺", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "MXZSXFJB", aliases: [{ name: "慢阻肺", pinyin: "MZF" }, { name: "COPD", pinyin: "COPD" }] },
  { code: "J45.9", name: "哮喘，未特指", short: "哮喘", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "XC", aliases: [{ name: "支气管哮喘", pinyin: "ZQGXC" }] },
  { code: "J18.9", name: "肺炎，未特指", short: "肺炎", chapterCode: "X", chapterName: "呼吸系统疾病", pinyin: "FY", aliases: [{ name: "社区获得性肺炎", pinyin: "SQHDXFY" }, { name: "支气管肺炎", pinyin: "ZQGFY" }] },

  // 消化系统疾病
  { code: "K29.7", name: "胃炎，未特指", short: "胃炎", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "WY", aliases: [{ name: "慢性浅表性胃炎", pinyin: "MXQBXWY" }, { name: "慢性胃炎", pinyin: "MXWY" }, { name: "急性胃炎", pinyin: "JXWY" }] },
  { code: "K25.9", name: "胃溃疡，未特指为急性或慢性", short: "胃溃疡", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "WKY", aliases: [{ name: "消化性溃疡", pinyin: "XHXYK" }] },
  { code: "K26.9", name: "十二指肠溃疡，未特指为急性或慢性", short: "十二指肠溃疡", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "SEZCKY", aliases: [{ name: "十二指肠球部溃疡", pinyin: "SEZCQBKY" }] },
  { code: "K21.9", name: "胃食管反流病，不伴有食管炎", short: "反流性食管炎", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "WSGFLB", aliases: [{ name: "胃食管反流", pinyin: "WSGFL" }] },
  { code: "K52.9", name: "非感染性胃肠炎和结肠炎，未特指", short: "急性肠胃炎", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "FGXXWCY", aliases: [{ name: "急性胃肠炎", pinyin: "JXWCY" }, { name: "肠胃炎", pinyin: "CWY" }] },
  { code: "K76.0", name: "脂肪(变性)肝，不可归类在他处者", short: "脂肪肝", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "ZFG", aliases: [{ name: "非酒精性脂肪肝", pinyin: "FJJXZFG" }, { name: "脂肪肝", pinyin: "ZFG" }] },
  { code: "K80.2", name: "胆囊结石，不伴胆囊炎", short: "胆结石", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "DNJS", aliases: [{ name: "胆石症", pinyin: "DSZ" }, { name: "胆囊结石", pinyin: "DNJS" }] },
  { code: "K81.9", name: "胆囊炎，未特指", short: "胆囊炎", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "DNY", aliases: [{ name: "慢性胆囊炎", pinyin: "MXDNY" }, { name: "急性胆囊炎", pinyin: "JXDNY" }] },
  { code: "K35.8", name: "急性阑尾炎，其他和未特指", short: "急性阑尾炎", chapterCode: "XI", chapterName: "消化系统疾病", pinyin: "JXLWY", aliases: [{ name: "阑尾炎", pinyin: "LWY" }] },

  // 肌肉骨骼与结缔组织
  { code: "M54.5", name: "腰痛", short: "腰痛", chapterCode: "XIII", chapterName: "肌肉骨骼系统和结缔组织疾病", pinyin: "YT", aliases: [{ name: "急性腰扭伤", pinyin: "JXYNS" }, { name: "腰肌劳损", pinyin: "YJLS" }] },
  { code: "M51.2", name: "其他腰椎间盘移位", short: "腰椎间盘突出", chapterCode: "XIII", chapterName: "肌肉骨骼系统和结缔组织疾病", pinyin: "QTYZJPYW", aliases: [{ name: "腰椎间盘突出症", pinyin: "YZJPTCZ" }, { name: "腰突症", pinyin: "YTZ" }] },
  { code: "M50.9", name: "颈椎间盘疾患，未特指", short: "颈椎病", chapterCode: "XIII", chapterName: "肌肉骨骼系统和结缔组织疾病", pinyin: "JZJPJH", aliases: [{ name: "颈椎综合征", pinyin: "JZZHZ" }, { name: "颈椎病", pinyin: "JZB" }] },
  { code: "M17.9", name: "膝骨关节病，未特指", short: "膝关节炎", chapterCode: "XIII", chapterName: "肌肉骨骼系统和结缔组织疾病", pinyin: "XGGJB", aliases: [{ name: "退行性膝关节炎", pinyin: "TXXXGJY" }, { name: "膝关节骨质增生", pinyin: "XGJGZZS" }] },
  { code: "M81.9", name: "骨质疏松症，未特指", short: "骨质疏松", chapterCode: "XIII", chapterName: "肌肉骨骼系统和结缔组织疾病", pinyin: "GZSSZ", aliases: [{ name: "骨质疏松", pinyin: "GZSS" }] },

  // 泌尿生殖系统
  { code: "N39.0", name: "尿路感染，部位未特指", short: "尿路感染", chapterCode: "XIV", chapterName: "泌尿生殖系统疾病", pinyin: "NLGR", aliases: [{ name: "泌尿道感染", pinyin: "MNDGR" }] },
  { code: "N20.1", name: "输尿管结石", short: "输尿管结石", chapterCode: "XIV", chapterName: "泌尿生殖系统疾病", pinyin: "SNGJS", aliases: [{ name: "输尿管结石", pinyin: "SNGJS" }] },
  { code: "N20.0", name: "肾结石", short: "肾结石", chapterCode: "XIV", chapterName: "泌尿生殖系统疾病", pinyin: "SJS", aliases: [{ name: "肾结石", pinyin: "SJS" }] },
  { code: "N40", name: "前列腺增生", short: "前列腺增生", chapterCode: "XIV", chapterName: "泌尿生殖系统疾病", pinyin: "QLXZS", aliases: [{ name: "良性前列腺增生", pinyin: "LXQLXZS" }, { name: "BPH", pinyin: "BPH" }] },

  // 神经与精神系统
  { code: "G43.9", name: "偏头痛，未特指", short: "偏头痛", chapterCode: "VI", chapterName: "神经系统疾病", pinyin: "PTT", aliases: [{ name: "偏头痛", pinyin: "PTT" }, { name: "血管神经性头痛", pinyin: "XGSJXT" }] },
  { code: "G44.2", name: "紧张型头痛", short: "紧张性头痛", chapterCode: "VI", chapterName: "神经系统疾病", pinyin: "JZXTT", aliases: [{ name: "肌收缩性头痛", pinyin: "JSSXTT" }] },
  { code: "G47.0", name: "失眠", short: "失眠", chapterCode: "VI", chapterName: "神经系统疾病", pinyin: "SM", aliases: [{ name: "睡眠障碍", pinyin: "SMZA" }, { name: "失眠症", pinyin: "SMZ" }] },
  { code: "F41.2", name: "焦虑和抑郁混合障碍", short: "焦虑抑郁状态", chapterCode: "V", chapterName: "精神和行为障碍", pinyin: "JLHYYHHZA", aliases: [{ name: "焦虑状态", pinyin: "JLZT" }] },

  // 皮肤与过敏
  { code: "L50.9", name: "荨麻疹，未特指", short: "荨麻疹", chapterCode: "XII", chapterName: "皮肤和皮下组织疾病", pinyin: "XMZ", aliases: [{ name: "风疹块", pinyin: "FZK" }] },
  { code: "L20.9", name: "特应性皮炎，未特指", short: "湿疹", chapterCode: "XII", chapterName: "皮肤和皮下组织疾病", pinyin: "TYXPY", aliases: [{ name: "湿疹", pinyin: "SZ" }, { name: "过敏性皮炎", pinyin: "GMXPY" }] },

  // 症状体征
  { code: "R05", name: "咳嗽", short: "咳嗽", chapterCode: "XVIII", chapterName: "症状、体征和异常检查结果", pinyin: "KS", aliases: [{ name: "咳嗽症状", pinyin: "KSZZ" }] },
  { code: "R50.9", name: "发热，未特指", short: "发热", chapterCode: "XVIII", chapterName: "症状、体征和异常检查结果", pinyin: "FR", aliases: [{ name: "发烧", pinyin: "FS" }] },
  { code: "R42", name: "头晕和眩晕", short: "头晕", chapterCode: "XVIII", chapterName: "症状、体征和异常检查结果", pinyin: "TYHXY", aliases: [{ name: "头晕", pinyin: "TY" }, { name: "眩晕", pinyin: "XY" }] },
  { code: "R10.4", name: "其他和未特指的腹痛", short: "腹痛", chapterCode: "XVIII", chapterName: "症状、体征和异常检查结果", pinyin: "FT", aliases: [{ name: "胃痛", pinyin: "WT" }, { name: "肚子痛", pinyin: "DZT" }] },
  { code: "R07.4", name: "胸痛，未特指", short: "胸痛", chapterCode: "XVIII", chapterName: "症状、体征和异常检查结果", pinyin: "XT", aliases: [{ name: "胸部闷痛", pinyin: "XBMT" }] },
];

const tcmDiseases = [
  { code: "XK_BING", name: "消渴病", short: "消渴", chapterName: "中医内科病名", pinyin: "XKB", aliases: [{ name: "消渴", pinyin: "XK" }] },
  { code: "XY_BING", name: "眩晕病", short: "眩晕", chapterName: "中医内科病名", pinyin: "XYB", aliases: [{ name: "眩晕", pinyin: "XY" }] },
  { code: "GM_BING", name: "感冒病", short: "感冒", chapterName: "中医内科病名", pinyin: "GMB", aliases: [{ name: "风温感冒", pinyin: "FWGM" }, { name: "感冒", pinyin: "GM" }] },
  { code: "KS_BING", name: "咳嗽病", short: "咳嗽", chapterName: "中医内科病名", pinyin: "KSB", aliases: [{ name: "内伤咳嗽", pinyin: "NSKS" }] },
  { code: "WT_BING", name: "胃痛病", short: "胃脘痛", chapterName: "中医内科病名", pinyin: "WTB", aliases: [{ name: "胃脘痛", pinyin: "WWT" }] },
  { code: "BI_BING", name: "痹病", short: "痹证", chapterName: "中医内科病名", pinyin: "BB", aliases: [{ name: "风湿痹痛", pinyin: "FSBT" }] },
  { code: "XJ_BING", name: "心悸病", short: "心悸", chapterName: "中医内科病名", pinyin: "XJB", aliases: [{ name: "惊悸", pinyin: "JJ" }, { name: "怔忡", pinyin: "ZC" }] },
  { code: "ZF_BING", name: "中风病", short: "中风", chapterName: "中医内科病名", pinyin: "ZFB", aliases: [{ name: "脑卒中", pinyin: "NZZ" }] },
  { code: "XQ_BING", name: "胸痹病", short: "胸痹", chapterName: "中医内科病名", pinyin: "XBB", aliases: [{ name: "胸痹心痛", pinyin: "XBXT" }] },
  { code: "BM_BING", name: "便秘病", short: "便秘", chapterName: "中医内科病名", pinyin: "BMB", aliases: [{ name: "大便秘结", pinyin: "DBMJ" }] },
  { code: "BT_BING", name: "头痛病", short: "头痛", chapterName: "中医内科病名", pinyin: "TTB", aliases: [{ name: "脑风", pinyin: "NF" }] },
  { code: "BM_ZHENG", name: "不寐病", short: "不寐", chapterName: "中医内科病名", pinyin: "BMB", aliases: [{ name: "失眠", pinyin: "SM" }] },
];

const tcmSyndromes = [
  { code: "QY_LX_ZHENG", name: "气阴两虚证", pinyin: "QYLXZ", aliases: [{ name: "气阴不足证", pinyin: "QYBZZ" }] },
  { code: "GY_SK_ZHENG", name: "肝阳上亢证", pinyin: "GYSKZ", aliases: [{ name: "肝阳偏旺证", pinyin: "GYPWZ" }] },
  { code: "FR_FF_ZHENG", name: "风热犯肺证", pinyin: "FRFFZ", aliases: [{ name: "风热感冒证", pinyin: "FRGMZ" }] },
  { code: "FH_SF_ZHENG", name: "风寒束表证", pinyin: "FHSBZ", aliases: [{ name: "风寒感冒证", pinyin: "FHGMZ" }] },
  { code: "TR_ZF_ZHENG", name: "痰热阻肺证", pinyin: "TRZFZ", aliases: [{ name: "痰热壅肺证", pinyin: "TRYFZ" }] },
  { code: "PW_XH_ZHENG", name: "脾胃虚弱证", pinyin: "PWXRZ", aliases: [{ name: "脾虚胃弱证", pinyin: "PXWRZ" }] },
  { code: "QZ_XY_ZHENG", name: "气滞血瘀证", pinyin: "QZXYZ", aliases: [{ name: "血瘀气滞证", pinyin: "XYQZZ" }] },
  { code: "SR_XZ_ZHENG", name: "湿热下注证", pinyin: "SRXZZ", aliases: [{ name: "湿热下焦证", pinyin: "SRXJZ" }] },
  { code: "SY_KX_ZHENG", name: "肾阴亏虚证", pinyin: "SYKXZ", aliases: [{ name: "肾阴虚证", pinyin: "SYXZ" }] },
  { code: "SY_BX_ZHENG", name: "肾阳虚衰证", pinyin: "SYXSZ", aliases: [{ name: "肾阳不足证", pinyin: "SYBZZ" }] },
  { code: "XX_B_NING", name: "心神不宁证", pinyin: "XSBNZ", aliases: [{ name: "神不守舍证", pinyin: "SBSZZ" }] },
  { code: "GY_PF_ZHENG", name: "肝气郁结证", pinyin: "GQYJZ", aliases: [{ name: "肝郁气滞证", pinyin: "GYQZZ" }] },
];

function generateSql(isOracle = false) {
  const lines = [
    "-- =============================================================================",
    `-- RHN Baseline Clinical Terminology & Disease Datasets (${isOracle ? "Oracle" : "PostgreSQL/H2"})`,
    "-- =============================================================================",
    "",
    "-- 1. Code Systems",
  ];

  const csDate = isOracle ? "date '2026-01-01'" : "date '2026-01-01'";
  const now = "current_timestamp";

  lines.push(
    `insert into RHN_BD_CODE_SYSTEM (ID_CODE_SYSTEM, SD_SCOPE_TYPE, ID_SCOPE, CD_CODE_SYSTEM, NA_CODE_SYSTEM, CD_CANONICAL_URI, CD_VER, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, SD_SYS_TYPE, PUBLISHER, DES_CODE_SYSTEM, SD_SRC_TYPE, REVISION, DT_UPDATED, SD_AUTHORITY_TYPE, CD_SRC_URI, HASH_CONTENT, SD_DIAG_DOMAIN)`,
    `values (362387869795001, 'PRODUCT', 0, 'WHO.BD.CS.ICD10', 'ICD-10 疾病分类', 'http://hl7.org/fhir/sid/icd-10', '2019', 'ACTIVE', ${csDate}, null, ${now}, 'DISEASE', '世界卫生组织', '全国标准化ICD-10高频临床疾病目录', 'EXTERNAL_IMPORT', 0, ${now}, 'NATIONAL', null, null, 'WESTERN_MEDICINE');`,
    "",
    `insert into RHN_BD_CODE_SYSTEM (ID_CODE_SYSTEM, SD_SCOPE_TYPE, ID_SCOPE, CD_CODE_SYSTEM, NA_CODE_SYSTEM, CD_CANONICAL_URI, CD_VER, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, SD_SYS_TYPE, PUBLISHER, DES_CODE_SYSTEM, SD_SRC_TYPE, REVISION, DT_UPDATED, SD_AUTHORITY_TYPE, CD_SRC_URI, HASH_CONTENT, SD_DIAG_DOMAIN)`,
    `values (362387870125001, 'PRODUCT', 0, 'RHN.BD.CS.TCM_DISEASE', '中医病名标准目录', 'urn:rhn:codesystem:tcm-disease', '2026.09', 'ACTIVE', ${csDate}, null, ${now}, 'DISEASE', 'RHN', '中医临床常用病名标准术语', 'MANUAL', 0, ${now}, 'INTERNAL', null, null, 'TCM_DISEASE');`,
    "",
    `insert into RHN_BD_CODE_SYSTEM (ID_CODE_SYSTEM, SD_SCOPE_TYPE, ID_SCOPE, CD_CODE_SYSTEM, NA_CODE_SYSTEM, CD_CANONICAL_URI, CD_VER, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, SD_SYS_TYPE, PUBLISHER, DES_CODE_SYSTEM, SD_SRC_TYPE, REVISION, DT_UPDATED, SD_AUTHORITY_TYPE, CD_SRC_URI, HASH_CONTENT, SD_DIAG_DOMAIN)`,
    `values (362387870125002, 'PRODUCT', 0, 'RHN.BD.CS.TCM_SYNDROME', '中医证候标准目录', 'urn:rhn:codesystem:tcm-syndrome', '2026.09', 'ACTIVE', ${csDate}, null, ${now}, 'DISEASE', 'RHN', '中医临床常用辨证证候标准术语', 'MANUAL', 0, ${now}, 'INTERNAL', null, null, 'TCM_SYNDROME');`,
    "",
    "-- 2. Western Medicine Concepts (ICD-10)",
  );

  let conceptIdSeq = 362387869795010n;
  let aliasIdSeq = 362387869795500n;

  const westernConceptIds = [];

  for (const item of diseases) {
    conceptIdSeq += 1n;
    westernConceptIds.push({ id: conceptIdSeq, code: item.code });
    const shortVal = item.short ? `'${item.short}'` : "null";
    const chCode = item.chapterCode ? `'${item.chapterCode}'` : "null";
    const chName = item.chapterName ? `'${item.chapterName}'` : "null";
    lines.push(
      `insert into RHN_BD_CONCEPT (ID_CONCEPT, ID_CODE_SYSTEM, CD_CONCEPT, NA_DISPLAY, DES_DEF, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, SD_CONCEPT_TYPE, NA_SHORT, CD_CHAPTER, NA_CHAPTER, CD_SEARCH, SD_SRC_TYPE, ID_CONCEPT_REPLACEMENT, REVISION, DT_UPDATED)`,
      `values (${conceptIdSeq}, 362387869795001, '${item.code}', '${item.name}', null, 'ACTIVE', ${csDate}, null, ${now}, 'DISEASE', ${shortVal}, ${chCode}, ${chName}, '${item.pinyin}', 'EXTERNAL_IMPORT', null, 0, ${now});`
    );

    for (const alias of item.aliases) {
      aliasIdSeq += 1n;
      lines.push(
        `insert into RHN_BD_CONCEPT_ALIAS (ID_CONCEPT_ALIAS, ID_CONCEPT, SD_ALIAS_TYPE, NA_ALIAS, CD_SEARCH, SD_STATUS)`,
        `values (${aliasIdSeq}, ${conceptIdSeq}, 'SYNONYM', '${alias.name}', '${alias.pinyin}', 'ACTIVE');`
      );
    }
  }

  lines.push("", "-- 3. TCM Diseases Concepts");
  for (const item of tcmDiseases) {
    conceptIdSeq += 1n;
    const shortVal = item.short ? `'${item.short}'` : "null";
    const chName = item.chapterName ? `'${item.chapterName}'` : "null";
    lines.push(
      `insert into RHN_BD_CONCEPT (ID_CONCEPT, ID_CODE_SYSTEM, CD_CONCEPT, NA_DISPLAY, DES_DEF, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, SD_CONCEPT_TYPE, NA_SHORT, CD_CHAPTER, NA_CHAPTER, CD_SEARCH, SD_SRC_TYPE, ID_CONCEPT_REPLACEMENT, REVISION, DT_UPDATED)`,
      `values (${conceptIdSeq}, 362387870125001, '${item.code}', '${item.name}', null, 'ACTIVE', ${csDate}, null, ${now}, 'DISEASE', ${shortVal}, null, ${chName}, '${item.pinyin}', 'MANUAL', null, 0, ${now});`
    );
    for (const alias of item.aliases) {
      aliasIdSeq += 1n;
      lines.push(
        `insert into RHN_BD_CONCEPT_ALIAS (ID_CONCEPT_ALIAS, ID_CONCEPT, SD_ALIAS_TYPE, NA_ALIAS, CD_SEARCH, SD_STATUS)`,
        `values (${aliasIdSeq}, ${conceptIdSeq}, 'SYNONYM', '${alias.name}', '${alias.pinyin}', 'ACTIVE');`
      );
    }
  }

  lines.push("", "-- 4. TCM Syndrome Concepts");
  for (const item of tcmSyndromes) {
    conceptIdSeq += 1n;
    lines.push(
      `insert into RHN_BD_CONCEPT (ID_CONCEPT, ID_CODE_SYSTEM, CD_CONCEPT, NA_DISPLAY, DES_DEF, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, SD_CONCEPT_TYPE, NA_SHORT, CD_CHAPTER, NA_CHAPTER, CD_SEARCH, SD_SRC_TYPE, ID_CONCEPT_REPLACEMENT, REVISION, DT_UPDATED)`,
      `values (${conceptIdSeq}, 362387870125002, '${item.code}', '${item.name}', null, 'ACTIVE', ${csDate}, null, ${now}, 'SYNDROME', null, null, '中医辨证证候', '${item.pinyin}', 'MANUAL', null, 0, ${now});`
    );
    for (const alias of item.aliases) {
      aliasIdSeq += 1n;
      lines.push(
        `insert into RHN_BD_CONCEPT_ALIAS (ID_CONCEPT_ALIAS, ID_CONCEPT, SD_ALIAS_TYPE, NA_ALIAS, CD_SEARCH, SD_STATUS)`,
        `values (${aliasIdSeq}, ${conceptIdSeq}, 'SYNONYM', '${alias.name}', '${alias.pinyin}', 'ACTIVE');`
      );
    }
  }

  lines.push(
    "",
    "-- 5. Disease Management Programs, Members & Rules",
    `insert into RHN_HPL_DISEASE_MGMT_PROG (ID_DISEASE_MGMT_PROG, REVISION, SD_SCOPE_TYPE, ID_SCOPE, CD_DISEASE_MGMT_PROG, NA_DISEASE_MGMT_PROG, SD_MGMT_TYPE, SD_TRIGGER_ACTION, DES_DISEASE_MGMT_PROG, SD_REPORT_CARD_TYPE, QTY_REPORT_DEADLINE_HOURS, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, DT_UPDATED)`,
    `values (362387870123001, 0, 'PRODUCT', 0, 'CHRONIC_HYPERTENSION', '高血压慢病管理', 'CHRONIC_CARE', 'CREATE_FOLLOW_UP_TASK', '确诊后提示进入高血压慢病管理候选；是否正式纳入仍需临床或公卫人员确认', null, null, 'ACTIVE', ${csDate}, null, ${now}, ${now});`,
    "",
    `insert into RHN_HPL_DISEASE_MGMT_PROG (ID_DISEASE_MGMT_PROG, REVISION, SD_SCOPE_TYPE, ID_SCOPE, CD_DISEASE_MGMT_PROG, NA_DISEASE_MGMT_PROG, SD_MGMT_TYPE, SD_TRIGGER_ACTION, DES_DISEASE_MGMT_PROG, SD_REPORT_CARD_TYPE, QTY_REPORT_DEADLINE_HOURS, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, DT_UPDATED)`,
    `values (362387870123002, 0, 'PRODUCT', 0, 'CHRONIC_DIABETES', '糖尿病慢病管理', 'CHRONIC_CARE', 'CREATE_FOLLOW_UP_TASK', '确诊后提示进入糖尿病慢病管理候选；避免重复建档', null, null, 'ACTIVE', ${csDate}, null, ${now}, ${now});`,
    "",
    `insert into RHN_HPL_DISEASE_MGMT_PROG (ID_DISEASE_MGMT_PROG, REVISION, SD_SCOPE_TYPE, ID_SCOPE, CD_DISEASE_MGMT_PROG, NA_DISEASE_MGMT_PROG, SD_MGMT_TYPE, SD_TRIGGER_ACTION, DES_DISEASE_MGMT_PROG, SD_REPORT_CARD_TYPE, QTY_REPORT_DEADLINE_HOURS, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DT_CREATED, DT_UPDATED)`,
    `values (362387870123003, 0, 'PRODUCT', 0, 'NOTIFIABLE_DISEASE', '疾病报卡', 'DISEASE_REPORT', 'CREATE_REPORT_DRAFT', '命中后创建待医生确认的疾病报卡草稿，具体时限由适用规则配置', 'INFECTIOUS_DISEASE', null, 'ACTIVE', ${csDate}, null, ${now}, ${now});`,
  );

  const hypId = westernConceptIds.find((c) => c.code === "I10")?.id ?? 362387869795011n;
  const diabId = westernConceptIds.find((c) => c.code === "E11.9")?.id ?? 362387869795012n;

  lines.push(
    "",
    `insert into RHN_HPL_DISEASE_MGMT_MEMBER (ID_DISEASE_MGMT_MEMBER, ID_DISEASE_MGMT_PROG, ID_CONCEPT, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DES_NOTE, DT_CREATED, SD_INCLUSION_MODE)`,
    `values (362387870124001, 362387870123001, ${hypId}, 'ACTIVE', ${csDate}, null, 'ICD-10 I10 高血压管理', ${now}, 'INCLUDE');`,
    "",
    `insert into RHN_HPL_DISEASE_MGMT_MEMBER (ID_DISEASE_MGMT_MEMBER, ID_DISEASE_MGMT_PROG, ID_CONCEPT, SD_STATUS, DA_EFFECTIVE_FROM, DA_EFFECTIVE_TO, DES_NOTE, DT_CREATED, SD_INCLUSION_MODE)`,
    `values (362387870124002, 362387870123002, ${diabId}, 'ACTIVE', ${csDate}, null, 'ICD-10 E11.9 糖尿病管理', ${now}, 'INCLUDE');`,
    "",
    `insert into RHN_HPL_DISEASE_MGMT_RULE (ID_DISEASE_MGMT_RULE, ID_DISEASE_MGMT_PROG, SD_INCLUSION_MODE, SD_DIAG_DOMAIN, ID_CODE_SYSTEM, SD_CONCEPT_TYPE, CD_CHAPTER, CD_CODE_FROM, CD_CODE_TO, DES_NOTE, DT_CREATED)`,
    `values (362387870127001, 362387870123001, 'INCLUDE', 'WESTERN_MEDICINE', 362387869795001, 'DISEASE', null, 'I10', 'I15.9', '按 ICD-10 编码范围识别高血压相关疾病', ${now});`,
    "",
    `insert into RHN_HPL_DISEASE_MGMT_RULE (ID_DISEASE_MGMT_RULE, ID_DISEASE_MGMT_PROG, SD_INCLUSION_MODE, SD_DIAG_DOMAIN, ID_CODE_SYSTEM, SD_CONCEPT_TYPE, CD_CHAPTER, CD_CODE_FROM, CD_CODE_TO, DES_NOTE, DT_CREATED)`,
    `values (362387870127002, 362387870123002, 'INCLUDE', 'WESTERN_MEDICINE', 362387869795001, 'DISEASE', null, 'E10', 'E14.9', '按 ICD-10 编码范围识别糖尿病相关疾病', ${now});`,
    ""
  );

  return `${lines.join("\n")}\n`;
}

const rootDir = process.cwd();
const genericPath = path.join(rootDir, "backend/src/main/resources/db/migration/V1_2_0__rhn_clinical_disease.sql");
const oraclePath = path.join(rootDir, "backend/src/main/resources/db/oracle/V1_2_0__rhn_clinical_disease.sql");

fs.writeFileSync(genericPath, generateSql(false), "utf8");
fs.writeFileSync(oraclePath, generateSql(true), "utf8");

console.log("Generated rich clinical disease dataset for migration and oracle.");
