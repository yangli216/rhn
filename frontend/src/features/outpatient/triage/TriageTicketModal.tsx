import { useRef } from 'react'
import type { TriageRecord } from '../../../shared/api/outpatientTriageApi'
import { Button, Dialog, Icon } from '../../../shared/ui'
import { TRIAGE_LEVEL_DEFINITIONS } from './triageAssessmentRules'

export interface TriageTicketModalProps {
  open: boolean
  record: TriageRecord | null
  hospitalName?: string
  onClose: () => void
}

export function TriageTicketModal({
  open,
  record,
  hospitalName = '区域健康医疗协同平台中心医院',
  onClose,
}: TriageTicketModalProps) {
  const printRef = useRef<HTMLDivElement>(null)

  if (!open || !record) return null

  const levelInfo = TRIAGE_LEVEL_DEFINITIONS[record.triageLevel] || TRIAGE_LEVEL_DEFINITIONS.LEVEL_4_NON_URGENT

  const handlePrint = () => {
    window.print()
  }

  const formatDateTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(iso))
    } catch {
      return iso
    }
  }

  return (
    <Dialog
      title="预检分诊凭条预览与打印"
      onClose={onClose}
      className="triage-ticket-dialog"
      footer={
        <div className="triage-ticket-dialog__footer">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            <Icon name="print" />
            <span>打印分诊小票</span>
          </Button>
        </div>
      }
    >
      <div className="triage-ticket-wrapper">
        <div ref={printRef} className="triage-ticket-paper" id="triage-ticket-printable">
          {/* 凭条头部 */}
          <div className="triage-ticket-header">
            <h3 className="triage-ticket-org">{hospitalName}</h3>
            <h2 className="triage-ticket-title">门诊预检分诊凭条</h2>
            <div className="triage-ticket-meta">
              <span>分诊单号：{record.triageNo}</span>
              <span>分诊时间：{formatDateTime(record.triageTime)}</span>
            </div>
            {/* 模拟条形码 */}
            <div className="triage-ticket-barcode-box" aria-hidden="true">
              <div className="triage-ticket-barcode-lines" />
              <span className="triage-ticket-barcode-text">*{record.triageNo}*</span>
            </div>
          </div>

          <div className="triage-ticket-divider" />

          {/* 患者基本信息 */}
          <div className="triage-ticket-section">
            <div className="triage-ticket-grid">
              <div className="triage-ticket-row">
                <span className="triage-ticket-label">患者姓名：</span>
                <strong className="triage-ticket-value triage-ticket-value--name">{record.patientName}</strong>
              </div>
              <div className="triage-ticket-row">
                <span className="triage-ticket-label">性　　别：</span>
                <span className="triage-ticket-value">{record.gender === 'MALE' ? '男' : (record.gender === 'FEMALE' ? '女' : record.gender)}</span>
              </div>
              <div className="triage-ticket-row">
                <span className="triage-ticket-label">年　　龄：</span>
                <span className="triage-ticket-value">{record.age != null ? `${record.age} 岁` : '未记录'}</span>
              </div>
              <div className="triage-ticket-row">
                <span className="triage-ticket-label">联系电话：</span>
                <span className="triage-ticket-value">{record.phone || '未登记'}</span>
              </div>
              {record.healthRecordNo && (
                <div className="triage-ticket-row triage-ticket-row--full">
                  <span className="triage-ticket-label">健康档案：</span>
                  <span className="triage-ticket-value">{record.healthRecordNo}</span>
                </div>
              )}
              {record.idCardNo && (
                <div className="triage-ticket-row triage-ticket-row--full">
                  <span className="triage-ticket-label">身份证号：</span>
                  <span className="triage-ticket-value">{record.idCardNo}</span>
                </div>
              )}
            </div>
          </div>

          <div className="triage-ticket-divider" />

          {/* 分诊定级核心图章 */}
          <div className={`triage-ticket-level-banner triage-ticket-level-banner--${levelInfo.colorName}`}>
            <div className="triage-ticket-level-badge">
              <span className="triage-ticket-level-code">{levelInfo.codeName}</span>
              <span className="triage-ticket-level-name">{levelInfo.label}</span>
            </div>
            <div className="triage-ticket-level-desc">
              <p className="triage-ticket-level-time">
                目标响应时间：<strong>{levelInfo.targetResponseMinutes === 0 ? '即刻进入抢救' : `${levelInfo.targetResponseMinutes} 分钟内接诊`}</strong>
              </p>
              <p className="triage-ticket-level-hint">{levelInfo.actionAdvice}</p>
            </div>
          </div>

          {/* 绿色通道标注 */}
          {record.greenChannel && record.greenChannel !== 'NONE' && (
            <div className="triage-ticket-green-channel">
              <Icon name="emergency" />
              <span>
                ★ 绿色通道：
                {record.greenChannel === 'CHEST_PAIN' && '胸痛中心急救绿色通道'}
                {record.greenChannel === 'STROKE' && '脑卒中中心急救绿色通道'}
                {record.greenChannel === 'TRAUMA' && '严重创伤救治绿色通道'}
                {record.greenChannel === 'HIGH_RISK_MATERNAL' && '高危孕产妇绿色通道'}
                {record.greenChannel === 'CRITICAL_CHILD' && '危重儿童绿色通道'}
                {record.greenChannel === 'MILITARY_PRIORITY' && '军人/退役军人优抚优先通道'}
                {record.greenChannel === 'ELDERLY' && '高龄失能老人爱心通道'}
                ★
              </span>
            </div>
          )}

          {/* 生命体征快照 */}
          <div className="triage-ticket-section">
            <h4 className="triage-ticket-section-title">生命体征采集记录</h4>
            <div className="triage-ticket-vitals-grid">
              <div className="triage-ticket-vital-item">
                <span className="triage-ticket-vital-label">体温(T)</span>
                <span className={`triage-ticket-vital-val ${(record.temperature || 0) >= 37.3 ? 'triage-ticket-vital-val--warning' : ''}`}>
                  {record.temperature != null ? `${record.temperature} ℃` : '--'}
                </span>
              </div>
              <div className="triage-ticket-vital-item">
                <span className="triage-ticket-vital-label">脉搏(P)</span>
                <span className="triage-ticket-vital-val">
                  {record.pulseRate != null ? `${record.pulseRate} 次/分` : '--'}
                </span>
              </div>
              <div className="triage-ticket-vital-item">
                <span className="triage-ticket-vital-label">呼吸(R)</span>
                <span className="triage-ticket-vital-val">
                  {record.respiratoryRate != null ? `${record.respiratoryRate} 次/分` : '--'}
                </span>
              </div>
              <div className="triage-ticket-vital-item">
                <span className="triage-ticket-vital-label">血压(BP)</span>
                <span className={`triage-ticket-vital-val ${(record.systolic || 0) >= 180 ? 'triage-ticket-vital-val--danger' : ''}`}>
                  {record.systolic != null && record.diastolic != null ? `${record.systolic}/${record.diastolic} mmHg` : '--'}
                </span>
              </div>
              <div className="triage-ticket-vital-item">
                <span className="triage-ticket-vital-label">血氧(SpO2)</span>
                <span className={`triage-ticket-vital-val ${(record.oxygenSaturation || 100) < 93 ? 'triage-ticket-vital-val--danger' : ''}`}>
                  {record.oxygenSaturation != null ? `${record.oxygenSaturation} %` : '--'}
                </span>
              </div>
              <div className="triage-ticket-vital-item">
                <span className="triage-ticket-vital-label">血糖(Glu)</span>
                <span className="triage-ticket-vital-val">
                  {record.bloodGlucose != null ? `${record.bloodGlucose} mmol/L` : '--'}
                </span>
              </div>
              <div className="triage-ticket-vital-item">
                <span className="triage-ticket-vital-label">意识(AVPU)</span>
                <span className="triage-ticket-vital-val">
                  {record.consciousness === 'ALERT' ? '清醒' : (record.consciousness === 'VOICE' ? '对声音有反应' : (record.consciousness === 'PAIN' ? '对疼痛有反应' : '无反应/昏迷'))}
                </span>
              </div>
              <div className="triage-ticket-vital-item">
                <span className="triage-ticket-vital-label">疼痛评分</span>
                <span className="triage-ticket-vital-val">
                  {record.painScore != null ? `${record.painScore} 分 (NRS)` : '--'}
                </span>
              </div>
            </div>
          </div>

          <div className="triage-ticket-divider" />

          {/* 主诉与推荐科室 */}
          <div className="triage-ticket-section">
            {record.chiefComplaint && (
              <div className="triage-ticket-text-block">
                <span className="triage-ticket-label">主诉问诊：</span>
                <span className="triage-ticket-text">{record.chiefComplaint}</span>
              </div>
            )}
            <div className="triage-ticket-dept-highlight">
              <span className="triage-ticket-dept-label">推荐就诊科室：</span>
              <strong className="triage-ticket-dept-name">{record.targetDepartmentName || '全科医疗科'}</strong>
              {record.targetDoctorName && (
                <span className="triage-ticket-doctor-name">（指定医生：{record.targetDoctorName}）</span>
              )}
            </div>
            {record.triageReason && (
              <div className="triage-ticket-text-block triage-ticket-text-block--subtle">
                <span className="triage-ticket-label">分诊评估依据：</span>
                <span className="triage-ticket-text">{record.triageReason}</span>
              </div>
            )}
          </div>

          <div className="triage-ticket-divider" />

          {/* 护士签名与就医指引 */}
          <div className="triage-ticket-footer">
            <div className="triage-ticket-footer-meta">
              <span>分诊台护士：{record.triageNurseName || '预检分诊护士'}</span>
              <span>打印流水：{record.id.slice(-6)}</span>
            </div>
            <div className="triage-ticket-notice">
              <p>【就医须知】</p>
              <p>1. 未挂号患者请持本凭条至门诊窗口或自助机办理挂号，或按现场护士指引办理。</p>
              <p>2. 候诊期间如突发胸痛加剧、严重呼吸困难、大汗、头晕肢体无力等危象，请立刻告知分诊台护士！</p>
              <p>3. Ⅰ/Ⅱ级危急重症患者享受绿色通道，医护团队将全程陪护协助救治。</p>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
