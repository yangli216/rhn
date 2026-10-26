/**
 * YY/T 0314-2007 / ISO 6710 一次性使用人体静脉血样采集容器与临床标本耗材国家标准字典
 *
 * 规范管帽色标令牌、添加剂、标本类型、推荐采血量与混匀操作指南。
 * 严禁捏造未经国家标准认证的采血管规格与无色标定义。
 */

export type SpecimenCapColorKey =
  | 'purple'
  | 'yellow'
  | 'red'
  | 'blue'
  | 'green'
  | 'gray'
  | 'black'
  | 'orange'
  | 'default'

export interface SpecimenTubeStandard {
  /** 耗材标准代码 */
  tubeCode: string
  /** 采血管/容器中文名称 */
  tubeName: string
  /** 管帽国际标准颜色名称 */
  colorName: string
  /** 管帽标准颜色语义键（对应 CSS 变量及指示条样式） */
  capColorKey: SpecimenCapColorKey
  /** 管帽标准颜色 CSS 语义令牌 */
  capColorToken: string
  /** 添加剂/抗凝剂中文全称及配比 */
  additive: string
  /** 标本类型：全血 | 血清 | 血浆 | 尿液 | 粪便 */
  specimenType: '全血' | '血清' | '血浆' | '尿液' | '粪便' | '其他'
  /** 标本法定类型编码（对应后端 DiagnosticSpecimen） */
  specimenTypeCode: 'WHOLE_BLOOD' | 'SERUM' | 'PLASMA' | 'URINE' | 'FECES' | 'OTHER'
  /** 推荐采血量/样本量 (mL) */
  drawVolumeMl?: number
  /** 采血后颠倒混匀指南 */
  mixingInstructions: string
  /** 典型临床适用检验项目 */
  clinicalApplications: string[]
  /** 标本采集特别注意事项（如防止溶血、严格采血比例） */
  preanalyticalNotes: string
}

