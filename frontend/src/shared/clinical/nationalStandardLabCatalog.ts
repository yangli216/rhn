/**
 * WS/T 404/405-2012 & WS 445.10-2014 国家卫生行业标准检验指标与参考区间字典
 *
 * 保留既有参考指标集，并承载按项目编码匹配的预置录入结构。
 * 参考区间仅在有明确依据时提供；正式规则以机构发布版本为准，不推定危急阈值。
 * 数据结构严格对齐后端 DiagnosticIndicatorDefinition 及 DiagnosticTemplateValidation。
 */

import laboratoryResultPresets from './laboratoryResultPresets.json'

import type { DiagnosticIndicatorDefinition, DiagnosticReferenceRule, DiagnosticTemplateContent, DiagnosticTemplateVersion } from '../api/diagnosticTemplateTypes'

/** 1. 血常规五分类指标集（WS/T 405-2012 血细胞分析参考区间，24 项指标，紫头 EDTA-K2 管） */
export const CBC_5PART_INDICATORS: readonly DiagnosticIndicatorDefinition[] = [
  {
    code: 'WBC',
    name: '白细胞计数 (WBC)',
    valueType: 'NUMBER',
    unitCode: '10^9/L',
    precision: 2,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [
      {
        code: 'WBC_ADULT',
        minimumAgeDays: 6570, // >= 18岁
        referenceLow: 3.50,
        referenceHigh: 9.50,
        criticalLow: 2.50,
        criticalHigh: 25.00,
        criticalCodes: [],
      },
      {
        code: 'WBC_CHILD',
        minimumAgeDays: 28,
        maximumAgeDays: 6570, // 28天 ~ 18岁
        referenceLow: 4.50,
        referenceHigh: 11.00,
        criticalLow: 2.00,
        criticalHigh: 30.00,
        criticalCodes: [],
      },
    ],
  },
  {
    code: 'RBC',
    name: '红细胞计数 (RBC)',
    valueType: 'NUMBER',
    unitCode: '10^12/L',
    precision: 2,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [
      {
        code: 'RBC_MALE',
        gender: '1',
        minimumAgeDays: 6570,
        referenceLow: 4.30,
        referenceHigh: 5.80,
        criticalLow: 1.50,
        criticalHigh: 6.80,
        criticalCodes: [],
      },
      {
        code: 'RBC_FEMALE',
        gender: '2',
        minimumAgeDays: 6570,
        referenceLow: 3.80,
        referenceHigh: 5.10,
        criticalLow: 1.50,
        criticalHigh: 6.50,
        criticalCodes: [],
      },
    ],
  },
  {
    code: 'HGB',
    name: '血红蛋白测定 (HGB)',
    valueType: 'NUMBER',
    unitCode: 'g/L',
    precision: 0,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [
      {
        code: 'HGB_MALE',
        gender: '1',
        minimumAgeDays: 6570,
        referenceLow: 130,
        referenceHigh: 175,
        criticalLow: 50,
        criticalHigh: 200,
        criticalCodes: [],
      },
      {
        code: 'HGB_FEMALE',
        gender: '2',
        minimumAgeDays: 6570,
        referenceLow: 115,
        referenceHigh: 150,
        criticalLow: 50,
        criticalHigh: 200,
        criticalCodes: [],
      },
    ],
  },
  {
    code: 'HCT',
    name: '红细胞比容 (HCT)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [
      { code: 'HCT_MALE', gender: '1', minimumAgeDays: 6570, referenceLow: 40.0, referenceHigh: 50.0, criticalCodes: [] },
      { code: 'HCT_FEMALE', gender: '2', minimumAgeDays: 6570, referenceLow: 35.0, referenceHigh: 45.0, criticalCodes: [] },
    ],
  },
  {
    code: 'MCV',
    name: '平均红细胞体积 (MCV)',
    valueType: 'NUMBER',
    unitCode: 'fL',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'MCV_ALL', referenceLow: 82.0, referenceHigh: 100.0, criticalCodes: [] }],
  },
  {
    code: 'MCH',
    name: '平均红细胞血红蛋白量 (MCH)',
    valueType: 'NUMBER',
    unitCode: 'pg',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'MCH_ALL', referenceLow: 27.0, referenceHigh: 34.0, criticalCodes: [] }],
  },
  {
    code: 'MCHC',
    name: '平均红细胞血红蛋白浓度 (MCHC)',
    valueType: 'NUMBER',
    unitCode: 'g/L',
    precision: 0,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'MCHC_ALL', referenceLow: 316, referenceHigh: 354, criticalCodes: [] }],
  },
  {
    code: 'RDW_CV',
    name: '红细胞体积分布宽度变异系数 (RDW-CV)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'RDW_CV_ALL', referenceLow: 11.5, referenceHigh: 14.5, criticalCodes: [] }],
  },
  {
    code: 'RDW_SD',
    name: '红细胞体积分布宽度标准差 (RDW-SD)',
    valueType: 'NUMBER',
    unitCode: 'fL',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'RDW_SD_ALL', referenceLow: 39.0, referenceHigh: 46.0, criticalCodes: [] }],
  },
  {
    code: 'PLT',
    name: '血小板计数 (PLT)',
    valueType: 'NUMBER',
    unitCode: '10^9/L',
    precision: 0,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [
      {
        code: 'PLT_ADULT',
        minimumAgeDays: 6570,
        referenceLow: 125,
        referenceHigh: 350,
        criticalLow: 50,
        criticalHigh: 600,
        criticalCodes: [],
      },
    ],
  },
  {
    code: 'MPV',
    name: '平均血小板体积 (MPV)',
    valueType: 'NUMBER',
    unitCode: 'fL',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'MPV_ALL', referenceLow: 9.0, referenceHigh: 13.0, criticalCodes: [] }],
  },
  {
    code: 'PDW',
    name: '血小板体积分布宽度 (PDW)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'PDW_ALL', referenceLow: 9.0, referenceHigh: 17.0, criticalCodes: [] }],
  },
  {
    code: 'PCT',
    name: '血小板压积 (PCT)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 3,
    required: false,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'PCT_ALL', referenceLow: 0.108, referenceHigh: 0.282, criticalCodes: [] }],
  },
  {
    code: 'P_LCR',
    name: '大血小板比率 (P-LCR)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 1,
    required: false,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'P_LCR_ALL', referenceLow: 13.0, referenceHigh: 43.0, criticalCodes: [] }],
  },
  {
    code: 'P_LCC',
    name: '大血小板数目 (P-LCC)',
    valueType: 'NUMBER',
    unitCode: '10^9/L',
    precision: 0,
    required: false,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'P_LCC_ALL', referenceLow: 30, referenceHigh: 90, criticalCodes: [] }],
  },
  {
    code: 'NEUT_NUM',
    name: '中性粒细胞绝对值 (NEUT#)',
    valueType: 'NUMBER',
    unitCode: '10^9/L',
    precision: 2,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [
      {
        code: 'NEUT_NUM_ALL',
        referenceLow: 1.80,
        referenceHigh: 6.30,
        criticalLow: 1.00,
        criticalHigh: 20.00,
        criticalCodes: [],
      },
    ],
  },
  {
    code: 'LYMPH_NUM',
    name: '淋巴细胞绝对值 (LYMPH#)',
    valueType: 'NUMBER',
    unitCode: '10^9/L',
    precision: 2,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'LYMPH_NUM_ALL', referenceLow: 1.10, referenceHigh: 3.20, criticalCodes: [] }],
  },
  {
    code: 'MONO_NUM',
    name: '单核细胞绝对值 (MONO#)',
    valueType: 'NUMBER',
    unitCode: '10^9/L',
    precision: 2,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'MONO_NUM_ALL', referenceLow: 0.10, referenceHigh: 0.60, criticalCodes: [] }],
  },
  {
    code: 'EO_NUM',
    name: '嗜酸性粒细胞绝对值 (EO#)',
    valueType: 'NUMBER',
    unitCode: '10^9/L',
    precision: 2,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'EO_NUM_ALL', referenceLow: 0.02, referenceHigh: 0.52, criticalCodes: [] }],
  },
  {
    code: 'BASO_NUM',
    name: '嗜碱性粒细胞绝对值 (BASO#)',
    valueType: 'NUMBER',
    unitCode: '10^9/L',
    precision: 2,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'BASO_NUM_ALL', referenceLow: 0.00, referenceHigh: 0.06, criticalCodes: [] }],
  },
  {
    code: 'NEUT_PCT',
    name: '中性粒细胞百分比 (NEUT%)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'NEUT_PCT_ALL', referenceLow: 40.0, referenceHigh: 75.0, criticalCodes: [] }],
  },
  {
    code: 'LYMPH_PCT',
    name: '淋巴细胞百分比 (LYMPH%)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'LYMPH_PCT_ALL', referenceLow: 20.0, referenceHigh: 50.0, criticalCodes: [] }],
  },
  {
    code: 'MONO_PCT',
    name: '单核细胞百分比 (MONO%)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'MONO_PCT_ALL', referenceLow: 3.0, referenceHigh: 10.0, criticalCodes: [] }],
  },
  {
    code: 'EO_PCT',
    name: '嗜酸性粒细胞百分比 (EO%)',
    valueType: 'NUMBER',
    unitCode: '%',
    precision: 1,
    required: true,
    specimenType: '全血',
    allowedCodes: [],
    rules: [{ code: 'EO_PCT_ALL', referenceLow: 0.4, referenceHigh: 8.0, criticalCodes: [] }],
  },
] as const

