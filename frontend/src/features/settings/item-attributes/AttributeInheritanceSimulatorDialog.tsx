import { useState } from 'react'
import type { ItemAttributeDefinitionConfiguration } from '../../../shared/rhnApi'
import {
  Alert,
  Button,
  Dialog,
  FormField,
  Icon,
  StatusBadge,
} from '../../../shared/ui'
import {
  simulateAttributeResolution,
  type ScopeValueInput,
} from './attributeInheritanceSimulator'
import {
  contextHint,
  contextLabel,
  dataTypeLabel,
  variabilityHint,
  variabilityLabel,
} from './attributeConfigurationUtils'

export function AttributeInheritanceSimulatorDialog({
  definition,
  onClose,
}: {
  definition: ItemAttributeDefinitionConfiguration
  onClose: () => void
}) {
  const [inputs, setInputs] = useState<ScopeValueInput>({
    departmentValue: '',
    departmentExplicitNull: false,
    organizationValue: '',
    organizationExplicitNull: false,
    tenantBaseValue: '',
    tenantExplicitNull: false,
    typeDefaultValue: '',
  })

  const simulation = simulateAttributeResolution(definition, inputs)

  const handleInputChange = (key: keyof ScopeValueInput, val: any) => {
    setInputs((prev) => ({ ...prev, [key]: val }))
  }

  return (
    <Dialog
      title={`${definition.name} · 多级继承穿透模拟器`}
      eyebrow="运维与实施工具 · 继承链深度分析"
      size="xwide"
      description={`模拟属性在不同层级维护时的穿透解析逻辑。当前属性【${variabilityLabel(definition.variability)}】，上下文依据【${contextLabel(definition.contextBasis)}】。`}
      onClose={onClose}
    >
      <div className="inheritance-simulator-modal-content">
        {/* 顶部规则摘要 */}
        <div className="inheritance-simulator-summary">
          <div className="sim-rule-chip">
            <span className="sim-rule-chip__label">数据类型</span>
            <strong>{dataTypeLabel(definition.dataType)} ({definition.cardinality === 'MULTIPLE' ? '多值' : '单值'})</strong>
          </div>
          <div className="sim-rule-chip">
            <span className="sim-rule-chip__label">可变性策略</span>
            <strong>{variabilityLabel(definition.variability)}</strong>
            <small>{variabilityHint(definition.variability)}</small>
          </div>
          <div className="sim-rule-chip">
            <span className="sim-rule-chip__label">动态解析依据</span>
            <strong>{contextLabel(definition.contextBasis)}</strong>
            <small>{contextHint(definition.contextBasis)}</small>
          </div>
        </div>

        {/* 模拟输入表单 */}
        <div className="inheritance-simulator-grid">
          <div className="inheritance-simulator-inputs-card">
            <h4>1. 设置模拟输入值</h4>
            <p>自由调整各层级配置，观察右侧继承阶梯与最终命中节点的实时变化：</p>

            <div className="sim-input-rows">
              {/* 科室 */}
              <div className="sim-input-row">
                <FormField
                  label="科室级覆盖值"
                  hint={
                    !definition.allowedScopes.includes('DEPARTMENT') || definition.variability === 'BASE_ONLY'
                      ? '当前属性规则禁止科室覆盖'
                      : '若留空则自动穿透至上级机构'
                  }
                >
                  <input
                    value={inputs.departmentValue}
                    disabled={
                      !definition.allowedScopes.includes('DEPARTMENT') ||
                      definition.variability === 'BASE_ONLY' ||
                      inputs.departmentExplicitNull
                    }
                    placeholder="输入科室个性化值…"
                    onChange={(e) => handleInputChange('departmentValue', e.target.value)}
                  />
                </FormField>
                {definition.allowedScopes.includes('DEPARTMENT') && definition.variability !== 'BASE_ONLY' && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={inputs.departmentExplicitNull}
                      onChange={(e) => handleInputChange('departmentExplicitNull', e.target.checked)}
                    />
                    <span>显式置空 (null)</span>
                  </label>
                )}
              </div>

              {/* 机构 */}
              <div className="sim-input-row">
                <FormField
                  label="机构级覆盖值"
                  hint={
                    !definition.allowedScopes.includes('ORGANIZATION') || definition.variability === 'BASE_ONLY'
                      ? '当前属性规则禁止机构覆盖'
                      : '若留空则自动穿透至租户基线'
                  }
                >
                  <input
                    value={inputs.organizationValue}
                    disabled={
                      !definition.allowedScopes.includes('ORGANIZATION') ||
                      definition.variability === 'BASE_ONLY' ||
                      inputs.organizationExplicitNull
                    }
                    placeholder="输入机构个性化值…"
                    onChange={(e) => handleInputChange('organizationValue', e.target.value)}
                  />
                </FormField>
                {definition.allowedScopes.includes('ORGANIZATION') && definition.variability !== 'BASE_ONLY' && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={inputs.organizationExplicitNull}
                      onChange={(e) => handleInputChange('organizationExplicitNull', e.target.checked)}
                    />
                    <span>显式置空 (null)</span>
                  </label>
                )}
              </div>

              {/* 租户公共基线 */}
              <div className="sim-input-row">
                <FormField
                  label="租户公共基线值"
                  hint={definition.variability === 'LOCAL_ONLY' ? '必须本地配置，禁止租户基线' : '全租户统一默认基线'}
                >
                  <input
                    value={inputs.tenantBaseValue}
                    disabled={definition.variability === 'LOCAL_ONLY' || inputs.tenantExplicitNull}
                    placeholder="输入租户公共值…"
                    onChange={(e) => handleInputChange('tenantBaseValue', e.target.value)}
                  />
                </FormField>
                {definition.variability !== 'LOCAL_ONLY' && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={inputs.tenantExplicitNull}
                      onChange={(e) => handleInputChange('tenantExplicitNull', e.target.checked)}
                    />
                    <span>显式置空 (null)</span>
                  </label>
                )}
              </div>

              {/* 类型默认值 */}
              <div className="sim-input-row">
                <FormField label="项目类型默认值" hint="装配到项目类型时绑定的默认值">
                  <input
                    value={inputs.typeDefaultValue}
                    placeholder="输入项目类型默认值…"
                    onChange={(e) => handleInputChange('typeDefaultValue', e.target.value)}
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* 右侧：继承链阶梯与最终命中卡片 */}
          <div className="inheritance-simulator-steps-card">
            <h4>2. 继承链阶梯与穿透解析结果</h4>

            <div className="sim-result-box">
              <span className="sim-result-label">最终命中生效层级</span>
              <div className="sim-result-badge-wrap">
                <StatusBadge tone="success" className="sim-winning-badge">
                  <Icon name="check" />
                  {simulation.sourceLevelName}
                </StatusBadge>
              </div>
              <div className="sim-result-value-wrap">
                <span className="value-label">生效值：</span>
                <code className="value-code">
                  {simulation.effectiveValue === null
                    ? 'null (显式空值)'
                    : simulation.effectiveValue === undefined
                      ? 'undefined (未维护)'
                      : String(simulation.effectiveValue)}
                </code>
              </div>
              <p className="sim-explanation-text">{simulation.explanation}</p>
            </div>

            <div className="sim-steps-ladder">
              {simulation.steps.map((step, index) => (
                <div
                  key={step.level}
                  className={`sim-ladder-node ${step.isEffective ? 'is-effective' : ''} ${!step.allowed ? 'is-disallowed' : ''}`}
                >
                  <div className="sim-ladder-node__idx">{index + 1}</div>
                  <div className="sim-ladder-node__body">
                    <div className="node-head">
                      <strong>{step.levelName}</strong>
                      {step.isEffective ? (
                        <StatusBadge tone="success">当前生效</StatusBadge>
                      ) : !step.allowed ? (
                        <StatusBadge tone="neutral">禁止覆盖</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">{step.statusText}</StatusBadge>
                      )}
                    </div>
                    <div className="node-value">
                      <span>配置值：</span>
                      <code>{step.configuredValue || '未配置'}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ui-form-actions">
          <Button variant="secondary" onClick={onClose}>
            关闭模拟器
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
