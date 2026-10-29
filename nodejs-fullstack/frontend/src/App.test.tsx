// @vitest-environment happy-dom
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { playSuccessSound } from './utils/playSuccessSound'

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
  Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: vi.fn(() => false) })
  localStorage.clear()
  pending = []
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/api/games') && options?.method !== 'DELETE') {
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
  vi.restoreAllMocks()
})

test('initialization resumes using GET even with Strict Mode enabled', async () => {
  await mount()
  expect(pending).toHaveLength(1)
  expect(pending.every(request => request.url.endsWith('/api/puzzle') && request.options?.method === 'GET')).toBe(true)
  expect(button('New Game').disabled).toBe(true)
})

test('Clear History sends a delete request immediately without confirmation', async () => {
  await ready()
  const confirm = vi.spyOn(window, 'confirm')
  await act(async () => { button('Clear History').click() })
  expect(confirm).not.toHaveBeenCalled()
  expect(pending[1].options?.method).toBe('DELETE')
  await reply(pending[1], { deletedGames: 0 })
  expect(button('Check Answer').disabled).toBe(false)
})

test('Clear History preserves the active puzzle, expression, timer, and attempts', async () => {
  vi.useFakeTimers()
  let cleared = false
  const currentGame = { id: 'saved-game', numbers: [3, 5, 4, 1], status: 'IN_PROGRESS', attemptCount: 2, createdAt: '2026-10-28T12:00:00Z', completedAt: null }
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/api/games') && options?.method !== 'DELETE') {
      const games = cleared ? [currentGame] : [currentGame, { ...currentGame, id: 'old', status: 'COMPLETED' }]
      return Promise.resolve(new Response(JSON.stringify({ games, hasMore: false, nextCursor: null })))
    }
    if (options?.method === 'DELETE') cleared = true
    return new Promise<Response>(resolve => { pending.push({ url, options, resolve }) })
  }))
  await ready()
  await act(async () => { container.querySelector<HTMLElement>('.playing-card')!.click() })
  await act(async () => { vi.advanceTimersByTime(2000) })
  expect(container.querySelectorAll('.history-table tbody tr')).toHaveLength(2)
  await act(async () => { button('Clear History').click() })
  expect(pending[1].url).toBe('/api/games')
  expect(pending[1].options?.method).toBe('DELETE')
  expect(new Headers(pending[1].options?.headers).get('X-Session-Id')).toBe(localStorage.getItem('24-game-session-id'))
  expect(button('Clearing...').disabled).toBe(true)
  await act(async () => { vi.advanceTimersByTime(3000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:05')
  await reply(pending[1], { deletedGames: 1 })
  expect(button('Check Answer').disabled).toBe(false)
  expect(container.querySelector<HTMLInputElement>('#expression')?.value).toBe('3')
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:05')
  expect(container.querySelectorAll('.history-table tbody tr')).toHaveLength(1)
  expect(container.querySelector('.history-table tbody tr')?.textContent).toContain('In Progress')
  await act(async () => { button('Check Answer').click() })
  expect(JSON.parse(String(pending[2].options?.body)).gameId).toBe('saved-game')
  await reply(pending[2], { valid: false, message: 'Use all four numbers.' })
})

test('a failed history deletion keeps the current game available and shows an error', async () => {
  await ready()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await act(async () => { button('Clear History').click() })
  await reply(pending[1], { message: 'Unexpected error.' }, 500)
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Unable to clear game history. Please try again.')
  expect(button('Check Answer').disabled).toBe(false)
  expect(button('Clear History').disabled).toBe(false)
  log.mockRestore()
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
    gameId: 'saved-game', numbers: [3, 5, 4, 1], expression: '3 + 5 * 4 + 1', durationSeconds: 0,
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
  expect(JSON.parse(String(pending[1].options?.body)).durationSeconds).toBe(2)
  await reply(pending[1], { capturedDurationSeconds: 2 })
  await act(async () => { button('New Game').click() })
  await reply(pending[2], { numbers: [1, 2, 3, 4], gameId: 'new-game' })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:00')
  await act(async () => { vi.advanceTimersByTime(1000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:01')
})

test('background time is captured at Got It and history shows the saved whole-second duration after completion', async () => {
  vi.useFakeTimers()
  const start = Date.parse('2026-10-28T12:00:00Z')
  vi.setSystemTime(start)
  let completed = false
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/api/games')) {
      const game = { id: 'saved-game', numbers: [3, 5, 4, 1], status: completed ? 'COMPLETED' : 'IN_PROGRESS', durationSeconds: completed ? 18 : null, attemptCount: 0, createdAt: new Date(start).toISOString(), completedAt: null }
      return Promise.resolve(new Response(JSON.stringify({ games: [game], hasMore: false, nextCursor: null })))
    }
    return new Promise<Response>(resolve => { pending.push({ url, options, resolve }) })
  }))
  await mount()
  await reply(pending[0], { numbers: [3, 5, 4, 1], gameId: 'saved-game', startedAt: new Date(start).toISOString(), gotItAt: null })
  // Advance wall-clock time without running any interval callbacks, as a
  // suspended background tab would. Visibility restores the displayed time.
  vi.setSystemTime(start + 18_125)
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
  await act(async () => { button('Got it!').click() })
  expect(pending[1].url).toBe('/api/games/saved-game/got-it')
  expect(JSON.parse(String(pending[1].options?.body))).toEqual({ durationSeconds: 18 })
  await reply(pending[1], { capturedDurationSeconds: 18 })
  expect(container.querySelector('.history-table tbody tr')?.children[3].textContent).toBe('—')
  vi.setSystemTime(start + 155_000)
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
  await act(async () => { button('Check Answer').click() })
  completed = true
  await reply(pending[2], { valid: true, message: 'Correct!' })
  expect(container.querySelector('.history-table tbody tr')?.children[3].textContent).toBe('00:18')
})