/** 2. 尿液常规分析指标集（WS 445.10，15 项指标，尿试管/尿杯） */
export const URINALYSIS_INDICATORS: readonly DiagnosticIndicatorDefinition[] = [
  {
    code: 'LEU',
    name: '尿白细胞酯酶 (LEU)',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['-', '±', '1+', '2+', '3+'],
    rules: [{ code: 'LEU_NORM', criticalCodes: [] }],
  },
  {
    code: 'NIT',
    name: '尿亚硝酸盐 (NIT)',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['-', '+'],
    rules: [{ code: 'NIT_NORM', criticalCodes: [] }],
  },
  {
    code: 'UBG',
    name: '尿胆原 (UBG)',
    valueType: 'NUMBER',
    unitCode: 'umol/L',
    precision: 1,
    required: true,
    specimenType: '尿液',
    allowedCodes: [],
    rules: [{ code: 'UBG_NORM', referenceLow: 3.2, referenceHigh: 16.0, criticalCodes: [] }],
  },
  {
    code: 'PRO',
    name: '尿蛋白质 (PRO)',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['-', '±', '1+', '2+', '3+'],
    rules: [{ code: 'PRO_NORM', criticalCodes: [] }],
  },
  {
    code: 'PH',
    name: '尿酸碱度 (pH)',
    valueType: 'NUMBER',
    unitCode: 'pH',
    precision: 1,
    required: true,
    specimenType: '尿液',
    allowedCodes: [],
    rules: [{ code: 'PH_NORM', referenceLow: 4.5, referenceHigh: 8.0, criticalCodes: [] }],
  },
  {
    code: 'BLD',
    name: '尿隐血/潜血 (BLD)',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['-', '±', '1+', '2+', '3+'],
    rules: [{ code: 'BLD_NORM', criticalCodes: [] }],
  },
  {
    code: 'SG',
    name: '尿比重 (SG)',
    valueType: 'NUMBER',
    unitCode: '',
    precision: 3,
    required: true,
    specimenType: '尿液',
    allowedCodes: [],
    rules: [{ code: 'SG_NORM', referenceLow: 1.015, referenceHigh: 1.025, criticalCodes: [] }],
  },
  {
    code: 'KET',
    name: '尿酮体 (KET)',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['-', '±', '1+', '2+', '3+'],
    rules: [{ code: 'KET_NORM', criticalCodes: ['3+'] }],
  },
  {
    code: 'BIL',
    name: '尿胆红素 (BIL)',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['-', '1+', '2+', '3+'],
    rules: [{ code: 'BIL_NORM', criticalCodes: [] }],
  },
  {
    code: 'GLU_U',
    name: '尿葡萄糖 (GLU)',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['-', '±', '1+', '2+', '3+'],
    rules: [{ code: 'GLU_U_NORM', criticalCodes: [] }],
  },
  {
    code: 'VC',
    name: '维生素C (VC)',
    valueType: 'NUMBER',
    unitCode: 'mmol/L',
    precision: 1,
    required: false,
    specimenType: '尿液',
    allowedCodes: [],
    rules: [{ code: 'VC_NORM', referenceLow: 0.0, referenceHigh: 0.6, criticalCodes: [] }],
  },
  {
    code: 'COLOR',
    name: '尿液颜色',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['淡黄色', '黄色', '深黄色', '洗肉水样', '乳白色', '酱油色'],
    rules: [{ code: 'COLOR_NORM', criticalCodes: [] }],
  },
  {
    code: 'CLARITY',
    name: '透明度',
    valueType: 'CODE',
    required: true,
    specimenType: '尿液',
    allowedCodes: ['清晰', '微浑', '浑浊'],
    rules: [{ code: 'CLARITY_NORM', criticalCodes: [] }],
  },
  {
    code: 'RBC_HP',
    name: '镜检红细胞 (RBC/HPF)',
    valueType: 'NUMBER',
    unitCode: '/HPF',
    precision: 0,
    required: true,
    specimenType: '尿液',
    allowedCodes: [],
    rules: [{ code: 'RBC_HP_NORM', referenceLow: 0, referenceHigh: 3, criticalCodes: [] }],
  },
  {
    code: 'WBC_HP',
    name: '镜检白细胞 (WBC/HPF)',
    valueType: 'NUMBER',
    unitCode: '/HPF',
    precision: 0,
    required: true,
    specimenType: '尿液',
    allowedCodes: [],
    rules: [{ code: 'WBC_HP_NORM', referenceLow: 0, referenceHigh: 5, criticalCodes: [] }],
  },
] as const

