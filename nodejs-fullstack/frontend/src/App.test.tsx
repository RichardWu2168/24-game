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
  vi.useRealTimers()
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

test('card and operator components build an expression and submit normalized arithmetic', async () => {
  await ready()
  const card = (number: string) => {
    const found = Array.from(container.querySelectorAll<HTMLElement>('.playing-card'))
      .find(element => element.querySelector('.card-number')?.textContent === number)
    if (!found) throw new Error(`Missing card ${number}`)
    return found
  }
  for (const click of [() => card('3').click(), () => button('+').click(), () => card('5').click(),
    () => button('×').click(), () => card('4').click(), () => button('+').click(), () => card('1').click()]) {
    await act(async () => { click() })
  }
  expect(container.querySelector<HTMLInputElement>('#expression')?.value).toBe('3 + 5 × 4 + 1')
  await act(async () => { button('Check Answer').click() })
  expect(JSON.parse(String(pending[1].options?.body))).toEqual({
    gameId: 'saved-game', numbers: [3, 5, 4, 1], expression: '3 + 5 * 4 + 1',
  })
  await reply(pending[1], { valid: true, message: 'Correct!' })
})

test('the expression editor enforces card counts and supports backspace and clear', async () => {
  await ready()
  const firstCard = container.querySelector<HTMLElement>('.playing-card')!
  await act(async () => { firstCard.click() })
  await act(async () => { firstCard.click() })
  expect(container.querySelector<HTMLInputElement>('#expression')?.value).toBe('3')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('already been used')
  await act(async () => { button('⌫').click() })
  expect(container.querySelector<HTMLInputElement>('#expression')?.value).toBe('')
  await act(async () => { firstCard.click() })
  await act(async () => { button('Clear').click() })
  expect(container.querySelector<HTMLInputElement>('#expression')?.value).toBe('')
})

test('the timer starts after loading, stops at Got it, and resets for a replacement game', async () => {
  vi.useFakeTimers()
  await mount()
  await act(async () => { vi.advanceTimersByTime(3000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:00')
  await reply(pending[0], { numbers: [3, 5, 4, 1], gameId: 'saved-game' })
  await act(async () => { vi.advanceTimersByTime(2000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:02')
  await act(async () => { button('Got it!').click() })
  await act(async () => { vi.advanceTimersByTime(3000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:02')
  expect(container.querySelector('.timer-label')?.textContent).toBe('Thinking time')
  await act(async () => { button('New Game').click() })
  await reply(pending[1], { numbers: [1, 2, 3, 4], gameId: 'new-game' })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:00')
  await act(async () => { vi.advanceTimersByTime(1000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:01')
})

test('a late history response cannot replace a more recent refresh', async () => {
  const histories: PendingRequest[] = []
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => new Promise<Response>(resolve => {
    if (url.endsWith('/api/games')) histories.push({ url, options, resolve })
    else pending.push({ url, options, resolve })
  })))
  await ready()
  expect(histories).toHaveLength(2)
  const game = { id: 'recent', numbers: [3, 5, 4, 1], status: 'IN_PROGRESS', attemptCount: 0, createdAt: '2026-10-28T12:00:00Z', completedAt: null }
  await reply(histories[1], { games: [game], hasMore: false, nextCursor: null })
  await reply(histories[0], { games: [], hasMore: false, nextCursor: null })
  expect(container.querySelectorAll('.history-table tbody tr')).toHaveLength(1)
  expect(container.querySelector('.history-table')?.textContent).toContain('3, 5, 4, 1')
})
