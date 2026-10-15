/**
 * 国家标准医学影像与功能检查结构化词条库
 * 遵循标准：
 * 1. 卫生行业标准 WS 445.11-2014《电子病历基本数据集 第11部分：医学影像检查报告》
 * 2. 国家卫健委 DICOM Modality 标准分类规范（XR/CT/MR/US/ECG/ES）
 */

export interface ExamModalityStandard {
  code: string
  name: string
  shortLabel: string
  category: 'RADIOLOGY' | 'ULTRASOUND' | 'ELECTROPHYSIOLOGY' | 'ENDOSCOPY'
  badgeTone: 'info' | 'success' | 'warning' | 'neutral'
  contraindicationGuide: string
  preparationGuide: string
}

export const EXAM_MODALITIES: readonly ExamModalityStandard[] = [
  {
    code: 'DR',
    name: '普通数字X线摄影 (DR/X-Ray)',
    shortLabel: 'DR/摄片',
    category: 'RADIOLOGY',
    badgeTone: 'info',
    contraindicationGuide: '孕妇妊娠早期（前3个月）慎做或避免腹部盆腔X线检查；检查前去除检查部位金属物品、项链及膏药。',
    preparationGuide: '立位胸片需配合吸气后屏气摄片；儿童及育龄期患者按规范遮盖性腺敏感部位。',
  },
  {
    code: 'CT',
    name: '计算机体层成像 (CT平扫/增强)',
    shortLabel: 'CT断层',
    category: 'RADIOLOGY',
    badgeTone: 'info',
    contraindicationGuide: '增强扫描禁忌：严重碘对比剂过敏史、严重甲亢、肾功能不全（eGFR < 30 mL/min）。',
    preparationGuide: '全腹CT检查前禁食4~6小时并口服对比剂充盈胃肠；胸部CT扫描前练习深吸气闭气。',
  },
  {
    code: 'MR',
    name: '磁共振成像 (MRI)',
    shortLabel: 'MRI核磁',
    category: 'RADIOLOGY',
    badgeTone: 'warning',
    contraindicationGuide: '绝对禁忌：心脏起搏器、脑血管动脉瘤银夹、神经刺激器、眼球内金属异物、危重生命支持设备。',
    preparationGuide: '进机房前严禁携带手机、手表、磁卡、钥匙、金属纽扣及皮带；躁动患者须先行镇静。',
  },
  {
    code: 'US',
    name: '超声医学 (彩色多普勒超声)',
    shortLabel: '彩超',
    category: 'ULTRASOUND',
    badgeTone: 'success',
    contraindicationGuide: '检查部位皮肤有大面积破溃、开放性损伤或重度感染者暂缓表面超声。',
    preparationGuide: '肝胆胰脾超声须空腹8小时以上（晨起禁食禁水）；妇科经腹/泌尿前列腺彩超须提前饮水憋尿充盈膀胱。',
  },
  {
    code: 'ECG',
    name: '心电生理检查 (12导联/Holter)',
    shortLabel: '心电图',
    category: 'ELECTROPHYSIOLOGY',
    badgeTone: 'neutral',
    contraindicationGuide: '无绝对禁忌；皮肤过敏者电极片导电胶避免久贴。',
    preparationGuide: '检查前静坐休息5~10分钟，避免剧烈运动、吸烟或饮浓茶咖啡；仰卧位全身放松，避免肌电干扰。',
  },
  {
    code: 'ES',
    name: '消化/呼吸内窥镜 (胃镜/肠镜/气管镜)',
    shortLabel: '内镜',
    category: 'ENDOSCOPY',
    badgeTone: 'warning',
    contraindicationGuide: '严重心肺功能衰竭、休克、消化道穿孔急性期、主动脉瘤、重度精神失常。',
    preparationGuide: '胃镜前禁食8小时禁饮4小时；肠镜前按方案口服复方聚乙二醇电解质散完成肠道清洁准备。',
  },
] as const

/** 预制国家标准常见部位检查结构化模板（WS 445.11-2014） */
export interface NationalExamTemplate {
  templateCode: string
  itemNamePattern: RegExp
  modalityCode: string
  bodyPart: string
  procedureMethod: string
  defaultFindings: string
  defaultConclusion: string
  recommendations?: string
  keywords: string[]
}