/** 3. 肝功能常用组（WS/T 404.1/2/3/4/5-2012，12 项指标，黄头促凝胶管） */
export const LIVER_PANEL_INDICATORS: readonly DiagnosticIndicatorDefinition[] = [
  {
    code: 'ALT',
    name: '丙氨酸氨基转移酶 (ALT)',
    valueType: 'NUMBER',
    unitCode: 'U/L',
    precision: 0,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [
      { code: 'ALT_MALE', gender: '1', referenceLow: 9, referenceHigh: 50, criticalHigh: 500, criticalCodes: [] },
      { code: 'ALT_FEMALE', gender: '2', referenceLow: 7, referenceHigh: 40, criticalHigh: 500, criticalCodes: [] },
    ],
  },
  {
    code: 'AST',
    name: '天门冬氨酸氨基转移酶 (AST)',
    valueType: 'NUMBER',
    unitCode: 'U/L',
    precision: 0,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [
      { code: 'AST_MALE', gender: '1', referenceLow: 15, referenceHigh: 40, criticalHigh: 500, criticalCodes: [] },
      { code: 'AST_FEMALE', gender: '2', referenceLow: 13, referenceHigh: 35, criticalHigh: 500, criticalCodes: [] },
    ],
  },
  {
    code: 'AST_ALT_RATIO',
    name: '谷草/谷丙比值 (AST/ALT)',
    valueType: 'NUMBER',
    unitCode: '',
    precision: 2,
    required: false,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'RATIO_NORM', referenceLow: 0.80, referenceHigh: 1.50, criticalCodes: [] }],
  },
  {
    code: 'GGT',
    name: 'γ-谷氨酰基转移酶 (GGT)',
    valueType: 'NUMBER',
    unitCode: 'U/L',
    precision: 0,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [
      { code: 'GGT_MALE', gender: '1', referenceLow: 10, referenceHigh: 60, criticalCodes: [] },
      { code: 'GGT_FEMALE', gender: '2', referenceLow: 7, referenceHigh: 45, criticalCodes: [] },
    ],
  },
  {
    code: 'ALP',
    name: '碱性磷酸酶 (ALP)',
    valueType: 'NUMBER',
    unitCode: 'U/L',
    precision: 0,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'ALP_ADULT', minimumAgeDays: 6570, referenceLow: 45, referenceHigh: 125, criticalCodes: [] }],
  },
  {
    code: 'TBIL',
    name: '总胆红素 (TBIL)',
    valueType: 'NUMBER',
    unitCode: 'umol/L',
    precision: 1,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'TBIL_ALL', referenceLow: 3.4, referenceHigh: 20.5, criticalHigh: 340.0, criticalCodes: [] }],
  },
  {
    code: 'DBIL',
    name: '直接胆红素 (DBIL)',
    valueType: 'NUMBER',
    unitCode: 'umol/L',
    precision: 1,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'DBIL_ALL', referenceLow: 0.0, referenceHigh: 6.8, criticalCodes: [] }],
  },
  {
    code: 'IBIL',
    name: '间接胆红素 (IBIL)',
    valueType: 'NUMBER',
    unitCode: 'umol/L',
    precision: 1,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'IBIL_ALL', referenceLow: 1.7, referenceHigh: 13.7, criticalCodes: [] }],
  },
  {
    code: 'TP',
    name: '总蛋白 (TP)',
    valueType: 'NUMBER',
    unitCode: 'g/L',
    precision: 1,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'TP_ALL', referenceLow: 65.0, referenceHigh: 85.0, criticalCodes: [] }],
  },
  {
    code: 'ALB',
    name: '白蛋白 (ALB)',
    valueType: 'NUMBER',
    unitCode: 'g/L',
    precision: 1,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'ALB_ALL', referenceLow: 40.0, referenceHigh: 55.0, criticalLow: 20.0, criticalCodes: [] }],
  },
  {
    code: 'GLO',
    name: '球蛋白 (GLO)',
    valueType: 'NUMBER',
    unitCode: 'g/L',
    precision: 1,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'GLO_ALL', referenceLow: 20.0, referenceHigh: 35.0, criticalCodes: [] }],
  },
  {
    code: 'AG_RATIO',
    name: '白球比 (A/G)',
    valueType: 'NUMBER',
    unitCode: '',
    precision: 2,
    required: false,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'AG_RATIO_ALL', referenceLow: 1.20, referenceHigh: 2.40, criticalCodes: [] }],
  },
] as const

