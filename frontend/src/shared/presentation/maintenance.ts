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
