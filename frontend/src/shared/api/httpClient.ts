import type { ApiError } from '../model'

export interface Credentials {
  username: string
  password: string
  tenantId: string
}

export interface WorkContextSelection {
  organizationId: string
  departmentId?: string | null
}

export class ApiClient {
  constructor(private readonly credentials: Credentials | null,
    private readonly tenantId: string,
    private workContext: WorkContextSelection | null = null,
    private readonly clientSessionId = crypto.randomUUID()) {}

  setWorkContext(context: WorkContextSelection | null) {
    this.workContext = context
  }

  withWorkContext(context: WorkContextSelection | null) {
    return new ApiClient(this.credentials, this.tenantId, context, this.clientSessionId)
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const multipart = typeof FormData !== 'undefined' && init?.body instanceof FormData
    const response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
        ...(this.credentials ? { Authorization: `Basic ${encodeBasicCredentials(this.credentials)}` } : {}),
        'X-Tenant-Id': this.tenantId,
        'X-Correlation-Id': crypto.randomUUID(),
        'X-Client-Session-Id': this.clientSessionId,
        ...(this.workContext ? {
          'X-Organization-Id': this.workContext.organizationId,
          ...(this.workContext.departmentId ? { 'X-Department-Id': this.workContext.departmentId } : {}),
        } : {}),
        ...init?.headers,
      },
    })
    if (!response.ok) throw await this.readError(response)
    if (response.status === 204) return undefined as T
    const body = await response.text()
    if (!body.trim()) return undefined as T
    return JSON.parse(body) as T
  }

  async download(path: string): Promise<Blob> {
    const response = await fetch(path, {
      credentials: 'include',
      headers: {
        ...(this.credentials ? { Authorization: `Basic ${encodeBasicCredentials(this.credentials)}` } : {}),
        'X-Tenant-Id': this.tenantId,
        'X-Correlation-Id': crypto.randomUUID(),
        'X-Client-Session-Id': this.clientSessionId,
        ...(this.workContext ? {
          'X-Organization-Id': this.workContext.organizationId,
          ...(this.workContext.departmentId ? { 'X-Department-Id': this.workContext.departmentId } : {}),
        } : {}),
      },
    })
    if (!response.ok) throw await this.readError(response)
    return response.blob()
  }

  async eventStream(path: string, signal: AbortSignal, lastEventId?: string): Promise<Response> {
    const response = await fetch(path, {
      signal,
      credentials: 'include',
      headers: {
        Accept: 'text/event-stream',
        ...(this.credentials ? { Authorization: `Basic ${encodeBasicCredentials(this.credentials)}` } : {}),
        'X-Tenant-Id': this.tenantId,
        'X-Correlation-Id': crypto.randomUUID(),
        'X-Client-Session-Id': this.clientSessionId,
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
        ...(this.workContext ? {
          'X-Organization-Id': this.workContext.organizationId,
          ...(this.workContext.departmentId ? { 'X-Department-Id': this.workContext.departmentId } : {}),
        } : {}),
      },
    })
    if (!response.ok) throw await this.readError(response)
    return response
  }

  private async readError(response: Response): Promise<ApiError> {
    try {
      const error = await response.json() as ApiError
      if (error.code === 'SESSION_TERMINATED') window.dispatchEvent(new CustomEvent('rhn:session-terminated'))
      return error
    } catch {
      return {
        code: `HTTP_${response.status}`,
        message: response.statusText || '服务暂时不可用',
        correlationId: response.headers.get('X-Correlation-Id') ?? undefined,
      }
    }
  }
}

function encodeBasicCredentials(credentials: Credentials): string {
  const bytes = new TextEncoder().encode(`${credentials.username}:${credentials.password}`)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

export function errorMessage(error: unknown): string {
  const apiError = error as ApiError
  if (apiError?.violations?.length) {
    return apiError.violations.map((item) => `${item.field}：${item.message}`).join('；')
  }
  const correlation = apiError?.correlationId ? `（关联号：${apiError.correlationId}）` : ''
  return `${apiError?.message || '操作失败，请稍后重试'}${correlation}`
}
