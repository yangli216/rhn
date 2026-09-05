import type { ApiClient } from './httpClient'

export type QueueScene = 'OUTPATIENT' | 'PHARMACY' | 'LAB_COLLECTION' | 'EXAMINATION'
export type QueueTicketStatus =
  | 'WAITING'
  | 'CALLED'
  | 'SERVING'
  | 'SUSPENDED'
  | 'MISSED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface ServiceQueue {
  id: string
  revision: number
  organizationId: string
  departmentId: string
  waitingLocationId?: string
  code: string
  name: string
  scene: QueueScene
  ticketPrefix: string
  active: boolean
}

export interface QueueTicket {
  id: string
  revision: number
  serviceQueueId: string
  residentId: string
  encounterId?: string
  sourceType: 'PAT_REG' | 'DISP_TASK' | 'DIAG_TASK'
  sourceId: string
  businessDate: string
  ticketCode: string
  sequenceNo: number
  priority: number
  status: QueueTicketStatus
  checkedInAt: string
  readyAt?: string
  calledAt?: string
  startedAt?: string
  completedAt?: string
  callCount: number
  missedCount: number
  currentLocationId?: string
}

export interface QueueTicketPage {
  content: QueueTicket[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface QueueActionInput {
  commandCode: string
  serviceLocationId?: string
  businessDate?: string
  description?: string
}

export type QueueTicketAction =
  | 'ready'
  | 'call'
  | 'recall'
  | 'miss'
  | 'requeue'
  | 'start'
  | 'suspend'
  | 'resume'
  | 'complete'
  | 'cancel'

export function createQueueingApi(client: ApiClient) {
  return {
    queues: () => client.request<ServiceQueue[]>('/api/queueing/queues'),
    tickets: (params: { queueId: string; businessDate?: string; status?: QueueTicketStatus; page?: number; size?: number }) => {
      const query = new URLSearchParams({ queueId: params.queueId })
      if (params.businessDate) query.set('businessDate', params.businessDate)
      if (params.status) query.set('status', params.status)
      if (params.page !== undefined) query.set('page', String(params.page))
      if (params.size !== undefined) query.set('size', String(params.size))
      return client.request<QueueTicketPage>(`/api/queueing/tickets?${query}`)
    },
    action: (ticketId: string, action: QueueTicketAction, input: QueueActionInput) =>
      client.request<QueueTicket>(`/api/queueing/tickets/${ticketId}/${action}`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    callNext: (queueId: string, input: QueueActionInput) =>
      client.request<QueueTicket>(`/api/queueing/queues/${queueId}/call-next`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  }
}