test('resuming a puzzle restores its original start and recorded Got It time', async () => {
  vi.useFakeTimers()
  const start = Date.now() - 155_000
  await mount()
  await reply(pending[0], { numbers: [3, 5, 4, 1], gameId: 'saved-game', startedAt: new Date(start).toISOString(), gotItAt: new Date(start + 18_000).toISOString(), capturedDurationSeconds: 18 })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
  expect(container.querySelector('.timer-label')?.textContent).toBe('Thinking time')
  expect(button('Got it!').disabled).toBe(true)
  await act(async () => { vi.advanceTimersByTime(60_000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
})

test('a correct Check Answer without Got It stops the timer and displays the saved duration', async () => {
  vi.useFakeTimers()
  const start = Date.now()
  let completed = false
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/api/games')) {
      const game = { id: 'saved-game', numbers: [3, 5, 4, 1], status: completed ? 'COMPLETED' : 'IN_PROGRESS', durationSeconds: completed ? 18 : null, attemptCount: 0, createdAt: new Date(start).toISOString(), completedAt: null }
      return Promise.resolve(new Response(JSON.stringify({ games: [game], hasMore: false, nextCursor: null })))
    }
    return new Promise<Response>(resolve => { pending.push({ url, options, resolve }) })
  }))
  await mount()
  await reply(pending[0], { numbers: [3, 5, 4, 1], gameId: 'saved-game', startedAt: new Date(start).toISOString(), gotItAt: null })
  await act(async () => { vi.advanceTimersByTime(18_999) })
  await act(async () => { button('Check Answer').click() })
  expect(pending[1].url).toBe('/api/check-answer')
  completed = true
  await reply(pending[1], { valid: true, message: 'Correct!' })
  expect(container.querySelector('.history-table tbody tr')?.children[3].textContent).toBe('00:18')
  const frozen = container.querySelector('.timer-value')?.textContent
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe(frozen)
})

test('an audio failure cannot hide a correct answer or keep its timer running', async () => {
  vi.useFakeTimers()
  await ready()
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(playSuccessSound).mockImplementationOnce(() => { throw new Error('Audio unavailable') })
  await act(async () => { button('Check Answer').click() })
  await reply(pending[1], { valid: true, message: 'Correct!' })
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Correct!')
  expect(button('Got it!').disabled).toBe(true)
  const frozen = container.querySelector('.timer-value')?.textContent
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe(frozen)
  expect(warning).toHaveBeenCalled()
})

