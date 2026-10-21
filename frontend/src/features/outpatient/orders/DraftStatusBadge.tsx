import { createContext, useContext } from 'react'
import { StatusBadge } from '../../../shared/ui'

/** Simple ordering issues drafts on save, so the draft status reads "待保存" there instead of "待确认". */
export const DraftStatusLabelContext = createContext('待确认')

export function DraftStatusBadge() {
  return <StatusBadge tone="warning">{useContext(DraftStatusLabelContext)}</StatusBadge>
}
