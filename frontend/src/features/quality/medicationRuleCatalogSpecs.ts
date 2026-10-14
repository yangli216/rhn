/**
 * 在行合理用药质控规则的结构化规范与 DSL 表达式定义。
 * 将系统内置在行规则（参数化分类规则 + 基线校验规则）转化为透明可视的临床逻辑与表达式，
 * 消除"黑盒执行器"困扰，支持在行目录直观审查规则判定条件、关联分类与参数阈值。
 */

export type RuleTemplateType =
  | 'TEMPLATE_A_CONFLICT'
  | 'TEMPLATE_B_POPULATION'
  | 'TEMPLATE_C_DUPLICATE'
  | 'BASELINE_VALIDATION'

export interface BuiltinRuleParameter {
  label: string
  value: string
  badgeTone?: 'neutral' | 'info' | 'warning' | 'success' | 'danger'
}

export interface BuiltinBoundCategory {
  code: string
  name: string
  description?: string
}

export interface BuiltinRuleSpec {
  code: string
  name: string
  templateType: RuleTemplateType
  templateName: string
  templateBadgeTone: 'neutral' | 'info' | 'warning' | 'success' | 'danger'
  isParameterized: boolean
  explanation: string
  dslExpression: string
  parameters: BuiltinRuleParameter[]
  boundCategories: BuiltinBoundCategory[]
  messageTemplate: string
  decision: 'BLOCK' | 'WARN' | 'REQUIRE_OVERRIDE'
  clinicalRisk: string
}

