#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const genericDir = path.join(root, "backend/src/main/resources/db/migration");
const oracleDir = path.join(root, "backend/src/main/resources/db/oracle");
const genericOutput = path.join(genericDir, "V131__rhn_physical_schema.sql");
const oracleOutput = path.join(oracleDir, "V131__rhn_physical_schema.sql");
const catalogOutput = path.join(root, "docs/foundation/RHN物理表命名映射.md");
const mappingOutput = path.join(root, "docs/foundation/rhn-physical-schema-map.json");

const existingMappings = fs.existsSync(mappingOutput)
  ? JSON.parse(fs.readFileSync(mappingOutput, "utf8"))
  : [];
const existingByLegacy = new Map(existingMappings.map((table) => [table.legacy ?? table.logical, table]));

const domainRules = [
  ["SYS", /^(configuration_definitions|configuration_revisions)$/],
  ["AI", /^ai_/],
  ["AUD", /^(audit_logs|cryptographic_evidence|iam_authorization_events)$/],
  ["ANL", /^presence_metric_samples$/],
  ["INT", /^(outbox_events|event_consumptions|external_messages|idempotency_records)$/],
  ["INS", /^(insurance_|resident_coverages)/],
  ["BIL", /^(patient_accounts|registration_billing_intents|charge_|settlement|payment|invoice|receipt|ledger_|cashier_|reconciliation_)/],
  ["SUP", /^(inventory_|stock_|supplier|purchase_|goods_receipt|dispense_|medication_dispense|pharmacy_|ward_deliver|ward_med_return|inpatient_med_supply|inpatient_med_consumption)/],
  ["HPL", /^(disease_management|care_task|conditions)/],
  ["SC", /^(appointment|schedule_|service_schedule|slot_|queue_|patient_registrations)/],
  ["PI", /^(residents|resident_)/],
  ["VIS", /^(encounter|care_episodes|health_events|clinical_document|observations|allergy_intolerances|critical_value|service_locations|inpatient_(bed|chart|episode|events|nursing|observation|shift))/],
  ["EX", /^(care_requests|request_groups|service_requests|medication_requests|diagnostic_|diagnostic_reports|laboratory_service_specimens|treatment_|skin_test|examination_attachment|inpatient_order|outpatient_referral)/],
  ["META", /^(outpatient_note_form|outpatient_note_templates|outpatient_plan_templates|outpatient_plan_diagnoses|outpatient_plan_medications|outpatient_plan_services|print_template)/],
  ["BD", /^(dictionary_|code_systems|concept|value_set|catalog_|item_|medication|manufacturers|organization_catalog|organization_concepts|service_items|service_variants|laboratory_services|examination_services|supply_items|unit_|order_frequenc|grid_address|master_data_import)/],
  ["SYS", /.*/],
];

const abbreviations = new Map(Object.entries({
  access: "ACC", account: "ACCT", accounts: "ACCT", additional: "ADDL", adjustment: "ADJ", adjustments: "ADJ",
  administration: "ADMIN", addresses: "ADDR", address: "ADDR", allocation: "ALLOC", allocations: "ALLOC",
  announcement: "ANN", announcements: "ANN", appointment: "APPT", appointments: "APPT",
  assignment: "ASSIGN", assignments: "ASSIGN", attachment: "ATTACH", attribute: "ATTR",
  authorization: "AUTH", authorizations: "AUTH", balance: "BAL", balances: "BAL", batch: "BATCH", batches: "BATCH",
  billing: "BIL", capabilities: "CAP", capability: "CAP", catalog: "CATALOG", categories: "CAT", category: "CAT",
  change: "CHG", changes: "CHG", clinical: "CLIN", close: "CLOSE", closes: "CLOSE", closing: "CLOSE",
  code: "CODE", codes: "CODE", completion: "COMP", configuration: "CFG", consumption: "CONSUME",
  consumptions: "CONSUME", contact: "CONTACT", contacts: "CONTACT", conversion: "CONV", conversions: "CONV",
  condition: "COND", conditions: "COND", component: "COMP", components: "COMP",
  counter: "COUNT", counters: "COUNT", critical: "CRIT", cryptographic: "CRYPTO", daily: "DAILY",
  definition: "DEF", definitions: "DEF", deliveries: "DELIV", delivery: "DELIV", demographic: "DEMO",
  department: "DEPT", departments: "DEPT", detail: "DETAIL", details: "DETAIL", diagnoses: "DIAG",
  diagnosis: "DIAG", diagnostic: "DIAG", dictionary: "DICT", dispense: "DISP", document: "DOC",
  documents: "DOC", employment: "EMPL", employments: "EMPL", encounter: "ENC", encounters: "ENC",
  event: "EVT", events: "EVT", evidence: "EVID", examination: "EXAM", execution: "EXEC",
  entry: "ENTRY", entries: "ENTRY", exception: "EXCEPT", exceptions: "EXCEPT", fact: "FACT", facts: "FACT",
  external: "EXT", fulfillment: "FULFILL", frequency: "FREQ", frequencies: "FREQ", configs: "CFG", generation: "GEN", generation_runs: "GEN_RUN",
  group: "GRP", groups: "GRP", handoff: "HANDOFF", histories: "HIST", history: "HIST",
  identifier: "IDENT", identifiers: "IDENT", identity: "IDENT", idempotency: "IDEMP", inpatient: "INP",
  insurance: "INS", inventory: "INV", item: "ITEM", items: "ITEM", laboratory: "LAB", ledger: "LEDGER",
  line: "LINE", lines: "LINE", location: "LOC", locations: "LOC", management: "MGMT", manufacturer: "MFR",
  manufacturers: "MFR", mapping: "MAP", mappings: "MAP", master: "MASTER", medication: "MED",
  message: "MSG", messages: "MSG", metric: "METRIC", module: "MOD", modules: "MOD", nursing: "NURS",
  observation: "OBS", observations: "OBS", open: "OPEN", order: "ORDER", organization: "ORG",
  organizations: "ORG", outpatient: "OP", package: "PKG", packages: "PKG", parameter: "PARAM",
  parameters: "PARAM", patient: "PAT", payment: "PAY", permissions: "PERM", permission: "PERM",
  pharmacy: "PHARM", position: "POS", positions: "POS", presence: "PRES", price: "PRICE", prices: "PRICE",
  aliases: "ALIAS", alias: "ALIAS", candidate: "CAND", candidates: "CAND", coverage: "COVER", coverages: "COVER",
  notification: "NOTIFY", notifications: "NOTIFY", occupancy: "OCCUP", occupancies: "OCCUP",
  print: "PRINT", practitioner: "PRACT", practitioners: "PRACT", profile: "PROF", profiles: "PROF",
  program: "PROG", programs: "PROG", projection: "PROJ", projections: "PROJ", purchase: "PURCH",
  publish: "PUBLISH", published: "PUBLISD",
  queue: "QUEUE", receipt: "RCPT", receipts: "RCPT", reconciliation: "RECON", referral: "REFER",
  registration: "REG", relation: "REL", relations: "REL", report: "REPORT", reports: "REPORT",
  request: "REQ", requests: "REQ", reservation: "RESV", reservations: "RESV", resident: "PAT",
  residents: "PAT", responsibility: "RESP", responsibilities: "RESP", return: "RETURN", route: "ROUTE",
  routes: "ROUTE", rule: "RULE", rules: "RULE", schedule: "SCHED", schedules: "SCHED", scheduling: "SCHED",
  service: "SVC", services: "SVC", settlement: "STL", settlements: "STL", signature: "SIGN",
  signatures: "SIGN", site: "SITE", sites: "SITE", slot: "SLOT", slots: "SLOT", snapshot: "SNAP",
  snapshots: "SNAP", source: "SRC", specimen: "SPEC", specimens: "SPEC", split: "SPLIT", staff: "STAFF",
  stock: "STOCK", summary: "SUM", summaries: "SUM", supplier: "SUPPL", suppliers: "SUPPL",
  supply: "SUPPLY", system: "SYS", task: "TASK", tasks: "TASK", template: "TMPL", templates: "TMPL",
  tender: "TENDER", tenders: "TENDER", trace: "TRACE", transaction: "TXN", transactions: "TXN",
  transfer: "XFER", transfers: "XFER", treatment: "TREAT", type: "TYPE", types: "TYPE", unit: "UNIT", user: "USER",
  users: "USER", valuation: "VALUAT", value: "VAL", values: "VAL", variant: "VAR", variants: "VAR", version: "VER",
  versions: "VER", revision: "REV", revisions: "REV", workspace: "WKSPACE", workspaces: "WKSPACE",
  ward: "WARD", work: "WORK", workflow: "WF", workflows: "WF",
  ai: "AI", alert: "ALERT", alerts: "ALERT", allergy: "ALLERGY", audit: "AUD", bed: "BED", bins: "BIN",
  care: "CARE", cashier: "CASHIER", charge: "CHARGE", chart: "CHART", checks: "CHECK", claim: "CLAIM", claims: "CLAIM",
  concept: "CONCEPT", concepts: "CONCEPT", count: "COUNT", counts: "COUNT", data: "DATA", day: "DAY",
  disease: "DISEASE", dispenses: "DISP", episode: "EPISODE", episodes: "EPISODE",
  form: "FORM", gen: "GEN", goods: "GOOD", grid: "GRID", health: "HEALTH", herbal: "HERBAL",
  holds: "HOLD", iam: "IAM", import: "IMPORT", intents: "INTENT", intolerances: "INTOL",
  invoice: "INVOICE", invoices: "INVOICE", issues: "ISSUE", jobs: "JOB", logs: "LOG", lots: "LOT",
  match: "MATCH", med: "MED", medications: "MED", members: "MEMBER", merge: "MERGE", note: "NOTE",
  nodes: "NODE", orders: "ORDER", outbox: "OUTBOX",
  outputs: "OUTPUT", override: "OVRD", overrides: "OVRD", payments: "PAY", period: "PERIOD",
  periods: "PERIOD", persons: "PERSON", plan: "PLAN", pools: "POOL", portal: "PORTAL", products: "PRODUCT",
  read: "READ", records: "RECORD", registration: "REG", registrations: "REG", related: "RELATED", requisition: "REQ",
  requisitions: "REQ", resource: "RSRC", resources: "RSRC", response: "RESP", responses: "RESP",
  results: "RESULT", reviews: "REVIEW", role: "ROLE", roles: "ROLE", rows: "ROW", runs: "RUN", samples: "SAMPLE",
  sessions: "SESSION", set: "SET", sets: "SET", shift: "SHIFT", skin: "SKIN", status: "STATUS",
  subjects: "SUBJECT", suggestion: "SUGGEST", suggestions: "SUGGEST", systems: "SYSTEM",
  tenants: "TNT", term: "TERM", test: "TEST", ticket: "TICKET", tickets: "TICKET", totals: "TOTAL",
  vaccine: "VACCINE", western: "WESTERN",
}));

