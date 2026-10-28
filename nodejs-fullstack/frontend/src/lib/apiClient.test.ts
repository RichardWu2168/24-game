// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { ApiError, requestJson } from './apiClient'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

test('requests reuse the browser session and send JSON headers when needed', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ valid: true }))))
  vi.stubGlobal('fetch', fetchMock)
  await requestJson('/api/puzzle', { method: 'GET' })
  await requestJson('/api/check-answer', { method: 'POST', body: JSON.stringify({ expression: '3+5*4+1' }) })
  const first = fetchMock.mock.calls[0][1] as RequestInit
  const second = fetchMock.mock.calls[1][1] as RequestInit
  const firstHeaders = new Headers(first.headers)
  const secondHeaders = new Headers(second.headers)
  expect(firstHeaders.get('X-Session-Id')).toBeTruthy()
  expect(secondHeaders.get('X-Session-Id')).toBe(firstHeaders.get('X-Session-Id'))
  expect(secondHeaders.get('Content-Type')).toBe('application/json')
})

test('API failures retain the HTTP status and server message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Game not found.' }), { status: 404 })))
  await expect(requestJson('/api/games/missing')).rejects.toMatchObject({ status: 404, message: 'Game not found.' })
})

test('API failures also handle the puzzle endpoint error format', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Missing X-Session-Id header.' }), { status: 400 })))
  try {
    await requestJson('/api/puzzle')
    throw new Error('Expected request failure')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('Missing X-Session-Id header.')
  }
})