/** 4. 肾功能三项（WS/T 404.6/7-2012，3 项指标，黄头促凝胶管） */
export const RENAL_PANEL_INDICATORS: readonly DiagnosticIndicatorDefinition[] = [
  {
    code: 'BUN',
    name: '尿素氮 (BUN)',
    valueType: 'NUMBER',
    unitCode: 'mmol/L',
    precision: 1,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [{ code: 'BUN_ALL', referenceLow: 2.8, referenceHigh: 7.2, criticalHigh: 35.7, criticalCodes: [] }],
  },
  {
    code: 'CREA',
    name: '肌酐 (CREA)',
    valueType: 'NUMBER',
    unitCode: 'umol/L',
    precision: 0,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [
      { code: 'CREA_MALE', gender: '1', referenceLow: 57, referenceHigh: 97, criticalHigh: 650, criticalCodes: [] },
      { code: 'CREA_FEMALE', gender: '2', referenceLow: 41, referenceHigh: 73, criticalHigh: 650, criticalCodes: [] },
    ],
  },
  {
    code: 'UA',
    name: '尿酸 (UA)',
    valueType: 'NUMBER',
    unitCode: 'umol/L',
    precision: 0,
    required: true,
    specimenType: '血清',
    allowedCodes: [],
    rules: [
      { code: 'UA_MALE', gender: '1', referenceLow: 208, referenceHigh: 428, criticalCodes: [] },
      { code: 'UA_FEMALE', gender: '2', referenceLow: 155, referenceHigh: 357, criticalCodes: [] },
    ],
  },
] as const

