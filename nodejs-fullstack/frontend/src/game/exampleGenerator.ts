import { checkAnswer } from './gameLogic'

// Fisher-Yates shuffle: every ordering is equally likely.
function shuffle<T>(items: T[]): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

export function getRandomExample(cards: number[]): string {
  const operators = ['+', '-', '*', '/']
  const maxAttempts = 100

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Shuffle the four card numbers.
    const numbers = shuffle(cards)

    // Randomly select three operators.
    const ops = Array.from(
      { length: 3 },
      () => operators[Math.floor(Math.random() * operators.length)],
    )

    // Randomly choose one of several expression structures.
    const patterns = [
      `${numbers[0]} ${ops[0]} ${numbers[1]} ${ops[1]} ${numbers[2]} ${ops[2]} ${numbers[3]}`,
      `(${numbers[0]} ${ops[0]} ${numbers[1]}) ${ops[1]} (${numbers[2]} ${ops[2]} ${numbers[3]})`,
      `((${numbers[0]} ${ops[0]} ${numbers[1]}) ${ops[1]} ${numbers[2]}) ${ops[2]} ${numbers[3]}`,
      `${numbers[0]} ${ops[0]} ((${numbers[1]} ${ops[1]} ${numbers[2]}) ${ops[2]} ${numbers[3]})`,
    ]

    const candidate = patterns[Math.floor(Math.random() * patterns.length)]

    const result = checkAnswer(candidate, cards)

    // Accept only a valid expression whose result is not 24.
    if (result.value !== undefined && Math.abs(result.value - 24) >= 1e-9) {
      return candidate.replace(/\*/g, '×').replace(/\//g, '÷')
    }
  }

  // Safe fallback if we cannot find a suitable example.
  return `e.g. ${cards.join(' + ')}`
}