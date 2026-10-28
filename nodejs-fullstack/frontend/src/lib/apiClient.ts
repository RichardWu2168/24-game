import { getSessionId } from './session'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('X-Session-Id', getSessionId())
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  const data = await response.json()
  if (!response.ok) {
    throw new ApiError(response.status, data?.message || data?.error || 'The request failed.')
  }
  return data as T
}