/** 5. 空腹静脉血糖（WS/T 404.8-2012，1 项指标，灰头/黄头管） */
export const GLUCOSE_INDICATORS: readonly DiagnosticIndicatorDefinition[] = [
  {
    code: 'GLU',
    name: '空腹血浆葡萄糖 (GLU)',
    valueType: 'NUMBER',
    unitCode: 'mmol/L',
    precision: 2,
    required: true,
    specimenType: '血浆',
    allowedCodes: [],
    rules: [
      {
        code: 'GLU_FASTING',
        referenceLow: 3.90,
        referenceHigh: 6.10,
        criticalLow: 2.80,
        criticalHigh: 22.20,
        criticalCodes: [],
      },
    ],
  },
] as const

export interface NationalStandardLabTemplate {
  templateCode: string
  templateName: string
  serviceType: 'LABORATORY'
  specimenTubeCode: string
  specimenType: string
  standardBasis: string
  conditionLabels?: Record<string, string>
  referenceGuidance?: Record<string, string>
  content: DiagnosticTemplateContent
}

function currentBiochemistryReferences(indicators: readonly DiagnosticIndicatorDefinition[]): DiagnosticIndicatorDefinition[] {
  return indicators.map((indicator) => {
    const preset = (laboratoryResultPresets as NationalStandardLabTemplate[]).flatMap((item) => item.content.indicators).find((item) => item.code === indicator.code)
    if (preset) return { ...indicator, rules: preset.rules as DiagnosticReferenceRule[] }
    if (indicator.code === 'GLO' || indicator.code === 'AG_RATIO') {
      return { ...indicator, rules: [{ code: `WST4042_${indicator.code}`, minimumAgeDays: 7300, maximumAgeDays: 29200,
        referenceLow: indicator.code === 'GLO' ? 20 : 1.2, referenceHigh: indicator.code === 'GLO' ? 40 : 2.4, criticalCodes: [] }] }
    }
    return { ...indicator, rules: [] }
  })
}

