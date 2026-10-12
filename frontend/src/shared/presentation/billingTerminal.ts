// Terminal scene records the entry point; terminalCode identifies the specific device.
export const billingTerminalText: Record<string, string> = {
  CASHIER: '收费处', DOCTOR_STATION: '医生站', SELF_SERVICE: '自助机', MOBILE: '线上 App', ONLINE: '线上缴费',
}
export function billingTerminalLabel(scene?: string) { return scene ? billingTerminalText[scene] ?? scene : '来源未记录' }
