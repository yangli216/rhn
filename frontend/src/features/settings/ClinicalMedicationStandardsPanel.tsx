import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, LoadingState, StatusBadge, TableShell } from '../../shared/ui'
import './clinical-medication-standards.css'

const kinds: Record<string, string> = { TIMES_PER_DAY: '周期次数', INTERVAL: '固定间隔', AS_NEEDED: '按需', ONCE: '单次', SCHEDULED_TIME: '日历安排', OTHER: '其他' }

export function ClinicalMedicationStandardsPanel({ api, organizationId }: { api: RhnApi; organizationId?: string }) {
  const query = useQuery({ queryKey: ['master-data-clinical-medication-standards', organizationId], queryFn: api.masterData.clinicalMedicationStandards })
  if (query.isPending) return <LoadingState label="正在读取用药标准…" />
  if (query.error) return <Alert>{errorMessage(query.error)}</Alert>
  const value = query.data
  return <section className="clinical-medication-standards" aria-label="用药标准体系">
    <header><div><h3>用药标准体系</h3><p>药品来自标准参考目录；给药途径、频次和临床单位共同构成规则输入。</p></div>
      <StatusBadge tone="info">{value.version}</StatusBadge></header>
    <Alert tone="info">默认剂量不代表安全上限。按需、单次和日历用药不推算固定日剂量；包装数量不直接参与临床剂量换算。</Alert>
    <div className="clinical-medication-standards__grid">
      <section><h4>频次标准 · {value.frequencies.length}</h4><p>本院名称与编码可不同，规则使用结构化频次标识。</p>
        <TableShell><table><thead><tr><th>本院频次</th><th>标准语义</th><th>平均给药次数</th></tr></thead>
          <tbody>{value.frequencies.map(f => <tr key={f.id}><td><strong>{f.name}</strong><small>{f.code}</small></td>
            <td>{kinds[f.standard.interpretation.kind] ?? f.standard.interpretation.kind}<small>{f.standard.conceptId ?? '待补充计算语义'}</small></td>
            <td>{f.standard.interpretation.dailyRateComputable
              ? `${f.standard.interpretation.doses} 次 / ${f.standard.interpretation.perDays} 天`
              : '无固定日频率'}</td></tr>)}</tbody></table></TableShell>
      </section>
      <section><h4>给药途径 · {value.routes.length}</h4><p>沿用受控途径概念及来源版本，显示名不作为识别依据。</p>
        <TableShell><table><thead><tr><th>途径</th><th>标准编码</th><th>来源版本</th></tr></thead>
          <tbody>{value.routes.map(r => <tr key={r.id}><td>{r.name}</td><td>{r.code}</td><td>{r.systemCode}<small>{r.systemVersion}</small></td></tr>)}</tbody></table></TableShell>
      </section>
      <section><h4>临床剂量单位 · {value.doseUnits.length}</h4><p>只进行同维度换算；片、粒等须有标准规格定义的含量关系。</p>
        <TableShell><table><thead><tr><th>单位</th><th>维度</th><th>规范换算</th></tr></thead>
          <tbody>{value.doseUnits.map(u => <tr key={u.id}><td>{u.display}<small>{u.code}</small></td>
            <td>{u.dimension === 'MASS' ? '质量' : '体积'}</td><td>1 {u.code} = {u.conversionFactor} {u.canonicalUnit}</td></tr>)}</tbody></table></TableShell>
      </section>
    </div>
  </section>
}