export const SPECIMEN_TUBE_STANDARDS: readonly SpecimenTubeStandard[] = [
  {
    tubeCode: 'TUBE_PURPLE_EDTA',
    tubeName: 'EDTA-K2抗凝管（紫头管）',
    colorName: '紫色 (Lavender)',
    capColorKey: 'purple',
    capColorToken: 'var(--color-specimen-cap-purple)',
    additive: '乙二胺四乙酸二钾 (EDTA-K2, 1.5~2.2mg/mL)',
    specimenType: '全血',
    specimenTypeCode: 'WHOLE_BLOOD',
    drawVolumeMl: 2.0,
    mixingInstructions: '采血后立即轻柔颠倒混匀 5~8 次，严禁剧烈振荡（防溶血）',
    clinicalApplications: ['血常规五分类 (CBC)', '糖化血红蛋白 (HbA1c)', '网织红细胞计数', '血型鉴定'],
    preanalyticalNotes: '全血标本切忌冷冻；抗凝剂过量会导致红细胞皱缩、血小板肿胀。',
  },
  {
    tubeCode: 'TUBE_YELLOW_SST',
    tubeName: '分离胶促凝管（黄头管）',
    colorName: '黄色 (Gold / Yellow)',
    capColorKey: 'yellow',
    capColorToken: 'var(--color-specimen-cap-yellow)',
    additive: '惰性分离胶 + 促凝剂',
    specimenType: '血清',
    specimenTypeCode: 'SERUM',
    drawVolumeMl: 3.5,
    mixingInstructions: '采血后立即轻柔颠倒混匀 5 次，静置 30 分钟完全凝固后离心',
    clinicalApplications: ['肝功能', '肾功能', '血脂分析', '电解质', '心肌酶谱', '内分泌激素'],
    preanalyticalNotes: '离心转速 3000~3500 r/min，离心时间 10 分钟；分离胶阻隔血清与血细胞接触防代谢消耗。',
  },
  {
    tubeCode: 'TUBE_RED_PLAIN',
    tubeName: '无添加剂干燥管/普通促凝管（红头管）',
    colorName: '红色 (Red)',
    capColorKey: 'red',
    capColorToken: 'var(--color-specimen-cap-red)',
    additive: '无添加剂（内壁硅化或微量促凝剂）',
    specimenType: '血清',
    specimenTypeCode: 'SERUM',
    drawVolumeMl: 4.0,
    mixingInstructions: '颠倒混匀 5 次，静置凝固后离心分离血清',
    clinicalApplications: ['传染病四项', '抗体滴度检测', '免疫学检验', '药物浓度监测'],
    preanalyticalNotes: '避免溶血；标本凝固前切忌剧烈震动。',
  },
  {
    tubeCode: 'TUBE_BLUE_CITRATE',
    tubeName: '枸橼酸钠1:9抗凝管（浅蓝头管）',
    colorName: '浅蓝色 (Light Blue)',
    capColorKey: 'blue',
    capColorToken: 'var(--color-specimen-cap-blue)',
    additive: '枸橼酸钠 (0.109mol/L, 3.2%, 抗凝剂与血液比例严格 1:9)',
    specimenType: '血浆',
    specimenTypeCode: 'PLASMA',
    drawVolumeMl: 2.7,
    mixingInstructions: '采血后立即轻柔颠倒混匀 3~4 次，避免气泡产生',
    clinicalApplications: ['凝血四项 (PT/APTT/TT/FIB)', 'D-二聚体 (D-Dimer)', '抗凝血酶III'],
    preanalyticalNotes: '采血量必须严格对准标尺刻度线（误差须在±10%以内），过量或欠量会导致凝血时间假性改变，应直接拒收退回。',
  },
  {
    tubeCode: 'TUBE_GREEN_HEPARIN',
    tubeName: '肝素锂抗凝管（绿头管）',
    colorName: '绿色 (Green)',
    capColorKey: 'green',
    capColorToken: 'var(--color-specimen-cap-green)',
    additive: '肝素锂 (12~30IU/mL)',
    specimenType: '血浆',
    specimenTypeCode: 'PLASMA',
    drawVolumeMl: 3.0,
    mixingInstructions: '采血后立即轻柔颠倒混匀 8~10 次',
    clinicalApplications: ['急诊生化', '血流变学', '血气分析', '肌钙蛋白快速检测'],
    preanalyticalNotes: '肝素抗凝血浆不能用于凝血功能测定及白细胞分类计数（易引起细胞聚集假象）。',
  },
  {
    tubeCode: 'TUBE_GRAY_NAF',
    tubeName: '氟化钠-草酸钾抗凝管（灰头管）',
    colorName: '灰色 (Gray)',
    capColorKey: 'gray',
    capColorToken: 'var(--color-specimen-cap-gray)',
    additive: '氟化钠 (抑酶剂) + 草酸钾 (抗凝剂)',
    specimenType: '血浆',
    specimenTypeCode: 'PLASMA',
    drawVolumeMl: 2.0,
    mixingInstructions: '采血后立即轻柔颠倒混匀 5~8 次',
    clinicalApplications: ['空腹血糖测定 (GLU)', '口服葡萄糖耐量试验 (OGTT)', '血乳酸测定'],
    preanalyticalNotes: '氟化钠能特异性抑制红细胞中的烯醇化酶，阻止体外血糖降解（室温下血糖每小时降解约 5~7%）。',
  },
  {
    tubeCode: 'TUBE_BLACK_ESR',
    tubeName: '枸橼酸钠1:4血沉管（黑头管）',
    colorName: '黑色 (Black)',
    capColorKey: 'black',
    capColorToken: 'var(--color-specimen-cap-black)',
    additive: '枸橼酸钠 (0.106mol/L, 抗凝剂与血液比例严格 1:4)',
    specimenType: '全血',
    specimenTypeCode: 'WHOLE_BLOOD',
    drawVolumeMl: 1.6,
    mixingInstructions: '采血后轻柔颠倒混匀 5~8 次，上机前再次颠倒混匀',
    clinicalApplications: ['红细胞沉降率 (魏氏法 ESR)'],
    preanalyticalNotes: '必须严格保证 1:4 比例；标本须在采血后 2 小时内完成测定。',
  },
  {
    tubeCode: 'CONTAINER_URINE_CUP',
    tubeName: '一次性无菌尿液采集器（尿杯+刻度试管）',
    colorName: '透明/黄盖 (Clear/Yellow Cap)',
    capColorKey: 'yellow',
    capColorToken: 'var(--color-specimen-cap-yellow)',
    additive: '无添加剂（清洁密封干燥容器）',
    specimenType: '尿液',
    specimenTypeCode: 'URINE',
    drawVolumeMl: 10.0,
    mixingInstructions: '取中段尿 10mL~12mL，拧紧密封盖，轻旋混匀后上机',
    clinicalApplications: ['尿液干化学分析', '尿有形成分分析（尿沉渣镜检）', '尿微量白蛋白'],
    preanalyticalNotes: '留取清洁中段尿；避免经血、白带混入；留样后 2 小时内送检上机。',
  },
  {
    tubeCode: 'CONTAINER_STOOL_CUP',
    tubeName: '一次性粪便检验盒（带采样勺）',
    colorName: '白色/蓝盖 (White/Blue Cap)',
    capColorKey: 'blue',
    capColorToken: 'var(--color-specimen-cap-blue)',
    additive: '无添加剂',
    specimenType: '粪便',
    specimenTypeCode: 'FECES',
    mixingInstructions: '使用采样勺多点挑取含有脓、血、黏液等病理成分的新鲜粪便',
    clinicalApplications: ['粪便常规', '粪便隐血试验 (FOB)', '寄生虫卵检查'],
    preanalyticalNotes: '避免尿液或消毒剂污染；隐血试验前 3 天禁食动物血、内脏及富含铁质食品。',
  },
] as const

