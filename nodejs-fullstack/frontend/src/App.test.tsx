// @vitest-environment happy-dom
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

vi.mock('./utils/playSuccessSound', () => ({ playSuccessSound: vi.fn() }))

interface PendingRequest {
  url: string
  options?: RequestInit
  resolve: (response: Response) => void
}

let container: HTMLDivElement
let root: Root
let pending: PendingRequest[]

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button'))
    .find(element => element.textContent?.includes(label))
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

async function reply(request: PendingRequest, body: unknown, status = 200) {
  await act(async () => {
    request.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }))
  })
}

async function mount() {
  await act(async () => { root.render(<StrictMode><App /></StrictMode>) })
}

async function ready() {
  await mount()
  await reply(pending[0], { numbers: [3, 5, 4, 1], gameId: 'saved-game' })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  pending = []
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/api/games')) {
      return Promise.resolve(new Response(JSON.stringify({ games: [], hasMore: false, nextCursor: null })))
    }
    return new Promise<Response>(resolve => { pending.push({ url, options, resolve }) })
  }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

test('initialization resumes using GET even with Strict Mode enabled', async () => {
  await mount()
  expect(pending).toHaveLength(1)
  expect(pending.every(request => request.url.endsWith('/api/puzzle') && request.options?.method === 'GET')).toBe(true)
  expect(button('New Game').disabled).toBe(true)
})

test('an initialization response received after unmount is ignored', async () => {
  await mount()
  await act(async () => { root.unmount() })
  await reply(pending[0], { numbers: [9, 9, 9, 9], gameId: 'obsolete-game' })
  expect(container.textContent).toBe('')
  root = createRoot(container)
})

test('New Game uses POST and blocks repeated clicks and keyboard shortcuts while pending', async () => {
  await ready()
  await act(async () => { button('New Game').click() })
  expect(pending[1].options?.method).toBe('POST')
  await act(async () => {
    button('New Game').click()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }))
  })
  expect(pending).toHaveLength(2)
  await reply(pending[1], { numbers: [2, 3, 4, 5], gameId: 'new-game' })
  expect(button('New Game').disabled).toBe(false)
})

test('checking an answer includes the saved game ID and blocks puzzle replacement until completion', async () => {
  await ready()
  await act(async () => { button('Check Answer').click() })
  expect(JSON.parse(String(pending[1].options?.body)).gameId).toBe('saved-game')
  await act(async () => {
    button('New Game').click()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }))
  })
  expect(pending).toHaveLength(2)
  await reply(pending[1], { valid: true, message: 'Correct!' })
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Correct!')
  await act(async () => { button('New Game').click() })
  await reply(pending[2], { numbers: [2, 3, 4, 5], gameId: 'new-game' })
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Use all four numbers to make 24.')
  expect(button('Got it!').disabled).toBe(false)
})

test('server validation messages are preserved and controls recover after an error', async () => {
  await ready()
  await act(async () => { button('Check Answer').click() })
  await reply(pending[1], { valid: false, message: 'This game is not in progress.' }, 400)
  expect(container.querySelector('[role="status"]')?.textContent).toBe('This game is not in progress.')
  expect(button('New Game').disabled).toBe(false)
})