export const NATIONAL_EXAM_TEMPLATES: readonly NationalExamTemplate[] = [
  {
    templateCode: 'TPL_XR_CHEST_PA',
    itemNamePattern: /胸部|胸片|胸透|肺/i,
    modalityCode: 'DR',
    bodyPart: '胸部',
    procedureMethod: '立位后前位(PA) + 左侧位(LAT)',
    defaultFindings:
      '双肺野清晰，肺纹理走行分布自然，未见实质性浸润或活动性结节影。纵隔居中，心影大小形态在正常生理范围。双侧肋膈角锐利，膈面光滑。胸廓骨骼对称，未见骨折或溶骨性破坏征象。',
    defaultConclusion: '胸部摄片未见明确活动性病变，心肺膈正常。',
    keywords: ['正常胸片', '双肺纹理增多', '肺结核筛查', '肋骨骨折'],
  },
  {
    templateCode: 'TPL_CT_HEAD_PLAIN',
    itemNamePattern: /头颅|颅脑|脑CT/i,
    modalityCode: 'CT',
    bodyPart: '颅脑',
    procedureMethod: '横断轴位平扫 (层厚5.0mm, 层距5.0mm)',
    defaultFindings:
      '双侧大脑半球对称，灰白质分界清晰，脑实质内未见异常高密度或低密度局灶影。脑室系统形态大小对称居中，第三、四脑室通畅，中线结构居中。蛛网膜下腔未见出血，颅骨骨质完整未见骨折线。',
    defaultConclusion: '颅脑CT平扫未见明确急性颅脑创伤或脑血管意外征象。',
    keywords: ['颅脑未见异常', '脑梗死筛查', '脑出血除外', '脑萎缩'],
  },
  {
    templateCode: 'TPL_CT_CHEST_PLAIN',
    itemNamePattern: /胸部CT|肺CT|胸部平扫/i,
    modalityCode: 'CT',
    bodyPart: '胸部',
    procedureMethod: '螺旋CT胸部平扫 (薄层重建1.0mm)',
    defaultFindings:
      '双肺支气管血管束分布自然，各叶段支气管通畅，肺实质内未见局灶性实变或磨玻璃结节影。纵隔居中，纵隔及肺门淋巴结无病理性增大。胸膜无增厚，胸膜腔内无明确积液征象。心影形态正常。',
    defaultConclusion: '胸部CT平扫未见明确活动性感染或占位性病变。',
    keywords: ['胸部平扫正常', '微小肺结节', '支气管炎', '胸腔积液'],
  },
  {
    templateCode: 'TPL_US_ABDOMEN',
    itemNamePattern: /腹部超声|肝胆|肝功能超声|彩超腹部/i,
    modalityCode: 'US',
    bodyPart: '上腹部 (肝胆胰脾双肾)',
    procedureMethod: '凸阵探头经腹部多切面扫查 (探头频率3.5MHz)',
    defaultFindings:
      '肝脏大小形态正常，被膜平整光滑，肝实质回声均匀，门静脉主干及肝内血管走行清晰。胆囊大小正常，囊壁光滑，腔内透声好未见异常强回声及声影，胆总管未见扩张。胰腺、脾脏大小形态未见异常。双肾轮廓规整，皮质髓质分界清楚，集合系统未见分离及结石强光团。',
    defaultConclusion: '肝、胆、胰、脾、双肾彩超未见明确占位性病变。',
    keywords: ['腹部彩超未见异常', '脂肪肝', '胆囊结石', '肾囊肿'],
  },
  {
    templateCode: 'TPL_US_THYROID',
    itemNamePattern: /甲状腺/i,
    modalityCode: 'US',
    bodyPart: '颈部浅表器官 (甲状腺及颈部淋巴结)',
    procedureMethod: '高频线阵探头多切面扫查 (探头频率7.5~12.0MHz)',
    defaultFindings:
      '甲状腺左右两叶及峡部大小形态正常，被膜完整，实质回声细密均匀，CDFI示腺体内血流信号分布正常。双侧颈部大血管旁未见异常肿大淋巴结回声。',
    defaultConclusion: '甲状腺超声未见明确结节及异常占位。',
    keywords: ['甲状腺未见异常', '甲状腺结节TI-RADS 2类', '甲状腺囊肿'],
  },
  {
    templateCode: 'TPL_ECG_ROUTINE',
    itemNamePattern: /心电图|ECG|12导联/i,
    modalityCode: 'ECG',
    bodyPart: '心脏电生理',
    procedureMethod: '常规卧位标准12导联同步描记 (走纸速度25mm/s, 定准电压10mm/mV)',
    defaultFindings:
      '窦性心律。P波在I、II、aVF导联直立，aVR导联倒置。P-R间期 0.16s，QRS波群时限 0.08s，胸导联V1至V5 R/S波递增正常。ST段无明确抬高或压低，T波形态自然，Q-T间期 0.38s。心率 72 次/分。',
    defaultConclusion: '正常心电图 (Normal ECG)。',
    keywords: ['正常心电图', '窦性心律', '窦性心动过速', 'ST-T改变'],
  },
] as const