const tableEntityOverrides = new Map(Object.entries({
  catalog_change_batches: "CATALOG_CHG_BATCH",
  catalog_change_batch_rows: "CATALOG_CHG_ROW",
  configuration_definitions: "CFG_DEF",
  configuration_revisions: "CFG_REV",
  insurance_claim_responses: "CLAIM_RESP",
  item_attribute_overrides: "ITEM_ATTR_OVRD",
  item_type_attributes: "ITEM_TYPE_ATTR",
  master_data_import_batches: "IMPORT_BATCH",
  master_data_import_rows: "IMPORT_ROW",
  medication_dispenses: "MED_DISP",
  medications: "MED",
  outpatient_plan_medications: "OP_PLAN_MED",
  patient_registrations: "PAT_REG",
  service_resources: "SVC_RSRC",
  stock_requisition_allocations: "STOCK_REQ_ALLOC",
  stock_requisition_lines: "STOCK_REQ_LINE",
  stock_requisitions: "STOCK_REQ",
}));

const primaryKeyOverrides = new Map(Object.entries({
  tenants: "ID_TNT",
  user_accounts: "ID_USER",
}));

const globalColumnOverrides = new Map(Object.entries({
  status_from: "SD_STATUS_FROM",
  status_to: "SD_STATUS_TO",
  content_digest: "HASH_CONTENT",
  payload_digest: "HASH_PAYLOAD",
  statement_digest: "HASH_STATEMENT",
  payer_identity_digest: "HASH_PAYER_IDENTITY",
  diagnosis_payload_digest: "HASH_DIAG_PAYLOAD",
  client_context_fingerprint: "HASH_CLIENT_CONTEXT",
  reason_text: "DES_REASON",
  address_text: "DES_ADDRESS",
  instruction: "DES_INSTRUCTION",
  medication_instruction: "DES_MED_INSTRUCTION",
  attention: "DES_ATTENTION",
  specification: "DES_SPEC",
  content_schema: "JSON_CONTENT_SCHEMA",
  definition_schema: "JSON_DEF_SCHEMA",
  layout_schema: "JSON_LAYOUT_SCHEMA",
  item_attribute_snapshot: "JSON_ITEM_ATTR_SNAP",
  standard_mapping_snapshot: "JSON_STD_MAP_SNAP",
}));

const tableColumnOverrides = new Map(Object.entries({
  "appointments.quantity": "QTY_APPT",
  "care_tasks.request_id": "ID_CARE_REQ",
  "catalog_prices.price": "PRICE_UNIT",
  "charge_item_components.quantity": "QTY_COMPONENT",
  "charge_item_components.amount": "AMT_COMPONENT",
  "charge_items.quantity": "QTY_CHARGE",
  "examination_attachment_items.quantity": "QTY_ATTACH",
  "insurance_claim_lines.quantity": "QTY_CLAIM",
  "invoice_category_summaries.amount": "AMT_CATEGORY",
  "invoice_lines.amount": "AMT_LINE",
  "item_group_members.quantity": "QTY_MEMBER",
  "ledger_entries.amount": "AMT_ENTRY",
  "medication_requests.quantity": "QTY_ORDERED",
  "outpatient_plan_medications.quantity": "QTY_ORDERED",
  "outpatient_plan_services.quantity": "QTY_ORDERED",
  "payments.amount": "AMT_PAYMENT",
  "schedule_slot_holds.quantity": "QTY_HELD",
  "service_requests.quantity": "QTY_ORDERED",
  "inpatient_order_workflows.medication_quantity_per_occurrence": "QTY_MED_PER_OCC",
  "inpatient_order_workflows.medication_base_quantity_per_occurrence": "QTY_MED_BASE_PER_OCC",
}));

