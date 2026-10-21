import { waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** 收费页不再默认载入患者：测试中模拟收费员双击待收费队列的某一行（默认第一行）。 */
export async function openQueuePatient(index = 0) {
  const row = await waitFor(() => {
    const rows = document.querySelectorAll<HTMLElement>('.billing-queue-list > button')
    if (!rows[index]) throw new Error('待收费队列尚未加载')
    return rows[index]
  })
  await userEvent.dblClick(row)
}