/** 常用典型影像征象与诊断词条推荐（用于报告快捷插入） */
export interface ExamPhraseLibrary {
  category: string
  phrases: { title: string; findings: string; conclusion: string }[]
}

export const COMMON_EXAM_PHRASES: readonly ExamPhraseLibrary[] = [
  {
    category: '胸部常见征象',
    phrases: [
      {
        title: '双肺纹理增多增粗',
        findings: '双肺野透过度尚可，双侧肺纹理走行增多、粗糙紊乱，边缘略模糊，未见确切斑片状实变影。心影大小在正常范围，双侧肋膈角锐利。',
        conclusion: '双肺纹理增多增粗，多考虑慢性支气管疾患或轻度肺部炎症反应，请结合临床听诊。',
      },
      {
        title: '陈旧性肺结核增殖硬结',
        findings: '左肺尖部见局限性斑点状、索条状致密影，边缘光整清晰，密度较高。邻近胸膜未见明显牵拉增厚。余肺野未见活动性病灶。',
        conclusion: '左肺尖局限性纤维增殖硬结灶，考虑陈旧性病变可能，建议定期随访对比。',
      },
    ],
  },
  {
    category: '腹部超声征象',
    phrases: [
      {
        title: '轻度脂肪肝',
        findings: '肝脏大小在正常范围，包膜光滑，肝实质前场回声细密增强，深部回声稍有衰减，肝内管道结构显示清晰。',
        conclusion: '轻度脂肪肝超声声像图改变。',
      },
      {
        title: '胆囊结石伴慢性胆囊炎',
        findings: '胆囊大小形态正常，壁毛糙稍厚约 3.2mm，囊内后壁探及数枚强回声光团，最大直径约 8mm，后伴声影，随体位变动移动。胆总管无扩张。',
        conclusion: '胆囊多发结石伴胆囊壁粗糙（慢性胆囊炎声像表现）。',
      },
    ],
  },
]

/** 根据检查项目名称智能匹配推荐的检查类别与结构化模板 */
export function matchExamTemplateByItemName(itemName?: string): NationalExamTemplate | undefined {
  if (!itemName) return NATIONAL_EXAM_TEMPLATES[0]
  return NATIONAL_EXAM_TEMPLATES.find((tpl) => tpl.itemNamePattern.test(itemName))
}

/** 根据检查项目名称推荐 Modality 标准信息 */
export function recommendExamModality(itemName?: string): ExamModalityStandard {
  if (!itemName) return EXAM_MODALITIES[0]
  const upper = itemName.toUpperCase()
  if (upper.includes('MR') || upper.includes('磁共振')) return EXAM_MODALITIES.find((m) => m.code === 'MR')!
  if (upper.includes('CT')) return EXAM_MODALITIES.find((m) => m.code === 'CT')!
  if (upper.includes('超声') || upper.includes('彩超') || upper.includes('US')) return EXAM_MODALITIES.find((m) => m.code === 'US')!
  if (upper.includes('心电') || upper.includes('ECG')) return EXAM_MODALITIES.find((m) => m.code === 'ECG')!
  if (upper.includes('镜') || upper.includes('胃镜') || upper.includes('肠镜')) return EXAM_MODALITIES.find((m) => m.code === 'ES')!

  const matchedTpl = matchExamTemplateByItemName(itemName)
  if (matchedTpl) {
    const found = EXAM_MODALITIES.find((m) => m.code === matchedTpl.modalityCode)
    if (found) return found
  }
  return EXAM_MODALITIES[0]
}