const referenceRoleOverrides = new Map(Object.entries({
  "inventory_period_balance_snapshots.opening_source_snapshot_id": "OPENING",
  "organization_catalog_items.replaces_adoption_id": "REPLACED",
}));

const controlledColumns = new Set([
  "action", "antimicrobial_level", "antimicrobial_level_snapshot", "booking_policy", "booking_source",
  "business_scene", "capability_scope", "cardinality", "care_setting", "check_scenario", "consumer_type",
  "context_basis", "control_level", "count_result", "current_operation", "day_of_week", "day_part", "decision",
  "department_property", "device_class", "diagnosis_domain", "diagnosis_stage", "direction", "display_policy",
  "disposition", "duplicate_rule", "encounter_class", "equivalence", "escalation_level", "execution_site",
  "first_day_policy", "gender", "gender_restriction", "generation_trigger", "http_method", "information_source",
  "issue_channel", "issue_policy", "laboratory_method", "minimum_scope", "operation", "organization_property",
  "override_policy", "priority", "processing_method", "protection_profile", "protection_purpose", "purpose",
  "reaction_severity", "recommended_route", "registration_scope", "registration_source", "result", "risk_level",
  "service_scope", "service_subtype", "settlement_scene", "severity", "signature_algorithm", "signature_meaning",
  "stage", "stock_default", "terminal_scene", "test_method", "therapeutic_class", "trigger_action", "urgency",
  "valuation_basis", "variability", "verification_method",
]);

const businessCodeColumns = new Set([
  "actor", "barcode", "canonical_uri", "certificate_serial", "code_from", "code_release", "code_to",
  "condition_key", "config_key", "dedup_key", "idempotency_key", "identifier_system", "identifier_value",
  "instance_key", "job_key", "parameter_key", "phone", "resource_key", "scope_key", "source_key",
  "source_system", "source_uri", "substance_code_system_uri", "subject_key", "udi_di", "username",
]);

const descriptionColumns = new Set([
  "address", "chief_complaint", "conclusion", "definition", "full_path", "indication", "last_error",
  "limitation", "outcome_text", "reaction_text", "resolution", "situation", "street_address",
  "trigger_evidence", "verification_material",
]);

const quantityColumns = new Set([
  "active_users", "capacity", "completion_attempts", "connections", "copies", "default_capacity",
  "default_dose", "dose_value", "duration_value", "failed_rows", "flare_diameter_mm", "frozen_delta",
  "held_delta", "imported_rows", "instances", "invalid_rows", "max_age", "max_temperature",
  "max_tests_per_tube", "min_age", "min_temperature", "minute_end", "minute_start", "observation_minutes",
  "occupied_delta", "online_contexts", "online_users", "period_value", "ready_rows", "report_deadline_hours",
  "report_duration", "shelf_life_value", "slot_minutes", "strength_value", "succeeded_rows", "total_capacity",
  "total_delta", "total_rows", "wheal_diameter_mm",
]);

const amountColumns = new Set([
  "balance_value", "closing_value", "opening_value", "total_value_after", "total_value_before", "value_after",
  "value_before", "value_difference",
]);

const priceColumns = new Set([
  "average_unit_cost", "closing_unit_value", "daily_bed_rate", "new_unit_cost", "old_unit_cost",
  "opening_unit_value", "unit_cost", "unit_price_after", "unit_price_before",
]);