const STANDARD_LAB_PANELS: readonly NationalStandardLabTemplate[] = [
  {
    templateCode: 'TPL_LAB_CBC_5PART',
    templateName: '血常规（五分类）标准模板',
    serviceType: 'LABORATORY',
    specimenTubeCode: 'TUBE_PURPLE_EDTA',
    specimenType: '全血',
    standardBasis: 'WS/T 405-2012 血细胞分析参考区间',
    content: {
      indicators: [...CBC_5PART_INDICATORS],
      phrases: [],
      requiredChecks: [],
      minimumImages: 0,
    },
  },
  {
    templateCode: 'TPL_LAB_URINALYSIS',
    templateName: '尿液常规分析标准模板',
    serviceType: 'LABORATORY',
    specimenTubeCode: 'CONTAINER_URINE_CUP',
    specimenType: '尿液',
    standardBasis: 'WS 445.10-2014 电子病历基本数据集',
    content: {
      indicators: [...URINALYSIS_INDICATORS],
      phrases: [],
      requiredChecks: [],
      minimumImages: 0,
    },
  },
  {
    templateCode: 'TPL_LAB_LIVER',
    templateName: '肝功能常用组标准模板',
    serviceType: 'LABORATORY',
    specimenTubeCode: 'TUBE_YELLOW_SST',
    specimenType: '血清',
    standardBasis: 'WS/T 404.1/2-2012、404.4-2018；按性别、年龄、分析系统选择参考规则',
    content: {
      indicators: currentBiochemistryReferences(LIVER_PANEL_INDICATORS),
      phrases: [],
      requiredChecks: [],
      minimumImages: 0,
    },
  },
  {
    templateCode: 'TPL_LAB_RENAL',
    templateName: '肾功能三项标准模板',
    serviceType: 'LABORATORY',
    specimenTubeCode: 'TUBE_YELLOW_SST',
    specimenType: '血清',
    standardBasis: 'WS/T 404.5-2015；肌酐需确认ID-MS溯源；尿酸按本机构方法确认',
    content: {
      indicators: currentBiochemistryReferences(RENAL_PANEL_INDICATORS),
      phrases: [],
      requiredChecks: [],
      minimumImages: 0,
    },
  },
  {
    templateCode: 'TPL_LAB_GLUCOSE',
    templateName: '静脉空腹血糖测定标准模板',
    serviceType: 'LABORATORY',
    specimenTubeCode: 'TUBE_GRAY_NAF',
    specimenType: '血浆',
    standardBasis: '空腹葡萄糖常用参考3.9～6.1 mmol/L；国家卫健委2025-11-06发布会；需确认非妊娠、空腹≥8小时；非诊断切点',
    content: {
      indicators: currentBiochemistryReferences(GLUCOSE_INDICATORS),
      phrases: [],
      requiredChecks: [],
      minimumImages: 0,
    },
  },
] as const

/** Explicit order-code mappings; new entries define structure without asserting institution reference rules. */
export const LABORATORY_RESULT_PRESETS: readonly (NationalStandardLabTemplate & { itemCode: string; itemName: string })[] =
  laboratoryResultPresets as (NationalStandardLabTemplate & { itemCode: string; itemName: string })[]

export const NATIONAL_STANDARD_LAB_TEMPLATES: readonly NationalStandardLabTemplate[] = [
  ...STANDARD_LAB_PANELS, ...LABORATORY_RESULT_PRESETS,
]

/** Versioned clinical reference wording is data, not an automatic normality or treatment rule. */
export function findReferenceGuidance(ruleCode?: string): string | undefined {
  if (!ruleCode) return undefined
  return LABORATORY_RESULT_PRESETS.find((item) => item.referenceGuidance?.[ruleCode])?.referenceGuidance?.[ruleCode]
}

export function referenceConditionLabel(code: string): string {
  return LABORATORY_RESULT_PRESETS.find((item) => item.conditionLabels?.[code])?.conditionLabels?.[code] ?? code
}