test('Load More appends older history without duplicates and Refresh starts over', async () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    id: `game-${index + 1}`, numbers: [1, 2, 3, 4], status: 'COMPLETED', durationSeconds: index + 1,
    attemptCount: 1, createdAt: '2026-10-28T12:00:00Z', completedAt: '2026-10-28T12:01:00Z',
  }))
  const histories: string[] = []
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url.startsWith('/api/games')) {
      histories.push(url)
      const next = url.includes('cursor=')
      // Include the last displayed row twice to verify append deduplication.
      return Promise.resolve(new Response(JSON.stringify({ games: next ? rows.slice(19) : rows.slice(0, 20), hasMore: !next, nextCursor: next ? null : 'game-20' })))
    }
    return new Promise<Response>(resolve => { pending.push({ url, options, resolve }) })
  }))
  await ready()
  expect(container.querySelectorAll('.history-table tbody tr')).toHaveLength(20)
  await act(async () => { button('Load More').click() })
  expect(histories.at(-1)).toBe('/api/games?cursor=game-20')
  expect(container.querySelectorAll('.history-table tbody tr')).toHaveLength(25)
  expect(Array.from(container.querySelectorAll('button')).some(element => element.textContent === 'Load More')).toBe(false)
  await act(async () => { button('Refresh History').click() })
  expect(container.querySelectorAll('.history-table tbody tr')).toHaveLength(20)
  expect(button('Load More').disabled).toBe(false)
})

test('a failed next-page request preserves displayed history and permits retry', async () => {
  const row = { id: 'game-1', numbers: [1, 2, 3, 4], status: 'COMPLETED', durationSeconds: 18, attemptCount: 1, createdAt: '2026-10-28T12:00:00Z', completedAt: null }
  const pages: PendingRequest[] = []
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url === '/api/games') return Promise.resolve(new Response(JSON.stringify({ games: [row], hasMore: true, nextCursor: row.id })))
    return new Promise<Response>(resolve => { (url.includes('cursor=') ? pages : pending).push({ url, options, resolve }) })
  }))
  await ready()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await act(async () => { button('Load More').click(); button('Load More').click() })
  expect(pages).toHaveLength(1)
  expect(button('Loading More...').disabled).toBe(true)
  await reply(pages[0], { message: 'Invalid cursor.' }, 400)
  expect(container.querySelectorAll('.history-table tbody tr')).toHaveLength(1)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Refresh History')
  expect(button('Load More').disabled).toBe(false)
  log.mockRestore()
})

test('the UI timer ignores server creation time and sends the same frozen time after showing solutions', async () => {
  vi.useFakeTimers()
  const start = Date.now()
  await mount()
  await reply(pending[0], { numbers: [3, 5, 4, 1], gameId: 'saved-game', startedAt: new Date(start - 600_000).toISOString() })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:00')
  await act(async () => { vi.advanceTimersByTime(18_000) })
  await act(async () => { button('Show Solutions').click() })
  await act(async () => { vi.advanceTimersByTime(29_000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
  await act(async () => { button('Check Answer').click() })
  expect(JSON.parse(String(pending[1].options?.body)).durationSeconds).toBe(18)
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
  await reply(pending[1], { valid: true, message: 'Correct!' })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
})

test('a slow correct-answer response cannot add time to the saved UI duration', async () => {
  vi.useFakeTimers()
  await ready()
  await act(async () => { vi.advanceTimersByTime(18_999) })
  await act(async () => { button('Check Answer').click() })
  expect(JSON.parse(String(pending[1].options?.body)).durationSeconds).toBe(18)
  await act(async () => { vi.advanceTimersByTime(30_000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
  await reply(pending[1], { valid: true, message: 'Correct!' })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
})

test('refreshing resumes the locally stored UI clock without using the server start timestamp', async () => {
  vi.useFakeTimers()
  await ready()
  await act(async () => { vi.advanceTimersByTime(18_000) })
  await act(async () => { root.unmount() })
  root = createRoot(container)
  await mount()
  await reply(pending[1], { numbers: [3, 5, 4, 1], gameId: 'saved-game', startedAt: new Date(Date.now() + 600_000).toISOString() })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:18')
  await act(async () => { vi.advanceTimersByTime(2000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:20')
})

test('a failed Got It save resumes the clock and allows retry', async () => {
  vi.useFakeTimers()
  await ready()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  await act(async () => { vi.advanceTimersByTime(1000) })
  await act(async () => { button('Got it!').click() })
  await reply(pending[1], { message: 'Save failed.' }, 500)
  expect(button('Got it!').disabled).toBe(false)
  await act(async () => { vi.advanceTimersByTime(1000) })
  expect(container.querySelector('.timer-value')?.textContent).toBe('00:02')
  log.mockRestore()
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