const chineseTerms = new Map(Object.entries({
  access: "访问", account: "账户", action: "操作", active: "有效", address: "地址", adjustment: "调价",
  administration: "管理", adoption: "采用", ai: "AI", alert: "预警", alias: "别名", allergy: "过敏",
  allocation: "分配", announcement: "公告", appointment: "预约", approval: "审批", assignment: "任职",
  attachment: "附件", attribute: "属性", audit: "审计", authorization: "授权", balance: "余额",
  batch: "批次", bed: "床位", billing: "计费", bin: "库位", booking: "预约", business: "业务",
  capability: "能力", care: "照护", cashier: "收银", catalog: "目录", category: "分类", change: "变更",
  charge: "收费", chart: "病历", check: "核查", claim: "理赔", client: "客户端", clinical: "临床", close: "日结",
  code: "编码", completion: "完成", component: "组成", concept: "概念", condition: "健康问题",
  conclusion: "结论", configuration: "配置", contact: "联系方式", consumption: "消耗", context: "上下文", conversion: "换算", count: "盘点",
  counter: "计数器", critical: "危急值", cryptographic: "密码学", data: "数据", day: "日",
  definition: "定义", delivery: "配送", demographic: "人口学", department: "科室", detail: "明细",
  diagnosis: "诊断", diagnostic: "诊疗", dictionary: "字典", disease: "疾病", dispense: "发药",
  document: "文书", employment: "任职", encounter: "就诊", entry: "分录", episode: "周期",
  event: "事件", evidence: "证据", examination: "检查", exception: "例外", execution: "执行",
  external: "外部", fact: "事实", fingerprint: "指纹", form: "表单", frequency: "频次", fulfillment: "履约",
  generation: "生成", goods: "到货", grid: "网格", group: "分组", handoff: "交接", health: "健康",
  history: "历史", hold: "占用", iam: "身份权限", idempotency: "幂等", identifier: "标识",
  identity: "身份", import: "导入", inpatient: "住院", insurance: "医保", intolerance: "不耐受",
  inventory: "库存", invoice: "发票", issue: "问题", item: "项目", job: "作业", laboratory: "检验",
  ledger: "台账", line: "明细", location: "位置", management: "管理", manufacturer: "生产厂商",
  mapping: "映射", master: "主数据", medication: "药品", member: "成员", merge: "合并",
  message: "消息", metric: "指标", module: "模块", next: "下一", note: "备注", notification: "通知",
  nursing: "护理", observation: "观察", occupancy: "占用", open: "拆零", order: "医嘱",
  organization: "机构", outbox: "发件箱", outpatient: "门诊", output: "输出", override: "覆盖",
  package: "包装", parameter: "参数", patient: "患者", payment: "支付", permission: "权限",
  pharmacy: "药房", plan: "方案", portal: "门户", position: "岗位", practitioner: "医务人员",
  presence: "在线状态", price: "价格", print: "打印", product: "产品", profile: "档案",
  program: "方案", purchase: "采购", queue: "队列", receipt: "票据", reconciliation: "核对",
  record: "记录", referral: "转诊", registration: "挂号", relation: "关系", report: "报告",
  request: "请求", requisition: "请领", reservation: "预留", resident: "患者", response: "响应",
  responsibility: "职责", result: "结果", return: "退回", revision: "修订", role: "角色",
  route: "途径", rule: "规则", run: "运行", sample: "样本", schedule: "排班", sequence: "序号", service: "服务",
  session: "会话", settlement: "结算", shift: "班次", signature: "签名", site: "库房",
  skin: "皮试", slot: "号源", snapshot: "快照", source: "来源", specimen: "标本", split: "拆分",
  staff: "员工", status: "状态", stock: "库存", suggestion: "建议", summary: "汇总", supplier: "供应商",
  supply: "供应", system: "体系", task: "任务", template: "模板", tenant: "租户", ticket: "票号",
  trace: "追溯", transaction: "流水", transfer: "调拨", treatment: "治疗", type: "类型",
  unit: "单位", user: "用户", valuation: "计价", value: "值", variant: "变体", version: "版本",
  ward: "病区", work: "工作", workflow: "流程", workspace: "工作台",
  amount: "金额", author: "开立", authored: "开立", base: "基础", cancelled: "取消", closing: "期末",
  command: "命令", content: "内容", created: "创建", date: "日期", description: "说明", digest: "摘要",
  display: "显示", due: "到期", effective: "生效", end: "结束", expiry: "失效", from: "原",
  hash: "哈希", name: "名称", number: "编号", occurred: "发生", opening: "期初", parent: "上级",
  payload: "载荷", previous: "上一", quantity: "数量", reason: "原因", requested: "申请",
  required: "应需", sort: "排序", start: "开始", submitted: "提交", title: "标题", to: "目标",
  total: "总计", updated: "更新",
  accepted: "接受", actions: "操作", actor: "操作人", actual: "实际", admission: "入院", after: "后", age: "年龄",
  algorithm: "算法", allowed: "允许", antimicrobial: "抗菌药物", applicable: "适用", approved: "审批",
  as: "截至", assessment: "评估", assignee: "受理人", attention: "注意事项", authority: "授权机构",
  assurance: "可信等级", barcode: "条码", basis: "依据", before: "前", body: "身体部位",
  cancel: "取消", candidate: "候选", canonical: "规范", capacity: "容量", cardinality: "基数",
  certificate: "证书", changed: "变更", chief: "主", claimed: "认领", closed: "关闭", complaint: "诉求",
  completed: "完成", concentration: "浓度", config: "配置", confirmed: "确认", connections: "连接数",
  consumed: "消耗", contexts: "上下文数", controlled: "受控", copies: "份数", correlation: "关联",
  cost: "成本", coverage: "保障", currency: "币种", decision: "决定", decimal: "小数", default: "默认",
  delta: "变动量", destination: "目标", difference: "差额", discrepancy: "差异", dispatched: "发出",
  details: "详情", device: "器械", di: "器械标识", diastolic: "舒张压", diameter: "直径", dimension: "维度",
  direction: "方向", disposition: "处置方式", domain: "领域", dose: "剂量", duration: "时长",
  equivalence: "等价关系", escalation: "升级", error: "错误", errors: "错误", expected: "预期", expires: "到期",
  factor: "换算系数", favorites: "收藏", field: "字段", flags: "标志", flare: "红斑", gen: "生成",
  gender: "性别", general: "通用", generated: "生成", gross: "总额", herbal: "中药", high: "上限",
  indication: "适应症", instances: "实例数", intent: "意图", instruction: "用法", issued: "签发",
  issuer: "签发方", json: "JSON", key: "键", layout: "布局", level: "等级", limitation: "限制",
  local: "本地", log: "日志", lot: "批号", low: "下限", match: "匹配", max: "最大", med: "用药",
  merged: "合并", method: "方法", min: "最小", mm: "毫米", mode: "模式", normalized: "标准化",
  node: "节点", object: "对象", of: "时点", online: "在线", operation: "业务操作",
  original: "原", owner: "责任方", pending: "待办", path: "路径", payer: "付款方", percent: "百分比",
  performer: "执行人", period: "期间", preparation: "制剂", production: "生产", projection: "投影",
  person: "人员", phone: "电话", picked: "拣货", policy: "策略", pool: "池", posted: "记账", primary: "主要",
  priority: "优先级", protection: "保护", provider: "提供方", publisher: "发布方", published: "发布",
  purpose: "用途", quality: "质量", range: "范围", read: "已读", reasons: "原因", received: "接收",
  recorded: "记录", reference: "参考", restriction: "限制",
  recorder: "记录人", related: "关联", replaced: "被替代", replaces: "替代", resolution: "处理结果",
  resolved: "已解决", resource: "资源", reverses: "冲正", review: "审核", rounding: "舍入", row: "行",
  rows: "行数", scene: "场景", schema: "模式定义", scope: "范围", set: "集", severity: "严重程度",
  scopes: "范围", secret: "密钥", sensitivity: "敏感级别", serial: "序列号", short: "简称",
  signed: "签署", signer: "签署人", situation: "情况", spec: "规格", specification: "规格说明",
  stage: "阶段", started: "开始", statement: "声明", substance: "物质", subject: "主体", symbol: "符号",
  systolic: "收缩压", tabs: "标签页", tax: "税率", temperature: "温度", therapeutic: "治疗",
  tender: "收款方式", term: "术语", terminal: "终端", test: "检测", text: "文本", timestamp: "时间戳",
  timezone: "时区", token: "令牌", trigger: "触发", tube: "试管", udi: "唯一器械标识", uri: "URI",
  urgency: "紧急程度", usage: "用途", use: "用途", users: "用户数", username: "用户名", vaccine: "疫苗",
  valid: "有效", variability: "可变性", verification: "验证", verified: "已验证", western: "西药", wheal: "风团",
  window: "窗口", workload: "工作量",
  verification: "验证", verified: "已验证", western: "西药", window: "窗口",
}));

function chineseIdentifier(value) {
  return value.split("_").filter(Boolean)
    .map((token) => chineseTerms.get(token) ?? token)
    .join("");
}

function tableComment(table) {
  const name = chineseIdentifier(singularEntity(table));
  return `${name}；一行代表一条${name}记录`;
}

