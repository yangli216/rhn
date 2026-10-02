import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceRequest } from '../../../shared/api/encountersApi'
import { ServiceDraftRow } from './OrderDraftRows'
import { ServiceReadRow } from './OrderReadRows'

const draft = { id: 'lab', catalogItemId: 'lab', itemCode: 'LAB', itemName: '血细胞分析',
  serviceType: 'LABORATORY', quantity: 1, clinicalDescription: '评估感染类型及严重程度' }

describe('patient instruction column', () => {
  it.each(['draft', 'saved'])('keeps %s service rationale in execution information, outside patient instructions', (state) => {
    if (state === 'draft') {
      render(<ServiceDraftRow value={draft} onEdit={vi.fn()} onRemove={vi.fn()} />)
    } else {
      render(<ServiceReadRow value={{ ...draft, status: 'ACTIVE' } as ServiceRequest}
        busy={false} readOnly onCancel={vi.fn()} />)
    }
    const description = screen.getByText('临床说明：评估感染类型及严重程度')
    expect(description.closest('.doctor-unified-directions')).not.toBeNull()
    const row = screen.getByRole('row')
    expect(row.children[5]).toHaveTextContent('—')
    expect(row.children[5]).not.toHaveTextContent('评估感染')
  })
})