/** 标本拒收标准原因字典（规范 LIS 检验拒收闭环） */
export interface SpecimenRejectionReason {
  code: string
  name: string
  category: 'PREANALYTICAL_QUALITY' | 'VOLUME' | 'IDENTITY' | 'CONTAINER'
  categoryLabel: string
  description: string
}

export const SPECIMEN_REJECTION_REASONS: readonly SpecimenRejectionReason[] = [
  {
    code: 'REJECT_HEMOLYSIS',
    name: '标本严重溶血',
    category: 'PREANALYTICAL_QUALITY',
    categoryLabel: '分析前质量异常',
    description: '标本游离血红蛋白升高，严重干扰钾、乳酸脱氢酶、转氨酶及胆红素测定',
  },
  {
    code: 'REJECT_COAGULATION',
    name: '抗凝血标本凝血/微小凝块',
    category: 'PREANALYTICAL_QUALITY',
    categoryLabel: '分析前质量异常',
    description: '抗凝管混匀不及时或不充分，导致纤维蛋白析出或血小板聚集，堵塞分析仪管路并导致血常规结果严重失真',
  },
  {
    code: 'REJECT_LIPEMIA',
    name: '标本严重乳糜微粒/高脂血',
    category: 'PREANALYTICAL_QUALITY',
    categoryLabel: '分析前质量异常',
    description: '严重脂血导致分光光度浊度法出现假性吸光度干扰',
  },
  {
    code: 'REJECT_INSUFFICIENT_VOLUME',
    name: '标本采血量不足（欠采）',
    category: 'VOLUME',
    categoryLabel: '采血量异常',
    description: '凝血或血沉管未达刻度线，抗凝剂比例失衡；或血清量不足以完成所申请的化验项目',
  },
  {
    code: 'REJECT_EXCESSIVE_VOLUME',
    name: '采血量严重超量（过采）',
    category: 'VOLUME',
    categoryLabel: '采血量异常',
    description: '抗凝管采血超出上限刻度，导致抗凝剂比例不足产生微凝块',
  },
  {
    code: 'REJECT_WRONG_CONTAINER',
    name: '采血管或容器类型错误',
    category: 'CONTAINER',
    categoryLabel: '容器合规性',
    description: '如血常规错用生化黄管、生化错用 EDTA 紫管（EDTA 会螯合钙、镁并引入高钾，导致生化报告致命错误）',
  },
  {
    code: 'REJECT_EXPIRED_OR_DAMAGED',
    name: '采血管破损、漏液或过期',
    category: 'CONTAINER',
    categoryLabel: '容器合规性',
    description: '真空管漏气导致采血负压不足，或管壁破损有生物安全暴露隐患',
  },
  {
    code: 'REJECT_LABEL_UNREADABLE',
    name: '标本条码破损、污染或无法扫描识别',
    category: 'IDENTITY',
    categoryLabel: '身份标识异常',
    description: '条形码贴反、折叠、沾染血渍导致条码枪无法解码，存在患者身份混淆风险',
  },
  {
    code: 'REJECT_IDENTITY_MISMATCH',
    name: '标本信息与申请单/患者身份不符',
    category: 'IDENTITY',
    categoryLabel: '身份标识异常',
    description: '管身信息与系统登记患者四要素（姓名、性别、年龄、病案号）不一致',
  },
  {
    code: 'REJECT_DELAYED_DELIVERY',
    name: '标本送检超时',
    category: 'PREANALYTICAL_QUALITY',
    categoryLabel: '分析前质量异常',
    description: '采血至接收时间超过允许时限（如血气>30min、尿常规>2h），细胞代谢造成指标大幅改变',
  },
] as const