function columnComment(table, column, definition) {
  const tableName = chineseIdentifier(singularEntity(table));
  const strip = (pattern) => column.replace(pattern, "").replace(/^_|_$/g, "");
  if (column === "id") return `${tableName}主键`;
  if (column === "tenant_id") return "租户标识";
  if (column === "revision" || column === "version") return "乐观锁修订号";
  if (column.endsWith("_id")) return `${chineseIdentifier(strip(/_id$/))}标识`;
  if (column.endsWith("_by")) return `${chineseIdentifier(strip(/_by$/))}人标识`;
  if (/^boolean\b/i.test(definition) || /^(is_|has_|allow_)/.test(column)) {
    return `是否${chineseIdentifier(column.replace(/^(is_|has_|allow_)/, ""))}`;
  }
  if (column.endsWith("_at")) return `${chineseIdentifier(strip(/_at$/))}时间`;
  if (column.endsWith("_date")) return `${chineseIdentifier(strip(/_date$/))}日期`;
  if (/^(date|timestamp)\b/i.test(definition) && column.endsWith("_from")) {
    return `${chineseIdentifier(strip(/_from$/))}开始日期`;
  }
  if (/^(date|timestamp)\b/i.test(definition) && column.endsWith("_to")) {
    return `${chineseIdentifier(strip(/_to$/))}结束日期`;
  }
  if (column.endsWith("_code")) return `${chineseIdentifier(strip(/_code$/))}编码`;
  if (column.endsWith("_no") || column.endsWith("_number")) return `${chineseIdentifier(strip(/_(?:no|number)$/))}编号`;
  if (column.endsWith("_name")) return `${chineseIdentifier(strip(/_name$/))}名称`;
  if (column.endsWith("_status")) return `${chineseIdentifier(strip(/_status$/))}状态`;
  if (column.endsWith("_type")) return `${chineseIdentifier(strip(/_type$/))}类型`;
  if (column.endsWith("_amount")) return `${chineseIdentifier(strip(/_amount$/))}金额`;
  if (column.endsWith("_quantity")) return `${chineseIdentifier(strip(/_quantity$/))}数量`;
  if (column.endsWith("_price")) return `${chineseIdentifier(strip(/_price$/))}单价`;
  if (column.endsWith("_digest") || column.endsWith("_hash")) {
    return `${chineseIdentifier(strip(/_(?:digest|hash)$/))}摘要`;
  }
  return chineseIdentifier(column);
}

function sqlLiteral(value) {
  return value.replaceAll("'", "''");
}

const redundantDomainTokens = {
  AI: new Set(["ai"]),
  AUD: new Set(["audit"]),
  INS: new Set(["insurance"]),
  SYS: new Set(["system"]),
};

// Oracle 19c rejects RENAME COLUMN for columns referenced by descending indexes.
// V131 drops only those indexes and recreates them with the mapped identifiers.
const oracleDescendingIndexes = [
  ["idx_health_event_timeline", "health_events", [["tenant_id"], ["resident_id"], ["occurred_at", "desc"]]],
  ["idx_audit_tenant_time", "audit_logs", [["tenant_id"], ["occurred_at", "desc"]]],
  ["idx_clinical_document_resident", "clinical_documents", [["tenant_id"], ["resident_id"], ["updated_at", "desc"]]],
  ["idx_document_version_history", "clinical_document_versions", [["tenant_id"], ["document_id"], ["version_number", "desc"]]],
  ["idx_parameter_change_definition", "parameter_changes", [["definition_id"], ["changed_at", "desc"]]],
  ["idx_ai_suggestion_encounter", "ai_suggestions", [["tenant_id"], ["encounter_id"], ["status"], ["generated_at", "desc"]]],
  ["idx_ai_suggestion_history", "ai_suggestions", [["tenant_id"], ["encounter_id"], ["generated_at", "desc"]]],
  ["idx_ai_suggestion_encounter_fk", "ai_suggestions", [["tenant_id"], ["resident_id"], ["encounter_id"], ["generated_at", "desc"]]],
  ["idx_ai_suggestion_org_dept", "ai_suggestions", [["tenant_id"], ["organization_id"], ["department_id"], ["generated_at", "desc"]]],
  ["idx_ai_suggestion_resident", "ai_suggestions", [["tenant_id"], ["resident_id"], ["generated_at", "desc"]]],
  ["idx_ai_suggestion_pract", "ai_suggestions", [["tenant_id"], ["requested_practitioner_id"], ["generated_at", "desc"]]],
  ["idx_ai_suggestion_user", "ai_suggestions", [["tenant_id"], ["requested_user_id"], ["generated_at", "desc"]]],
];

// Oracle adapter columns emulate partial unique constraints with nullable virtual keys.
// They are not part of the portable business model, but still follow physical naming rules.
const oracleAdapterColumns = [
  ["inpatient_med_supply_batches", "submit_cmd_scope_key", "ID_TNT_SUBMIT_SCOPE"],
  ["inpatient_med_supply_batches", "cancel_cmd_scope_key", "ID_TNT_CANCEL_SCOPE"],
];

function sqlFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => /^V.+\.sql$/.test(name) && name !== path.basename(genericOutput))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8"));
}

function abbreviate(value, preserveUnknown = false) {
  return value.split("_").filter(Boolean).map((token) => {
    const direct = abbreviations.get(token);
    if (direct) return direct;
    const singular = token.endsWith("ies")
      ? `${token.slice(0, -3)}y`
      : token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
    const normalized = abbreviations.get(singular);
    if (normalized) return normalized;
    if (!preserveUnknown) return token.toUpperCase();
    throw new Error(`Unknown table abbreviation token: ${token}`);
  }).join("_");
}

function domainOf(table) {
  return domainRules.find(([, pattern]) => pattern.test(table))[0];
}

function tableName(table) {
  const domain = domainOf(table);
  const overridden = tableEntityOverrides.get(table);
  if (overridden) return `RHN_${domain}_${overridden}`;
  const tokens = table.split("_");
  if (redundantDomainTokens[domain]?.has(tokens[0])) tokens.shift();
  return `RHN_${domain}_${abbreviate(tokens.join("_"), true)}`;
}

function singularEntity(table) {
  const tokens = table.split("_");
  const last = tokens.at(-1);
  const irregular = new Map([
    ["addresses", "address"],
    ["aliases", "alias"],
    ["batches", "batch"],
    ["diagnoses", "diagnosis"],
  ]);
  const invariant = new Set(["evidence", "history", "status"]);
  if (irregular.has(last)) tokens[tokens.length - 1] = irregular.get(last);
  else if (last.endsWith("ies")) tokens[tokens.length - 1] = `${last.slice(0, -3)}y`;
  else if (last.endsWith("s") && !last.endsWith("ss") && !invariant.has(last)) {
    tokens[tokens.length - 1] = last.slice(0, -1);
  }
  return tokens.join("_");
}

function canonicalName(table) {
  return `${domainOf(table).toLowerCase()}.${singularEntity(table)}`;
}

function splitDefinitions(body) {
  const definitions = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];
    if (char === "'" && quoted && next === "'") {
      current += "''";
      index += 1;
      continue;
    }
    if (char === "'") quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") {
      definitions.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) definitions.push(current.trim());
  return definitions;
}