export function defaultReferenceNote(template: DiagnosticTemplateVersion): string {
  return template.content.indicators.some((indicator) => indicator.rules.some((rule) => findReferenceGuidance(rule.code)))
    ? `参考说明：${template.publicationBasis}` : ''
}

export function savedReferenceGuidance(snapshot?: string | null): string | undefined {
  if (!snapshot) return undefined
  try {
    const value = JSON.parse(snapshot) as { evaluation?: { matchedRule?: { code?: string } } }
    return findReferenceGuidance(value.evaluation?.matchedRule?.code)
  } catch { return undefined }
}

/** 根据代码查找国家标准检验模板 */
export function findNationalLabTemplateByCode(templateCode?: string): NationalStandardLabTemplate | undefined {
  if (!templateCode) return undefined
  return NATIONAL_STANDARD_LAB_TEMPLATES.find((tpl) => tpl.templateCode === templateCode)
}

/** 将国家标准检验模板封装为 DiagnosticTemplateVersion 格式，便于前端统一渲染 */
export function nationalTemplateAsVersion(tpl: NationalStandardLabTemplate): DiagnosticTemplateVersion {
  return {
    id: tpl.templateCode,
    organizationId: '',
    catalogItemId: '',
    version: 1,
    serviceType: tpl.serviceType,
    effectiveFrom: tpl.templateCode.startsWith('TPL_LAB_ITEM_') ? '2026-01-01' : '2012-12-25',
    publicationBasis: tpl.standardBasis,
    publishedBy: '系统预置',
    publishedAt: tpl.templateCode.startsWith('TPL_LAB_ITEM_') ? '2026-01-01T00:00:00Z' : '2012-12-25T00:00:00Z',
    content: tpl.content,
  }
}

/** Catalog codes are authoritative. A known code never falls back to an unrelated display name. */
export function matchPresetTemplateByTask(task: { itemName?: string; itemCode?: string }): NationalStandardLabTemplate | undefined {
  const code = task.itemCode?.trim()
  if (code && /^\d+$/.test(code)) return LABORATORY_RESULT_PRESETS.find((item) => item.itemCode === code)
  return matchNationalLabTemplateByItemName(task.itemName)
}

/** Only exact legacy names are supported; single tests never inherit an entire panel. */
export function matchNationalLabTemplateByItemName(itemName?: string): NationalStandardLabTemplate | undefined {
  if (!itemName) return undefined
  const normalize = (name: string) => name.replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/\s/g, '').toUpperCase()
  const name = normalize(itemName)
  const mapped = LABORATORY_RESULT_PRESETS.find((item) => normalize(item.itemName) === name)
  if (mapped) return mapped
  const aliases: Record<string, string> = {
    '血常规五分类': 'TPL_LAB_CBC_5PART', '血常规三分类': 'TPL_LAB_ITEM_25010101501',
    '尿常规分析': 'TPL_LAB_ITEM_25010200100', '尿液分析': 'TPL_LAB_ITEM_25010200100',
    '肝功能检查': 'TPL_LAB_LIVER', '肝功能常用组': 'TPL_LAB_LIVER', '肝功常用': 'TPL_LAB_LIVER',
    '肾功能三项': 'TPL_LAB_RENAL', '肾功三项': 'TPL_LAB_RENAL',
    '空腹静脉血糖测定': 'TPL_LAB_GLUCOSE', '静脉空腹血糖测定': 'TPL_LAB_GLUCOSE',
  }
  return findNationalLabTemplateByCode(aliases[name])
}

/** 根据指标代码查找国家标准指标定义 */
export function findNationalIndicatorDefinition(code?: string): DiagnosticIndicatorDefinition | undefined {
  if (!code) return undefined
  for (const tpl of [...LABORATORY_RESULT_PRESETS, ...STANDARD_LAB_PANELS]) {
    const found = tpl.content.indicators.find((ind) => ind.code === code)
    if (found) return found
  }
  return undefined
}