/** 根据管码查找标准采血管定义；机构容器字典编码不规范时，再按容器名称兜底匹配 */
export function findSpecimenTubeByCode(tubeCode?: string, tubeName?: string): SpecimenTubeStandard | undefined {
  return matchTubeText(tubeCode) ?? matchTubeText(tubeName)
}

function matchTubeText(tubeCode?: string): SpecimenTubeStandard | undefined {
  if (!tubeCode) return undefined
  const direct = SPECIMEN_TUBE_STANDARDS.find((t) => t.tubeCode === tubeCode)
  if (direct) return direct
  const upper = tubeCode.toUpperCase()
  if (/紫/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[0]
  if (/黄|分离胶/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[1]
  if (/红/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[2]
  if (/蓝/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[3]
  if (/绿/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[4]
  if (/灰|氟化钠/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[5]
  if (/黑|血沉/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[6]
  if (/尿/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[7]
  if (/粪|便/.test(tubeCode)) return SPECIMEN_TUBE_STANDARDS[8]
  if (upper.includes('EDTA') || upper === 'EDTA_TUBE') return SPECIMEN_TUBE_STANDARDS[0] // 紫头
  if (upper.includes('SERUM') || upper.includes('GEL') || upper === 'SST_TUBE') return SPECIMEN_TUBE_STANDARDS[1] // 黄头
  if (upper.includes('PLAIN') || upper === 'PLAIN_TUBE') return SPECIMEN_TUBE_STANDARDS[2] // 红头
  if (upper.includes('CITRATE') || upper.includes('COAG')) return SPECIMEN_TUBE_STANDARDS[3] // 浅蓝
  if (upper.includes('HEPARIN')) return SPECIMEN_TUBE_STANDARDS[4] // 绿头
  if (upper.includes('FLUORIDE') || upper.includes('GLUCOSE')) return SPECIMEN_TUBE_STANDARDS[5] // 灰头
  if (upper.includes('ESR')) return SPECIMEN_TUBE_STANDARDS[6] // 黑头
  if (upper.includes('URINE')) return SPECIMEN_TUBE_STANDARDS[7] // 尿杯
  if (upper.includes('STOOL') || upper.includes('FECES')) return SPECIMEN_TUBE_STANDARDS[8] // 便盒
  return undefined
}