function collectSchema(sql) {
  const tables = new Map();
  const createPattern = /create\s+table\s+([a-z][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi;
  for (const text of sql) {
    for (const match of text.matchAll(createPattern)) {
      const [, table, body] = match;
      const columns = tables.get(table) ?? new Map();
      for (const definition of splitDefinitions(body)) {
        const column = definition.match(/^([a-z][a-z0-9_]*)\s+([\s\S]+)$/i);
        if (!column || !/^(bigint|int|integer|smallint|varchar|char|decimal|numeric|number|date|timestamp|boolean|text|clob|blob)\b/i.test(column[2])) continue;
        columns.set(column[1].toLowerCase(), column[2]);
      }
      tables.set(table.toLowerCase(), columns);
    }
  }

  const addPattern = /alter\s+table\s+([a-z][a-z0-9_]*)\s+add(?:\s+column)?\s+([a-z][a-z0-9_]*)\s+([^;]+);/gi;
  for (const text of sql) {
    for (const match of text.matchAll(addPattern)) {
      const [, table, column, definition] = match;
      if (/^constraint\b/i.test(column)) continue;
      const columns = tables.get(table.toLowerCase());
      if (!columns) throw new Error(`Column added to unknown table: ${table}.${column}`);
      columns.set(column.toLowerCase(), definition.trim());
    }
  }
  return tables;
}

function identifiers(value) {
  return value.split(",").map((item) => item.trim().replace(/^"|"$/g, "").toLowerCase());
}

function collectForeignKeys(sql) {
  const active = new Map();
  const constraintPattern = /^(?:constraint\s+([a-z][a-z0-9_]*)\s+)?foreign\s+key\s*\(([^)]+)\)\s+references\s+([a-z][a-z0-9_]*)\s*\(([^)]+)\)/i;
  const createPattern = /create\s+table\s+([a-z][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi;
  const alterAddPattern = /alter\s+table\s+([a-z][a-z0-9_]*)\s+add\s+(?:constraint\s+([a-z][a-z0-9_]*)\s+)?foreign\s+key\s*\(([^)]+)\)\s+references\s+([a-z][a-z0-9_]*)\s*\(([^)]+)\)/gi;
  const alterDropPattern = /alter\s+table\s+([a-z][a-z0-9_]*)\s+drop\s+constraint\s+([a-z][a-z0-9_]*)/gi;

  function put(table, name, localColumns, referencedTable, referencedColumns) {
    if (localColumns.length !== referencedColumns.length) {
      throw new Error(`Invalid foreign key column count in ${table}`);
    }
    const key = name
      ? `${table}.${name}`
      : `${table}.@${localColumns.join(",")}->${referencedTable}(${referencedColumns.join(",")})`;
    active.set(key, { table, localColumns, referencedTable, referencedColumns });
  }

  for (const text of sql) {
    const events = [];
    for (const match of text.matchAll(createPattern)) {
      events.push({ type: "create", index: match.index, table: match[1].toLowerCase(), body: match[2] });
    }
    for (const match of text.matchAll(alterAddPattern)) {
      events.push({
        type: "add",
        index: match.index,
        table: match[1].toLowerCase(),
        name: match[2]?.toLowerCase(),
        localColumns: identifiers(match[3]),
        referencedTable: match[4].toLowerCase(),
        referencedColumns: identifiers(match[5]),
      });
    }
    for (const match of text.matchAll(alterDropPattern)) {
      events.push({
        type: "drop",
        index: match.index,
        table: match[1].toLowerCase(),
        name: match[2].toLowerCase(),
      });
    }
    for (const event of events.sort((a, b) => a.index - b.index)) {
      if (event.type === "drop") {
        active.delete(`${event.table}.${event.name}`);
        continue;
      }
      if (event.type === "create") {
        for (const definition of splitDefinitions(event.body)) {
          const constraint = definition.match(constraintPattern);
          if (!constraint) continue;
          put(
            event.table,
            constraint[1]?.toLowerCase(),
            identifiers(constraint[2]),
            constraint[3].toLowerCase(),
            identifiers(constraint[4]),
          );
        }
        continue;
      }
      put(event.table, event.name, event.localColumns, event.referencedTable, event.referencedColumns);
    }
  }
  return [...active.values()];
}

function columnName(table, column, definition) {
  const entity = tableEntityOverrides.get(table) ?? abbreviate(table, true);
  const upper = (value) => abbreviate(value).replace(/_+/g, "_");
  const strip = (value, pattern) => value.replace(pattern, "").replace(/^_|_$/g, "");
  const isBoolean = /^boolean\b/i.test(definition);
  const isDate = /^date\b/i.test(definition);
  const isTimestamp = /^timestamp\b/i.test(definition);
  const isNumeric = /^(?:bigint|int|integer|smallint|decimal|numeric|number)\b/i.test(definition);

  const explicit = tableColumnOverrides.get(`${table}.${column}`) ?? globalColumnOverrides.get(column);
  if (explicit) return explicit;
  if (column === "id") return primaryKeyOverrides.get(table) ?? `ID_${tableEntityOverrides.get(table) ?? entity}`;
  if (column === "tenant_id") return "ID_TNT";
  if (column === "revision" || column === "version") return "REVISION";
  if (column.endsWith("_id")) return `ID_${upper(strip(column, /_id$/))}`;
  if (column.endsWith("_by")) {
    return `ID_USER_${upper(strip(column, /_by$/))}`;
  }
  if (isBoolean || /^(is_|has_|allow_|enabled$|active$)|(_enabled|_allowed|required|_primary|_active)$/.test(column)) {
    return `FG_${upper(column.replace(/^(is_|has_|allow_)/, "").replace(/_enabled$/, "").replace(/_allowed$/, ""))}`;
  }
  if (column === "code_snapshot") return "CD_CODE_SNAP";
  if (column.endsWith("_code_snapshot")) return `CD_${upper(strip(column, /_code_snapshot$/))}_SNAP`;
  if (column.endsWith("_no_snapshot")) return `CD_${upper(strip(column, /_no_snapshot$/))}_SNAP`;
  if (column.endsWith("_name_snapshot")) return `NA_${upper(strip(column, /_name_snapshot$/))}_SNAP`;
  if (column === "display_snapshot") return "NA_DISPLAY_SNAP";
  if (column.endsWith("_title_snapshot") || column.endsWith("_display_snapshot")) {
    return `NA_${upper(strip(column, /_(?:_title|_display)_snapshot$/))}_SNAP`;
  }
  if (/(?:^|_)(?:status|type|category|kind|mode)_snapshot$/.test(column)) {
    return `SD_${upper(strip(column, /_snapshot$/))}_SNAP`;
  }
  if (column === "code") return `CD_${entity}`;
  if (column.endsWith("_code")) return `CD_${upper(strip(column, /_code$/))}`;
  if (/(?:^|_)(?:sequence|line|attempt)_no$/.test(column)) return `SN_${upper(strip(column, /_no$/))}`;
  if (column.endsWith("_no") || column.endsWith("_number")) return `CD_${upper(strip(column, /_(?:_no|_number)$/))}`;
  if (column === "status") return "SD_STATUS";
  if (/(^|_)status_(from|to)$/.test(column)) return `SD_${upper(column)}`;
  if (/(^|_)(status|type|category|kind|mode)$/.test(column)) return `SD_${upper(column)}`;
  if (controlledColumns.has(column)) return `SD_${upper(column)}`;
  if (businessCodeColumns.has(column)) return `CD_${upper(column)}`;
  if (column === "name") return `NA_${entity}`;
  if (/(^|_)(name|title|display)$/.test(column)) return `NA_${upper(strip(column, /_(?:name|title|display)$/)) || entity}`;
  if (column === "description") return `DES_${entity}`;
  if (descriptionColumns.has(column) || column.endsWith("_text")) return `DES_${upper(column.replace(/_text$/, ""))}`;
  if (/(^|_)(description|reason|remark|remarks|summary|comment|comments|note|notes|message|detail)$/.test(column)) {
    return `DES_${upper(column)}`;
  }
  if (column.endsWith("_at")) return `DT_${upper(strip(column, /_at$/))}`;
  if (column.endsWith("_date") || column === "date") return `DA_${upper(strip(column, /_date$/)) || entity}`;
  if (isTimestamp) return `DT_${upper(column)}`;
  if (isDate) return `DA_${upper(column)}`;
  if (column === "sort_order") return "SN_SORT";
  if (column.endsWith("_sort_order")) return `SN_${upper(strip(column, /_sort_order$/))}_SORT`;
  if (column === "value_order") return "SN_VALUE";
  if (column === "next_sequence") return "SN_NEXT";
  if (column.endsWith("_revision") || column.endsWith("_version")) {
    const stem = strip(column, /_(?:revision|version)$/);
    return `${isNumeric ? "SN" : "CD"}_${upper(stem)}_VER`;
  }
  if (column.endsWith("_count")) return `QTY_${upper(strip(column, /_count$/))}`;
  if (quantityColumns.has(column)) return `QTY_${upper(column.replace(/_rows$/, "_ROW"))}`;
  if (column.endsWith("_digest")) return `HASH_${upper(strip(column, /_digest$/))}`;
  if (column.endsWith("_fingerprint")) return `HASH_${upper(strip(column, /_fingerprint$/))}`;
  if (column.startsWith("amount_") || column.endsWith("_amount") || column === "amount") {
    const semantic = column === "amount" ? (tableEntityOverrides.get(table) ?? entity) : column.replace(/^amount_/, "").replace(/_amount$/, "");
    return `AMT_${upper(semantic)}`;
  }
  if (amountColumns.has(column)) return `AMT_${upper(column.replace(/_value$/, ""))}`;
  if (column.startsWith("quantity_") || column.startsWith("qty_") || column.endsWith("_quantity") || column.endsWith("_qty") || /^(quantity|qty)$/.test(column)) {
    const semantic = /^(quantity|qty)$/.test(column) ? (tableEntityOverrides.get(table) ?? entity) : column.replace(/^(?:quantity|qty)_/, "").replace(/_(?:quantity|qty)$/, "");
    return `QTY_${upper(semantic)}`;
  }
  if (column.startsWith("price_") || column.endsWith("_price") || column === "price") {
    const semantic = column === "price" ? (tableEntityOverrides.get(table) ?? entity) : column.replace(/^price_/, "").replace(/_price$/, "");
    return `PRICE_${upper(semantic)}`;
  }
  if (priceColumns.has(column)) {
    const semantic = column
      .replace(/_unit_value$/, "")
      .replace(/_unit_cost$/, "_unit_cost")
      .replace(/^daily_bed_rate$/, "bed_day");
    return `PRICE_${upper(semantic)}`;
  }
  if (/(^|_)json($|_)/.test(column) || column.endsWith("_json")) return `JSON_${upper(column.replace(/^json_/, "").replace(/_json$/, ""))}`;
  if (column.startsWith("hash_") || column.endsWith("_hash")) return `HASH_${upper(column.replace(/^hash_/, "").replace(/_hash$/, ""))}`;
  return column.toUpperCase();
}