/** 前端根据患者画像评估适用参考规则（性别 1=男, 2=女, 年龄日数） */
export function matchApplicableReferenceRule(
  rules: readonly DiagnosticReferenceRule[],
  patient?: { gender?: '1' | '2'; ageDays?: number; instrumentCode?: string; populationCode?: string }
): DiagnosticReferenceRule | undefined {
  if (!rules || rules.length === 0) return undefined
  const gender = patient?.gender
  const ageDays = patient?.ageDays

  // 1. 优先尝试全匹配（性别 + 年龄同时满足）
  const matches = rules.filter((rule) => {
    if (rule.instrumentCode && rule.instrumentCode !== patient?.instrumentCode) return false
    if (rule.populationCode && rule.populationCode !== patient?.populationCode) return false
    if (rule.gender && rule.gender !== gender) return false
    if (rule.minimumAgeDays != null && (ageDays == null || ageDays < rule.minimumAgeDays)) return false
    if (rule.maximumAgeDays != null && (ageDays == null || ageDays >= rule.maximumAgeDays)) return false
    return true
  })
  return matches.length === 1 ? matches[0] : undefined
}

export type IndicatorEvaluationResult = {
  interpretationCode?: 'N' | 'H' | 'L' | 'HH' | 'LL' | 'CRITICAL'
  isCritical: boolean
  displayLabel: string
  rule?: DiagnosticReferenceRule
}

/** 评估指标录入值是否偏离正常或落入危急范围 */
export function evaluateIndicatorValue(
  indicator: DiagnosticIndicatorDefinition,
  val?: string | number,
  patient?: { gender?: '1' | '2'; ageDays?: number; instrumentCode?: string; populationCode?: string }
): IndicatorEvaluationResult {
  if (val == null || (typeof val === 'string' && !val.trim())) {
    return { isCritical: false, displayLabel: '未录入' }
  }
  const rule = matchApplicableReferenceRule(indicator.rules, patient)
  if (!rule) {
    return { isCritical: false, displayLabel: '待机构规则确认' }
  }

  if (indicator.valueType === 'STRING') return { isCritical: false, displayLabel: '待人工核对', rule }

  // 定性指标
  if (indicator.valueType === 'CODE') {
    const codeVal = String(val).trim()
    if (rule.criticalCodes?.includes(codeVal)) {
      return { interpretationCode: 'CRITICAL', isCritical: true, displayLabel: '★危急', rule }
    }
    // 阴性 "-" 一般判定为正常，其余阳性判定为异常高
    if (codeVal === '-' || codeVal === '阴性') {
      return { interpretationCode: 'N', isCritical: false, displayLabel: '正常', rule }
    }
    return { interpretationCode: 'H', isCritical: false, displayLabel: '↑异常', rule }
  }

  // 数值指标
  const num = typeof val === 'number' ? val : Number(val)
  if (!Number.isFinite(num)) {
    return { isCritical: false, displayLabel: '数值无效', rule }
  }

  // 危急值判定
  if (rule.criticalLow != null && num < rule.criticalLow) {
    return { interpretationCode: 'LL', isCritical: true, displayLabel: '↓↓超低危急', rule }
  }
  if (rule.criticalHigh != null && num > rule.criticalHigh) {
    return { interpretationCode: 'HH', isCritical: true, displayLabel: '↑↑超高危急', rule }
  }

  // 常规生理参考区间判定
  if (rule.referenceLow != null && num < rule.referenceLow) {
    return { interpretationCode: 'L', isCritical: false, displayLabel: '↓偏低', rule }
  }
  if (rule.referenceHigh != null && num > rule.referenceHigh) {
    return { interpretationCode: 'H', isCritical: false, displayLabel: '↑偏高', rule }
  }

  if (rule.referenceLow == null || rule.referenceHigh == null) return { isCritical: false, displayLabel: '待机构规则确认', rule }
  return { interpretationCode: 'N', isCritical: false, displayLabel: '正常', rule }
}

/** 规范提取患者生理评估画像（GB/T 2261.1 性别 1=男, 2=女 与 年龄天数） */
export function extractPatientConditions(patient?: {
  gender?: string
  birthDate?: string
  ageDays?: number
}): { gender?: '1' | '2'; ageDays?: number } {
  if (!patient) return {}
  const gender: '1' | '2' | undefined = patient.gender === 'MALE' || patient.gender === '1' ? '1'
    : patient.gender === 'FEMALE' || patient.gender === '2' ? '2' : undefined

  let ageDays = patient.ageDays
  if (ageDays == null && patient.birthDate) {
    const birth = new Date(patient.birthDate)
    const now = new Date()
    const diffMs = now.getTime() - birth.getTime()
    if (diffMs > 0) {
      ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    }
  }
  return { gender, ageDays }
}
