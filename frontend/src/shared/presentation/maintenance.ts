export const maintenanceModuleLabels: Record<string, string> = {
  OUTPATIENT: '门诊', BILLING: '收费', PHARMACY: '药房', CONFIGURATION: '基础配置', MASTER_DATA: '机构目录',
}
export const maintenanceStatusLabels: Record<string, string> = {
  QUEUED: '等待执行', PREPARING: '隔离与备份', RUNNING: '处理业务数据', VERIFYING: '核验派生数据',
  SUCCEEDED: '已完成', FAILED: '失败', CANCELLED: '已取消',
}
export const maintenanceOperationLabels: Record<string, string> = {
  INITIALIZE: '基础配置补齐', IMPORT_CATALOG: '机构目录导入', CLEAN_TEST: '测试批次清理', RESET_PRELIVE: '上线前业务重置',
}
export const maintenanceLifecycleLabels: Record<string, string> = { UNKNOWN: '未确认', PRELIVE: '上线前', LIVE: '已正式上线' }

export const maintenanceIssueGuidance: Record<string, string> = {
  MAINTENANCE_DEPENDENT_MODULE_REQUIRED: '核对关联模块并显式勾选后重新预览；已勾选仍阻断时，请核对关联记录是否属于本次范围。',
  MAINTENANCE_OUTPATIENT_RESET_REQUIRED: '请将门诊模块纳入本次清理后重新预览。',
  MAINTENANCE_CROSS_SCOPE_REFERENCE: '核对关联业务所属机构和就诊，调整为完整且已授权的范围后重新预览。',
  MAINTENANCE_PHARMACY_ORGANIZATION_REQUIRED: '请将发药库房所属机构明确纳入维护范围，并确认该机构的操作权限。',
  MAINTENANCE_UNREGISTERED_BUSINESS_REFERENCE: '当前清理能力尚未覆盖这项关联业务。请联系对应领域维护人员核对接入范围。',
  MAINTENANCE_DEPENDENCY_UNSUPPORTED: '请联系对应领域维护人员核对关联数据及清理能力。',
  MAINTENANCE_EXTERNAL_PAYMENT_BLOCKED: '请通过原支付或退费流程核对并处理。',
  MAINTENANCE_EXTERNAL_INSURANCE_BLOCKED: '请通过原医保业务流程核对并处理。',
  MAINTENANCE_EXTERNAL_RECEIPT_BLOCKED: '请通过原财政票据流程核对并处理。',
  MAINTENANCE_CLOSED_FINANCIAL_FACTS: '请通过原结账或对账流程核对并处理。',
}