function buildMappings(tables) {
  const usedTables = new Map();
  const result = [];
  for (const [table, columns] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
    const physical = tableName(table);
    if (physical.length > 30) throw new Error(`Physical table exceeds 30 characters: ${table} -> ${physical}`);
    if (usedTables.has(physical)) throw new Error(`Duplicate physical table ${physical}: ${usedTables.get(physical)}, ${table}`);
    usedTables.set(physical, table);
    const existingTable = existingByLegacy.get(table);
    const usedColumns = new Map();
    const mappedColumns = [];
    for (const [column, definition] of columns) {
      const physicalColumn = columnName(table, column, definition);
      if (usedColumns.has(physicalColumn)) {
        throw new Error(`Duplicate physical column ${physicalColumn}: ${table}.${usedColumns.get(physicalColumn)}, ${table}.${column}`);
      }
      usedColumns.set(physicalColumn, column);
      mappedColumns.push({
        logical: column,
        physical: physicalColumn,
        comment: columnComment(table, column, definition),
      });
    }
    for (const column of mappedColumns) {
      if (column.physical.length > 30) {
        throw new Error(`Physical column exceeds 30 characters: ${table}.${column.logical} -> ${column.physical}`);
      }
    }
    result.push({
      logical: canonicalName(table),
      legacy: table,
      physical,
      domain: domainOf(table),
      comment: tableComment(table),
      columns: mappedColumns,
    });
  }
  return result;
}

function referenceAliases(table) {
  const entity = singularEntity(table);
  const tokens = entity.split("_");
  const aliases = new Set(tokens.map((_, index) => tokens.slice(index).join("_")));
  if (table === "user_accounts") aliases.add("user");
  if (table === "care_requests") aliases.add("request");
  if (table === "clinical_documents") aliases.add("document");
  if (table === "ai_suggestions") aliases.add("suggestion");
  if (table === "residents") aliases.add("patient");
  return [...aliases].sort((a, b) => b.length - a.length);
}

function referenceRole(localColumn, referencedColumn, referencedTable) {
  if (localColumn === referencedColumn) return "";
  let stem = localColumn.replace(/_id$/, "").replace(/_by$/, "");
  const referencedStem = referencedColumn.replace(/_id$/, "");
  const aliases = referencedColumn === "id" ? referenceAliases(referencedTable) : [referencedStem];
  for (const alias of aliases) {
    if (stem === alias) return "";
    if (stem.endsWith(`_${alias}`)) return stem.slice(0, -(alias.length + 1)).replace(/_by$/, "");
    if (stem.startsWith(`${alias}_`)) return stem.slice(alias.length + 1).replace(/^by_/, "");
  }
  return stem.replace(/_by$/, "");
}

