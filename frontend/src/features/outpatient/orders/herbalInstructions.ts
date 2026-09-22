

export function extractSpecialMethod(instruction?: string): string | undefined {
  if (!instruction) return undefined
  const methods = ['先煎', '后下', '包煎', '冲服', '另煎', '烊化', '另炖', '兑服', '外洗']
  for (const m of methods) {
    if (instruction.includes(m)) return m
  }
  return undefined
}

export function parseHerbalInstruction(instruction?: string): {
  method: string
  specialMethod?: string
  instruction?: string
} {
  if (!instruction) return { method: '水煎服' }
  const parts = instruction.split('；').map((s) => s.trim()).filter(Boolean)
  const specialMethods = ['先煎', '后下', '包煎', '冲服', '另煎', '烊化', '另炖', '兑服', '外洗']
  const baseMethods = ['水煎服', '代煎', '颗粒冲服', '外用煎洗', '另煎兑服']

  let method = '水煎服'
  let specialMethod: string | undefined = undefined
  const otherParts: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (specialMethods.includes(p)) {
      specialMethod = p
    } else if (baseMethods.includes(p) || (i === 0 && !specialMethods.includes(p))) {
      method = p
    } else {
      otherParts.push(p)
    }
  }
  return {
    method,
    specialMethod,
    instruction: otherParts.join('；') || undefined,
  }
}

export function buildHerbalInstruction(method: string, specialMethod?: string, formulaInstruction?: string): string {
  const parts = [method.trim() || '水煎服']
  if (specialMethod?.trim()) {
    parts.push(specialMethod.trim())
  }
  if (formulaInstruction?.trim()) {
    parts.push(formulaInstruction.trim())
  }
  return parts.join('；')
}
