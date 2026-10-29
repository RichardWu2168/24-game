import { expect, test } from 'vitest'
import { formatDuration, formatTime } from './formatTime'

test('durations use minutes and whole seconds, with a dash for null', () => {
  expect(formatDuration(null)).toBe('—')
  expect(formatDuration(0)).toBe('00:00')
  expect(formatDuration(18)).toBe('00:18')
  expect(formatDuration(155)).toBe('02:35')
  expect(formatDuration(59)).toBe('00:59')
  expect(formatDuration(60)).toBe('01:00')
  expect(formatTime(18.125)).toBe('00:18')
})