function applyForeignKeyNames(mappings, foreignKeys) {
  const byLegacy = new Map(mappings.map((table) => [table.legacy, table]));
  const nodes = new Map();
  const parent = new Map();
  const roleReferences = [];
  for (const table of mappings) {
    for (const column of table.columns) {
      const key = `${table.legacy}.${column.logical}`;
      nodes.set(key, { table, column });
      parent.set(key, key);
    }
  }
  const find = (key) => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(key) !== key) {
      const next = parent.get(key);
      parent.set(key, root);
      key = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot);
  };

  for (const foreignKey of foreignKeys) {
    const table = byLegacy.get(foreignKey.table);
    const referencedTable = byLegacy.get(foreignKey.referencedTable);
    if (!table || !referencedTable) continue;
    foreignKey.localColumns.forEach((localColumnName, index) => {
      const localColumn = table.columns.find((column) => column.logical === localColumnName);
      const referencedColumn = referencedTable.columns.find((column) => column.logical === foreignKey.referencedColumns[index]);
      if (!localColumn || !referencedColumn) return;
      const role = localColumn.logical === "id"
        ? ""
        : referenceRoleOverrides.get(`${table.legacy}.${localColumn.logical}`)
          ?? referenceRole(localColumn.logical, referencedColumn.logical, referencedTable.legacy);
      const localKey = `${table.legacy}.${localColumn.logical}`;
      const referencedKey = `${referencedTable.legacy}.${referencedColumn.logical}`;
      if (role) roleReferences.push({ localKey, referencedKey, role });
      else union(localKey, referencedKey);
    });
  }

  const components = new Map();
  for (const [key, node] of nodes) {
    const values = components.get(find(key)) ?? [];
    values.push(node);
    components.set(find(key), values);
  }
  for (const values of components.values()) {
    const primaryNames = [...new Set(values
      .filter(({ column }) => column.logical === "id")
      .map(({ column }) => column.physical))];
    if (primaryNames.length > 1) {
      throw new Error(`Foreign-key component joins different primary keys: ${primaryNames.join(", ")}`);
    }
    const names = [...new Set(values.map(({ column }) => column.physical))];
    const canonical = primaryNames[0] ?? (names.length === 1 ? names[0] : undefined);
    if (!canonical) {
      throw new Error(`Foreign-key component has no canonical name: ${names.join(", ")}`);
    }
    for (const { column } of values) column.physical = canonical;
  }

  const proposals = new Map();
  for (const { localKey, referencedKey, role } of roleReferences) {
    const proposed = `${nodes.get(referencedKey).column.physical}_${abbreviate(role)}`;
    const values = proposals.get(localKey) ?? new Set();
    values.add(proposed);
    proposals.set(localKey, values);
  }
  for (const [key, values] of proposals) {
    if (values.size !== 1) throw new Error(`Ambiguous foreign key name ${key}: ${[...values].join(", ")}`);
    nodes.get(key).column.physical = [...values][0];
  }

  for (const table of mappings) {
    const duplicates = table.columns.map((column) => column.physical)
      .filter((column, index, values) => values.indexOf(column) !== index);
    if (duplicates.length > 0) throw new Error(`Duplicate physical columns after foreign-key alignment in ${table.legacy}: ${duplicates.join(", ")}`);
  }
  return mappings;
}

function attachPreviousPhysical(mappings) {
  for (const table of mappings) {
    const existingTable = existingByLegacy.get(table.legacy);
    const previousTable = existingTable?.previousPhysical !== table.physical
      ? existingTable?.previousPhysical
      : existingTable?.physical !== table.physical ? existingTable?.physical : undefined;
    if (previousTable) table.previousPhysical = previousTable;
    for (const column of table.columns) {
      const existingColumn = existingTable?.columns.find((candidate) => candidate.logical === column.logical);
      const previousColumn = existingColumn?.previousPhysical !== column.physical
        ? existingColumn?.previousPhysical
        : existingColumn?.physical !== column.physical ? existingColumn?.physical : undefined;
      if (previousColumn) column.previousPhysical = previousColumn;
    }
  }
  return mappings;
}

function migration(mappings, oracle = false) {
  const lines = [
    "-- Generated by scripts/generate-rhn-physical-schema.mjs. Do not edit manually.",
    "-- Application mappings use the RHN physical identifiers directly.",
    "",
  ];
  for (const table of mappings) {
    lines.push(`alter table ${table.legacy} rename to ${table.physical};`);
  }
  if (oracle) {
    lines.push("");
    for (const [index] of oracleDescendingIndexes) lines.push(`drop index ${index};`);
  }
  lines.push("");
  for (const table of mappings) {
    for (const column of table.columns) {
      if (column.logical.toUpperCase() === column.physical) continue;
      lines.push(`alter table ${table.physical} rename column ${column.logical} to ${column.physical};`);
    }
  }
  if (oracle) {
    const byLegacy = new Map(mappings.map((table) => [table.legacy, table]));
    for (const [logicalTable, logicalColumn, physicalColumn] of oracleAdapterColumns) {
      const table = byLegacy.get(logicalTable);
      if (!table) throw new Error(`Unknown Oracle adapter table: ${logicalTable}`);
      lines.push(`alter table ${table.physical} rename column ${logicalColumn} to ${physicalColumn};`);
    }
    lines.push("");
    for (const [index, logicalTable, columns] of oracleDescendingIndexes) {
      const table = byLegacy.get(logicalTable);
      const physicalColumns = columns.map(([logicalColumn, direction]) => {
        const column = table.columns.find((candidate) => candidate.logical === logicalColumn);
        if (!column) throw new Error(`Unknown indexed column: ${logicalTable}.${logicalColumn}`);
        return `${column.physical}${direction ? ` ${direction}` : ""}`;
      });
      lines.push(`create index ${index} on ${table.physical} (${physicalColumns.join(", ")});`);
    }
  }
  lines.push("");
  for (const table of mappings) {
    lines.push(`comment on table ${table.physical} is '${sqlLiteral(table.comment)}';`);
    for (const column of table.columns) {
      lines.push(`comment on column ${table.physical}.${column.physical} is '${sqlLiteral(column.comment)}';`);
    }
  }
  if (oracle) {
    const byLegacy = new Map(mappings.map((table) => [table.legacy, table]));
    for (const [logicalTable, , physicalColumn] of oracleAdapterColumns) {
      lines.push(`comment on column ${byLegacy.get(logicalTable).physical}.${physicalColumn} is 'Oracle 条件唯一约束适配键';`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function catalog(mappings) {
  const lines = [
    "# RHN 物理表命名映射",
    "",
    "> 本文件由 `scripts/generate-rhn-physical-schema.mjs` 生成。逻辑实体保持稳定，物理表采用 `RHN_<DOMAIN>_<ENTITY_ABBR>`。",
    "",
    "| 领域 | 规范逻辑名 | 中文说明 | 旧物理表名 | RHN 物理表名 | 字段数 |",
    "|---|---|---|---|---|---:|",
  ];
  for (const table of mappings) {
    lines.push(`| ${table.domain} | \`${table.logical}\` | ${table.comment} | \`${table.legacy}\` | \`${table.physical}\` | ${table.columns.length} |`);
  }
  lines.push("", `合计：${mappings.length} 张表。`, "");
  lines.push(
    "## Oracle 适配器技术列",
    "",
    "以下虚拟列仅用于 Oracle 模拟带条件的唯一约束，不属于跨数据库业务字段口径：",
    "",
    "| 物理表名 | 原技术列名 | RHN 物理字段名 |",
    "|---|---|---|",
  );
  const byLegacy = new Map(mappings.map((table) => [table.legacy, table]));
  for (const [logicalTable, logicalColumn, physicalColumn] of oracleAdapterColumns) {
    lines.push(`| \`${byLegacy.get(logicalTable).physical}\` | \`${logicalColumn}\` | \`${physicalColumn}\` |`);
  }
  lines.push("");
  return lines.join("\n");
}

const genericSql = sqlFiles(genericDir);
const tables = collectSchema(genericSql);
const mappings = attachPreviousPhysical(
  applyForeignKeyNames(buildMappings(tables), collectForeignKeys(genericSql))
);
fs.writeFileSync(genericOutput, migration(mappings), "utf8");
fs.writeFileSync(oracleOutput, migration(mappings, true), "utf8");
fs.writeFileSync(catalogOutput, catalog(mappings), "utf8");
fs.writeFileSync(mappingOutput, `${JSON.stringify(mappings, null, 2)}\n`, "utf8");
console.log(`Generated RHN physical schema for ${mappings.length} tables.`);