export const BUILTIN_RULE_SPECS: Record<string, BuiltinRuleSpec> = {
  // 1. 模板 C：质子泵抑制剂（PPI）同类重复用药
  'QMED.PPI_DUPLICATE': {
    code: 'QMED.PPI_DUPLICATE',
    name: '质子泵抑制剂（PPI）同方或重复用药核对',
    templateType: 'TEMPLATE_C_DUPLICATE',
    templateName: '模板 C：分类同类重复用药',
    templateBadgeTone: 'info',
    isParameterized: true,
    explanation: '处方中包含 2 种及以上质子泵抑制剂（PPI）抑酸药联合使用，触发同类重复用药拦截。',
    dslExpression: `rule "QMED_PPI_DUPLICATE"
when
  prescription.medications
    .filter(item => item.inCategory("PPI_DUPLICATE_THERAPY"))
    .count >= 2
then
  decision: WARN (提醒核对)
  message: "处方中包含 {count} 种同类质子泵抑制剂（PPI）抑酸药【{medNames}】联合使用，存在同类重复用药风险。"`,
    parameters: [
      { label: '规则模型', value: '模板 C · 动态分类同类重复用药', badgeTone: 'info' },
      { label: '挂载分类', value: 'PPI_DUPLICATE_THERAPY (质子泵抑制剂类抑酸药)' },
      { label: '触发阈值', value: '同方开立 ≥ 2 种', badgeTone: 'warning' },
      { label: '剂型要求', value: '纳入药品目录全身剂型' }
    ],
    boundCategories: [
      { code: 'PPI_DUPLICATE_THERAPY', name: '质子泵抑制剂（PPI）类', description: '奥美拉唑、雷贝拉唑、泮托拉唑、艾司奥美拉唑等' }
    ],
    messageTemplate: '处方中包含 {count} 种同类质子泵抑制剂（PPI）抑酸药【{medNames}】联合使用，存在同类重复用药风险。',
    decision: 'WARN',
    clinicalRisk: '联合使用两种及以上质子泵抑制剂通常不增加抑酸疗效，而成倍增加艰难梭菌感染、低镁血症及骨折风险。建议精简为单一适宜品种。'
  },

  // 2. 模板 C：ACEI 与 ARB 类降压药重复用药
  'QMED.RASI_DUPLICATE': {
    code: 'QMED.RASI_DUPLICATE',
    name: 'ACEI与ARB类降压药重复用药核对',
    templateType: 'TEMPLATE_C_DUPLICATE',
    templateName: '模板 C：分类同类重复用药',
    templateBadgeTone: 'info',
    isParameterized: true,
    explanation: '处方中同时联用普利类（ACEI）与沙坦类（ARB）降压药，触发双重 RAAS 阻断高危拦截。',
    dslExpression: `rule "QMED_RASI_DUPLICATE"
when
  prescription.medications
    .filter(item => item.inCategory("RASI_DUPLICATE_THERAPY"))
    .count >= 2
then
  decision: BLOCK (阻止提交)
  message: "处方中包含 {count} 种普利类/沙坦类降压药【{medNames}】联合使用，存在严重双重阻断风险。"`,
    parameters: [
      { label: '规则模型', value: '模板 C · 动态分类同类重复用药', badgeTone: 'info' },
      { label: '挂载分类', value: 'RASI_DUPLICATE_THERAPY (普利类与沙坦类降压药)' },
      { label: '触发阈值', value: '同方开立 ≥ 2 种', badgeTone: 'danger' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [
      { code: 'RASI_DUPLICATE_THERAPY', name: '肾素-血管紧张素系统抑制剂', description: '依那普利、贝那普利、氯沙坦、缬沙坦、替米沙坦等' }
    ],
    messageTemplate: '处方中包含 {count} 种普利类/沙坦类降压药【{medNames}】联合使用，存在严重双重阻断风险。',
    decision: 'BLOCK',
    clinicalRisk: '国内外权威高血压指南明确反对 ACEI 与 ARB 联合用于控制血压，双重阻断不仅不增加心血管获益，反而急剧增加急性肾衰竭、恶性高钾血症及重度低血压风险。'
  },

  // 3. 模板 C：镇静催眠类及抗焦虑药物重复用药
  'QMED.SEDATIVE_HYPNOTIC_DUPLICATE': {
    code: 'QMED.SEDATIVE_HYPNOTIC_DUPLICATE',
    name: '镇静催眠类及抗焦虑药物重复用药核对',
    templateType: 'TEMPLATE_C_DUPLICATE',
    templateName: '模板 C：分类同类重复用药',
    templateBadgeTone: 'info',
    isParameterized: true,
    explanation: '处方中开立 2 种及以上苯二氮䓬类或非苯二氮䓬类镇静催眠药，防范中枢过度抑制与跌倒风险。',
    dslExpression: `rule "QMED_SEDATIVE_HYPNOTIC_DUPLICATE"
when
  prescription.medications
    .filter(item => item.inCategory("SEDATIVE_HYPNOTIC_DUPLICATE"))
    .count >= 2
then
  decision: WARN (提醒核对)
  message: "处方中包含 {count} 种镇静催眠/抗焦虑类药物【{medNames}】联合使用，存在过度中枢抑制风险。"`,
    parameters: [
      { label: '规则模型', value: '模板 C · 动态分类同类重复用药', badgeTone: 'info' },
      { label: '挂载分类', value: 'SEDATIVE_HYPNOTIC_DUPLICATE (镇静催眠与抗焦虑药)' },
      { label: '触发阈值', value: '同方开立 ≥ 2 种', badgeTone: 'warning' },
      { label: '拦截级别', value: '提醒核对 (WARN)', badgeTone: 'warning' }
    ],
    boundCategories: [
      { code: 'SEDATIVE_HYPNOTIC_DUPLICATE', name: '镇静催眠类药物', description: '艾司唑仑、阿普唑仑、地西泮、佐匹克隆、唑吡坦等' }
    ],
    messageTemplate: '处方中包含 {count} 种镇静催眠/抗焦虑类药物【{medNames}】联合使用，存在过度中枢抑制风险。',
    decision: 'WARN',
    clinicalRisk: '联合开立两种或以上镇静催眠药物易导致中枢神经系统过度抑制、呼吸暂停及运动协调障碍，特别在基层老年患者中极易导致跌倒骨折及认知障碍加重。'
  },

  // 4. 模板 B：儿童青少年禁用四环素类抗生素（< 8 周岁）
  'QMED.TETRACYCLINE_PEDIATRIC': {
    code: 'QMED.TETRACYCLINE_PEDIATRIC',
    name: '儿童青少年禁用四环素类抗生素核对',
    templateType: 'TEMPLATE_B_POPULATION',
    templateName: '模板 B：分类与特殊人群禁忌',
    templateBadgeTone: 'warning',
    isParameterized: true,
    explanation: '8 周岁以下儿童患者开立四环素类抗生素时触发高危拦截，防范四环素牙与骨发育抑制。',
    dslExpression: `rule "QMED_TETRACYCLINE_PEDIATRIC"
when
  patient.age < 8
  and prescription.medications
    .any(item => item.inCategory("TETRACYCLINE_PEDIATRIC_CONTRA"))
then
  decision: BLOCK (阻止提交)
  message: "患者年龄（{age}岁）未满8周岁，禁用四环素类抗生素【{medNames}】（四环素牙永久黄染与骨发育抑制高危风险）。"`,
    parameters: [
      { label: '规则模型', value: '模板 B · 分类与特殊人群禁忌', badgeTone: 'warning' },
      { label: '限定年龄', value: '年龄 < 8 周岁 (儿童/婴幼儿)', badgeTone: 'danger' },
      { label: '挂载分类', value: 'TETRACYCLINE_PEDIATRIC_CONTRA (四环素类儿童禁忌)' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [
      { code: 'TETRACYCLINE_PEDIATRIC_CONTRA', name: '四环素类抗生素', description: '多西环素、米诺环素、四环素等' }
    ],
    messageTemplate: '患者年龄（{age}岁）未满8周岁，禁用四环素类抗生素【{medNames}】（四环素牙永久黄染与骨发育抑制高危风险）。',
    decision: 'BLOCK',
    clinicalRisk: '四环素类药物在牙齿发育期间（孕妇、哺乳期及8岁以下儿童）沉积于牙组织中，可造成永久性牙齿变色（黄色-灰色-棕色）及牙釉质发育不良，并抑制婴儿骨骼生长。'
  },

  // 5. 模板 B：儿童禁用氨基糖苷类抗生素（< 6 周岁）
  'QMED.AMINOGLYCOSIDE_PEDIATRIC': {
    code: 'QMED.AMINOGLYCOSIDE_PEDIATRIC',
    name: '儿童及特定年龄禁用氨基糖苷类抗生素核对',
    templateType: 'TEMPLATE_B_POPULATION',
    templateName: '模板 B：分类与特殊人群禁忌',
    templateBadgeTone: 'warning',
    isParameterized: true,
    explanation: '6 周岁以下儿童患者开立氨基糖苷类抗生素注射制剂时触发绝对阻断，防范不可逆听力损害。',
    dslExpression: `rule "QMED_AMINOGLYCOSIDE_PEDIATRIC"
when
  patient.age < 6
  and prescription.medications
    .any(item => item.inCategory("AMINOGLYCOSIDE_PEDIATRIC_CONTRA"))
then
  decision: BLOCK (阻止提交)
  message: "患者年龄（{age}岁）未满6周岁，禁用氨基糖苷类抗生素【{medNames}】（不可逆耳蜗前庭毒性导致永久性药物性耳聋与急性肾损伤高危风险）。"`,
    parameters: [
      { label: '规则模型', value: '模板 B · 分类与特殊人群禁忌', badgeTone: 'warning' },
      { label: '限定年龄', value: '年龄 < 6 周岁 (学龄前儿童及婴幼儿)', badgeTone: 'danger' },
      { label: '挂载分类', value: 'AMINOGLYCOSIDE_PEDIATRIC_CONTRA (氨基糖苷类儿童禁忌)' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [
      { code: 'AMINOGLYCOSIDE_PEDIATRIC_CONTRA', name: '氨基糖苷类抗生素', description: '阿米卡星、庆大霉素、依替米星、妥布霉素等' }
    ],
    messageTemplate: '患者年龄（{age}岁）未满6周岁，禁用氨基糖苷类抗生素【{medNames}】（不可逆耳蜗前庭毒性导致永久性药物性耳聋与急性肾损伤高危风险）。',
    decision: 'BLOCK',
    clinicalRisk: '氨基糖苷类抗生素易蓄积于内耳淋巴液及肾皮质，儿童（尤其是婴幼儿）易发生线粒体 DNA 突变相关的不可逆感觉神经性耳聋（药物性致聋）及急性肾小管坏死。'
  },

  // 6. 模板 A：大环内酯类与他汀类相互作用冲突
  'QMED.MACROLIDE_STATIN_INTERACTION': {
    code: 'QMED.MACROLIDE_STATIN_INTERACTION',
    name: '大环内酯类抗菌药与他汀类相互作用核对',
    templateType: 'TEMPLATE_A_CONFLICT',
    templateName: '模板 A：分类药对冲突',
    templateBadgeTone: 'danger',
    isParameterized: true,
    explanation: '处方中同时包含大环内酯类强 CYP3A4 抑制剂与他汀类降脂药时触发高危拦截，防范致死性横纹肌溶解。',
    dslExpression: `rule "QMED_MACROLIDE_STATIN_INTERACTION"
when
  prescription.medications
    .any(item => item.inCategory("MACROLIDE_STATIN_INTERACTION"))
  and prescription.medications
    .any(item => item.inCategory("STATIN_LIPID_LOWERING"))
then
  decision: BLOCK (阻止提交)
  message: "处方中【{medA}】与【{medB}】联用存在严重药物相互作用风险（CYP3A4代谢抑制诱发致死性横纹肌溶解）。"`,
    parameters: [
      { label: '规则模型', value: '模板 A · 动态双分类药对冲突', badgeTone: 'danger' },
      { label: '第一分类', value: 'MACROLIDE_STATIN_INTERACTION (大环内酯类抗菌药)' },
      { label: '第二分类', value: 'STATIN_LIPID_LOWERING (他汀类降脂药)' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [
      { code: 'MACROLIDE_STATIN_INTERACTION', name: '大环内酯类抗菌药', description: '红霉素、克拉霉素、阿奇霉素等' },
      { code: 'STATIN_LIPID_LOWERING', name: '他汀类降脂药', description: '辛伐他汀、阿托伐他汀、洛伐他汀等' }
    ],
    messageTemplate: '处方中【{medA}】与【{medB}】联用存在严重药物相互作用风险（CYP3A4代谢抑制诱发致死性横纹肌溶解）。',
    decision: 'BLOCK',
    clinicalRisk: '克拉霉素、红霉素等强效抑制肝脏细胞色素 P450 3A4 (CYP3A4) 酶，显著阻断主要经该酶代谢的他汀类清除，使他汀血药浓度急剧升高数倍至数十倍，诱发急性横纹肌溶解、肌红蛋白尿及急性肾衰竭。'
  },

  // 7. 模板 B：育龄期及妊娠期妇女禁用高危致畸药物核查
  'QMED.PREGNANCY_CONTRA': {
    code: 'QMED.PREGNANCY_CONTRA',
    name: '育龄期及妊娠期妇女禁用高危致畸药物核对',
    templateType: 'TEMPLATE_B_POPULATION',
    templateName: '模板 B：分类与特殊人群禁忌',
    templateBadgeTone: 'warning',
    isParameterized: true,
    explanation: '12~50 岁育龄期女性开立 FDA X级或高危致畸药物时触发绝对拦截，防范胚胎致畸及死胎事件。',
    dslExpression: `rule "QMED_PREGNANCY_CONTRA"
when
  patient.gender == "女"
  and (patient.age == null or (patient.age >= 12 and patient.age <= 50))
  and prescription.medications
    .any(item => item.inCategory("PREGNANCY_CONTRA_CATEGORY_X"))
then
  decision: BLOCK (阻止提交)
  message: "患者为育龄期女性（{age}岁），禁忌使用妊娠期高危致畸药物【{medNames}】。"`,
    parameters: [
      { label: '规则模型', value: '模板 B · 分类与特殊人群禁忌', badgeTone: 'warning' },
      { label: '目标性别', value: '女性 (2)', badgeTone: 'info' },
      { label: '育龄年龄段', value: '12 ~ 50 周岁 (未填写年龄默认防御拦截)', badgeTone: 'danger' },
      { label: '挂载分类', value: 'PREGNANCY_CONTRA_CATEGORY_X (妊娠期禁用致畸药)' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [
      { code: 'PREGNANCY_CONTRA_CATEGORY_X', name: '妊娠期禁用（X级/致畸）', description: '利巴韦林、维A酸类（异维A酸）、沙利度胺、甲氨蝶呤等' }
    ],
    messageTemplate: '患者为育龄期女性（{age}岁），禁忌使用妊娠期高危致畸药物【{medNames}】。',
    decision: 'BLOCK',
    clinicalRisk: '利巴韦林、异维A酸、沙利度胺等药物具有强烈的致畸性或胚胎致死毒性（FDA X级）。育龄期女性即使极低剂量暴露亦可导致严重胎儿颅面骨骼畸形或流产，停药后数月至数年仍需严格避孕。'
  },

  // 8. 模板 C：非甾体抗炎药重复用药
  'QMED.NSAID_DUPLICATE': {
    code: 'QMED.NSAID_DUPLICATE',
    name: '非甾体抗炎药（NSAIDs）同方或联合用药重复核对',
    templateType: 'TEMPLATE_C_DUPLICATE',
    templateName: '模板 C：分类同类重复用药',
    templateBadgeTone: 'info',
    isParameterized: true,
    explanation: '处方中包含 2 种及以上全身用非甾体抗炎药（解热镇痛药）时提醒核对，防范消化道溃疡出血。',
    dslExpression: `rule "QMED_NSAID_DUPLICATE"
when
  prescription.medications
    .filter(item => item.inCategory("SYSTEMIC_NSAID"))
    .count >= 2
then
  decision: WARN (提醒核对)
  message: "处方包含 2 种及以上非甾体抗炎药（NSAIDs），可能成倍增加胃肠道出血与肾功能受损风险。"`,
    parameters: [
      { label: '规则模型', value: '模板 C · 动态分类同类重复用药', badgeTone: 'info' },
      { label: '挂载分类', value: 'SYSTEMIC_NSAID (全身用非甾体抗炎药)' },
      { label: '触发阈值', value: '同方开立 ≥ 2 种', badgeTone: 'warning' },
      { label: '拦截级别', value: '提醒核对 (WARN)', badgeTone: 'warning' }
    ],
    boundCategories: [
      { code: 'SYSTEMIC_NSAID', name: '全身用非甾体抗炎药', description: '布洛芬、双氯芬酸、塞来昔布、吲哚美辛、对乙酰氨基酚等' }
    ],
    messageTemplate: '处方包含 2 种及以上非甾体抗炎药（NSAIDs），可能成倍增加胃肠道出血与肾功能受损风险。',
    decision: 'WARN',
    clinicalRisk: '联合使用两种或多种 NSAIDs 不增加镇痛效果，但胃肠道溃疡、穿孔及大出血风险成倍增加，并显著升高体液潴留、高血压加重及肾功能损伤风险。'
  },

  // 9. 基线规则：儿童及特定年龄禁忌用药核对
  'QMED.AGE_CONTRAINDICATION': {
    code: 'QMED.AGE_CONTRAINDICATION',
    name: '儿童及特定年龄禁忌用药核对',
    templateType: 'BASELINE_VALIDATION',
    templateName: '基线规则：年龄范围禁忌校验',
    templateBadgeTone: 'neutral',
    isParameterized: false,
    explanation: '核对患者年龄是否超出药品说明书核准的安全用药年龄区间（如儿童禁用喹诺酮类、未成年人禁用阿片类）。',
    dslExpression: `rule "QMED_AGE_CONTRAINDICATION"
when
  patient.age != null
  and prescription.medications.any(item =>
    (item.minAge != null and patient.age < item.minAge)
    or (item.maxAge != null and patient.age > item.maxAge)
    or item.inCategory("QUINOLONE_PEDIATRIC") and patient.age < 18
  )
then
  decision: BLOCK (阻止提交)
  message: "患者年龄超出药品核准的安全用药年龄区间，存在年龄禁忌用药风险。"`,
    parameters: [
      { label: '规则模型', value: '平台基线 · 年龄区间校验引擎', badgeTone: 'neutral' },
      { label: '判定依据', value: '患者实名就诊年龄 vs 药品主数据规格年龄区间' },
      { label: '经典覆盖', value: '18岁以下禁用喹诺酮类软骨发育毒性等' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [
      { code: 'QUINOLONE_PEDIATRIC', name: '喹诺酮类儿童禁忌', description: '左氧氟沙星、莫西沙星、环丙沙星等（18岁以下儿童软骨发育不良风险）' }
    ],
    messageTemplate: '患者年龄超出药品核准的安全用药年龄区间，存在年龄禁忌用药风险。',
    decision: 'BLOCK',
    clinicalRisk: '根据国家药品监督管理局审定药品说明书及《中国药典临床用药须知》，儿童、老年人身体代谢酶系未发育完全或衰退，超年龄适应证使用存在严重毒性反应。'
  },

  // 10. 基线规则：门诊抗菌药用药疗程规范
  'QMED.ANTIMICROBIAL_OUTPATIENT': {
    code: 'QMED.ANTIMICROBIAL_OUTPATIENT',
    name: '门诊抗菌药物疗程超限核查',
    templateType: 'BASELINE_VALIDATION',
    templateName: '基线规则：门诊抗菌药物处方量限制',
    templateBadgeTone: 'neutral',
    isParameterized: false,
    explanation: '门诊处方单次开立抗菌药物疗程超过 7 天时，强制要求医生填写临床超量理由或阻断。',
    dslExpression: `rule "QMED_ANTIMICROBIAL_OUTPATIENT"
when
  encounter.type == "OUTPATIENT"
  and prescription.medications
    .any(item => item.antimicrobial == true and item.durationDays > 7)
then
  decision: REQUIRE_OVERRIDE (继续开立需说明)
  message: "门诊患者开立抗菌药物单次处方疗程超过 7 天，超出基层合理用药规范常规限制。"`,
    parameters: [
      { label: '规则模型', value: '平台基线 · 门诊抗菌处方规范', badgeTone: 'neutral' },
      { label: '适用场景', value: '门诊开立场景 (OUTPATIENT)' },
      { label: '天数阈值', value: '单次处方用药天数 > 7 天', badgeTone: 'warning' },
      { label: '拦截级别', value: '继续开立需说明 (REQUIRE_OVERRIDE)', badgeTone: 'warning' }
    ],
    boundCategories: [],
    messageTemplate: '门诊患者开立抗菌药物单次处方疗程超过 7 天，超出基层合理用药规范常规限制。',
    decision: 'REQUIRE_OVERRIDE',
    clinicalRisk: '严格落实《抗菌药物临床应用管理办法》，门诊患者抗菌药物处方量一般不得超过 7 日用量。超长疗程易导致菌群失调、二重感染及耐药菌株播散。'
  },

  // 11. 基线规则：患者药物过敏史冲突
  'QMED.DRUG_ALLERGY': {
    code: 'QMED.DRUG_ALLERGY',
    name: '患者药物过敏史冲突核查',
    templateType: 'BASELINE_VALIDATION',
    templateName: '基线规则：成分过敏源强校验',
    templateBadgeTone: 'neutral',
    isParameterized: false,
    explanation: '开立药品所含致敏成分或药物分类与患者病历既往过敏史记录重叠时绝对阻断。',
    dslExpression: `rule "QMED_DRUG_ALLERGY"
when
  prescription.medications
    .any(item => item.allergens.intersects(patient.activeAllergies))
then
  decision: BLOCK (阻止提交)
  message: "开立药品成分【{allergen}】与患者既往过敏史记录重叠，存在严重过敏性休克高危风险。"`,
    parameters: [
      { label: '规则模型', value: '平台基线 · 过敏史交集判定引擎', badgeTone: 'neutral' },
      { label: '比对源', value: '患者主索引既往过敏史 vs 药品知识图谱致敏原' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [],
    messageTemplate: '开立药品成分与患者既往过敏史记录重叠，存在严重过敏性休克高危风险。',
    decision: 'BLOCK',
    clinicalRisk: '发生过敏反应的患者再次暴露于相同或交叉致敏药物时，极易诱发喉头水肿、支气管痉挛、过敏性休克及剥脱性皮炎等致命性严重不良事件。'
  },

  // 12. 基线规则：皮试用药准入
  'QMED.SKIN_TEST': {
    code: 'QMED.SKIN_TEST',
    name: '青霉素/头孢等需皮试药品准入核查',
    templateType: 'BASELINE_VALIDATION',
    templateName: '基线规则：国家皮试准入规程',
    templateBadgeTone: 'neutral',
    isParameterized: false,
    explanation: '开立需皮试药品前，系统必须检出当前就诊或有效期内的阴性皮试记录，未皮试或皮试阳性者禁止直接开立。',
    dslExpression: `rule "QMED_SKIN_TEST"
when
  prescription.medications
    .any(item => item.skinTestRequired == true and !prescription.hasValidNegativeSkinTest(item))
then
  decision: BLOCK (阻止提交)
  message: "该药品按国家药典要求须进行皮试，未检出有效阴性皮试结果前禁止开立与调配。"`,
    parameters: [
      { label: '规则模型', value: '平台基线 · 临床前置皮试闭环', badgeTone: 'neutral' },
      { label: '判定条件', value: '药品主数据 skinTestRequired = true 且无有效阴性医嘱' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [],
    messageTemplate: '该药品按国家药典要求须进行皮试，未检出有效阴性皮试结果前禁止开立与调配。',
    decision: 'BLOCK',
    clinicalRisk: '青霉素及特定半合成抗生素使用前若未规范进行皮肤敏感试验，一旦发生即刻型 IgE 介导的 I 型超敏反应，可在数分钟内引起呼吸循环衰竭。'
  },

  // 13. 基线规则：通用名及标准规格重复用药
  'QMED.EXACT_GENERIC_DUPLICATE': {
    code: 'QMED.EXACT_GENERIC_DUPLICATE',
    name: '通用名及标准规格完全重复用药核查',
    templateType: 'BASELINE_VALIDATION',
    templateName: '基线规则：同品/同成分重复用药',
    templateBadgeTone: 'neutral',
    isParameterized: false,
    explanation: '处方中同时开立相同通用名、相同标准编码或相同活性成分的药品，触发重复用药阻断。',
    dslExpression: `rule "QMED_EXACT_GENERIC_DUPLICATE"
when
  prescription.medications
    .groupBy(item => item.standardReferenceCode)
    .any(group => group.count >= 2)
then
  decision: BLOCK (阻止提交)
  message: "处方中同时开立了相同通用名或相同标准规格的药品【{medName}】，属于无指征重复开立。"`,
    parameters: [
      { label: '规则模型', value: '平台基线 · 通用名与标准编码精准比对', badgeTone: 'neutral' },
      { label: '比对源', value: '国家标准药品编码 (StandardReferenceCode)' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [],
    messageTemplate: '处方中同时开立了相同通用名或相同标准规格的药品【{medName}】，属于无指征重复开立。',
    decision: 'BLOCK',
    clinicalRisk: '同方重复开立相同或高度一致的药品，常由于医生多选、误操作或患者未陈述正在服用品种导致，极易造成药物过量及严重毒副反应。'
  },

  // 14. 模板 A：双硫仑样反应相互作用核查
  'QMED.DISULFIRAM_INTERACTION': {
    code: 'QMED.DISULFIRAM_INTERACTION',
    name: '双硫仑样反应相互作用核查',
    templateType: 'TEMPLATE_A_CONFLICT',
    templateName: '模板 A：分类药对冲突',
    templateBadgeTone: 'danger',
    isParameterized: true,
    explanation: '处方中头孢哌酮/甲硝唑等双硫仑高危药物与乙醇溶媒制剂同方开立时触发严重阻断。',
    dslExpression: `rule "QMED_DISULFIRAM_INTERACTION"
when
  prescription.medications
    .any(item => item.inCategory("DISULFIRAM_ANTIBIOTIC"))
  and prescription.medications
    .any(item => item.inCategory("ETHANOL_SOLVENT"))
then
  decision: BLOCK (阻止提交)
  message: "双硫仑高危抗菌药物与含乙醇制剂/溶媒联用，可抑制乙醛脱氢酶导致致死性乙醛蓄积。"`,
    parameters: [
      { label: '规则模型', value: '模板 A · 药对相互作用冲突', badgeTone: 'danger' },
      { label: '第一分类', value: '头孢哌酮、甲硝唑、替硝唑等具甲硫四氮唑侧链抗菌药' },
      { label: '第二分类', value: '含乙醇溶媒制剂（氢化可的松注射液、藿香正气水等）' },
      { label: '拦截级别', value: '阻止提交 (BLOCK)', badgeTone: 'danger' }
    ],
    boundCategories: [],
    messageTemplate: '双硫仑高危抗菌药物与含乙醇制剂/溶媒联用，可抑制乙醛脱氢酶导致致死性乙醛蓄积。',
    decision: 'BLOCK',
    clinicalRisk: '含甲硫四氮唑侧链药物抑制肝脏乙醛脱氢酶活性，联用乙醇会导致体内乙醛大量蓄积，出现面部潮红、头痛、眩晕、心动过速、低血压甚至休克死亡。'
  }
}

/**
 * 根据规则代码及执行器标识获取结构化规范
 */
export function getBuiltinRuleSpec(code: string, implementationKey?: string): BuiltinRuleSpec | null {
  if (BUILTIN_RULE_SPECS[code]) {
    return BUILTIN_RULE_SPECS[code]
  }

  // 兜底尝试根据 implementationKey 反查
  if (implementationKey) {
    if (implementationKey.includes('ppi')) return BUILTIN_RULE_SPECS['QMED.PPI_DUPLICATE']
    if (implementationKey.includes('rasi')) return BUILTIN_RULE_SPECS['QMED.RASI_DUPLICATE']
    if (implementationKey.includes('sedative')) return BUILTIN_RULE_SPECS['QMED.SEDATIVE_HYPNOTIC_DUPLICATE']
    if (implementationKey.includes('tetracycline')) return BUILTIN_RULE_SPECS['QMED.TETRACYCLINE_PEDIATRIC']
    if (implementationKey.includes('aminoglycoside')) return BUILTIN_RULE_SPECS['QMED.AMINOGLYCOSIDE_PEDIATRIC']
    if (implementationKey.includes('macrolide')) return BUILTIN_RULE_SPECS['QMED.MACROLIDE_STATIN_INTERACTION']
    if (implementationKey.includes('pregnancy')) return BUILTIN_RULE_SPECS['QMED.PREGNANCY_CONTRA']
    if (implementationKey.includes('nsaid')) return BUILTIN_RULE_SPECS['QMED.NSAID_DUPLICATE']
    if (implementationKey.includes('age')) return BUILTIN_RULE_SPECS['QMED.AGE_CONTRAINDICATION']
    if (implementationKey.includes('antimicrobial')) return BUILTIN_RULE_SPECS['QMED.ANTIMICROBIAL_OUTPATIENT']
    if (implementationKey.includes('allergy')) return BUILTIN_RULE_SPECS['QMED.DRUG_ALLERGY']
    if (implementationKey.includes('skin-test')) return BUILTIN_RULE_SPECS['QMED.SKIN_TEST']
    if (implementationKey.includes('disulfiram')) return BUILTIN_RULE_SPECS['QMED.DISULFIRAM_INTERACTION']
  }

  return null
}
