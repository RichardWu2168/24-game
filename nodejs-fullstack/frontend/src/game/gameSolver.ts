export interface SolverResult {
  value: number
  expression: string
}

const TARGET = 24
const EPSILON = 1e-9

function isIntegerResult(value: number): boolean {
  return Math.abs(value - Math.round(value)) < EPSILON
}

type ExpressionNode =
  | { type: 'number'; value: string }
  | {
    type: 'operation'
    operator: '+' | '-' | '*' | '/'
    left: ExpressionNode
    right: ExpressionNode
  }

function removeOuterParentheses(expression: string): string {
  let text = expression.trim()

  while (text.startsWith('(') && text.endsWith(')')) {
    let depth = 0
    let enclosesEntireExpression = true

    for (let i = 0; i < text.length - 1; i++) {
      if (text[i] === '(') {
        depth++
      } else if (text[i] === ')') {
        depth--
      }

      if (depth === 0) {
        enclosesEntireExpression = false
        break
      }
    }

    if (!enclosesEntireExpression) {
      break
    }

    text = text.slice(1, -1).trim()
  }

  return text

}

function parseExpression(expression: string): ExpressionNode {
  const text = removeOuterParentheses(expression)

  let depth = 0

  // Find the main operator outside parentheses.
  // Addition and subtraction are checked first because they have
  // lower precedence than multiplication and division.
  for (const operators of [
    ['+', '-'],
    ['*', '/'],
  ]) {
    depth = 0

    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ')') {
        depth++
      } else if (text[i] === '(') {
        depth--
      } else if (depth === 0 && operators.includes(text[i])) {
        return {
          type: 'operation',
          operator: text[i] as '+' | '-' | '*' | '/',
          left: parseExpression(text.slice(0, i)),
          right: parseExpression(text.slice(i + 1)),
        }
      }
    }
  }

  return {
    type: 'number',
    value: text,
  }


}

function getAdditiveTerms(
  node: ExpressionNode,
  sign = 1,
): string[] {
  if (node.type === 'operation' && node.operator === '+') {
    return [
      ...getAdditiveTerms(node.left, sign),
      ...getAdditiveTerms(node.right, sign),
    ]
  }

  if (node.type === 'operation' && node.operator === '-') {
    return [
      ...getAdditiveTerms(node.left, sign),
      ...getAdditiveTerms(node.right, -sign),
    ]
  }

  const term = canonicalizeNode(node)

  return [`${sign === 1 ? '+' : '-'}${term}`]


}


function getMultiplicativeFactors(
  node: ExpressionNode,
  sign = 1
): string[] {
  if (node.type === 'operation' && node.operator === '*') {
    return [
      ...getMultiplicativeFactors(node.left, sign),
      ...getMultiplicativeFactors(node.right, sign),
    ]
  }

  if (node.type === 'operation' && node.operator === '/') {
    return [
      ...getMultiplicativeFactors(node.left, sign),
      ...getMultiplicativeFactors(node.right, -sign),
    ]
  }

  const factor = canonicalizeNode(node)

  // Multiplication or division by 1 does not change the value.
  if (factor === '1') {
    return []
  }

  return [`${sign === 1 ? '*' : '/'}${factor}`]
}


function canonicalizeNode(node: ExpressionNode): string {
  if (node.type === 'number') {
    return node.value
  }

  if (node.operator === '+' || node.operator === '-') {
    const terms = getAdditiveTerms(node)
    terms.sort()

    return `add[${terms.join(',')}]`
  }

  if (node.operator === '*' || node.operator === '/') {
    const factors = getMultiplicativeFactors(node)
    factors.sort()

    // If every factor is 1, the expression simplifies to 1.
    if (factors.length === 0) {
      return '1'
    }

    return `mul[${factors.join(',')}]`
  }

  return ''

}

function canonicalizeExpression(expression: string): string {
  const node = parseExpression(expression)

  return canonicalizeNode(node)

}

/**
 * Finds one expression that makes 24 using all the supplied numbers.
 * Returns null if no solution is found.
 */
export function findSolution(numbers: number[]): string | null {
  if (numbers.length !== 4) {
    throw new Error('The solver requires exactly four numbers.')
  }

  const items: SolverResult[] = numbers.map((number) => ({
    value: number,
    expression: String(number),
  }))

  const result = search(items)

  return result?.expression ?? null
}

/**
 * Recursively combines pairs of numbers until one number remains.
 */
function search(items: SolverResult[]): SolverResult | null {
  // Base case: only one number remains.
  if (items.length === 1) {
    return Math.abs(items[0].value - TARGET) < EPSILON
      ? items[0]
      : null
  }

  // Try every pair of numbers.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]

      // Keep all numbers that were not selected.
      const remaining = items.filter(
        (_, index) => index !== i && index !== j,
      )

      // Try addition.
      const additionResult = a.value + b.value

      if (isIntegerResult(additionResult)) {
        const addition = search([
          ...remaining,
          {
            value: additionResult,
            expression: `(${a.expression} + ${b.expression})`,
          },
        ])

        if (addition !== null) {
          return addition
        }
      }

      // Try subtraction in both orders.
      const subtractionABResult = a.value - b.value

      if (isIntegerResult(subtractionABResult)) {
        const subtractionAB = search([
          ...remaining,
          {
            value: subtractionABResult,
            expression: `(${a.expression} - ${b.expression})`,
          },
        ])

        if (subtractionAB !== null) {
          return subtractionAB
        }
      }

      const subtractionBAResult = b.value - a.value

      if (isIntegerResult(subtractionBAResult)) {
        const subtractionBA = search([
          ...remaining,
          {
            value: subtractionBAResult,
            expression: `(${b.expression} - ${a.expression})`,
          },
        ])

        if (subtractionBA !== null) {
          return subtractionBA
        }
      }

      // Try multiplication.
      const multiplicationResult = a.value * b.value

      if (isIntegerResult(multiplicationResult)) {
        const multiplication = search([
          ...remaining,
          {
            value: multiplicationResult,
            expression: `(${a.expression} * ${b.expression})`,
          },
        ])

        if (multiplication !== null) {
          return multiplication
        }
      }

      // Try division in both orders, avoiding division by zero.
      if (Math.abs(b.value) > EPSILON) {
        const divisionABResult = a.value / b.value

        if (isIntegerResult(divisionABResult)) {
          const divisionAB = search([
            ...remaining,
            {
              value: divisionABResult,
              expression: `(${a.expression} / ${b.expression})`,
            },
          ])

          if (divisionAB !== null) {
            return divisionAB
          }
        }
      }

      if (Math.abs(a.value) > EPSILON) {
        const divisionBAResult = b.value / a.value

        if (isIntegerResult(divisionBAResult)) {
          const divisionBA = search([
            ...remaining,
            {
              value: divisionBAResult,
              expression: `(${b.expression} / ${a.expression})`,
            },
          ])

          if (divisionBA !== null) {
            return divisionBA
          }
        }
      }

    }
  }

  // No combination of operations worked.
  return null
}

/**

* Finds all unique expressions that make 24 using all supplied numbers.
* Returns an array of solution expressions.
  */
export function findAllSolutions(numbers: number[]): string[] {
  if (numbers.length !== 4) {
    throw new Error('The solver requires exactly four numbers.')
  }

  const items: SolverResult[] = numbers.map((number) => ({
    value: number,
    expression: String(number),
  }))

  const solutions = new Map<string, string>()

  searchAll(items, solutions)

  return Array.from(solutions.values())
}

/**

* Recursively explores every combination of number pairs and operations.
  */
function searchAll(
  items: SolverResult[],
  solutions: Map<string, string>,
): void {
  // Base case: only one number remains.
  if (items.length === 1) {
    if (Math.abs(items[0].value - TARGET) < EPSILON) {
      const expression = items[0].expression
      const key = canonicalizeExpression(expression)

      if (!solutions.has(key)) {
        solutions.set(key, expression)
      }
    }

    return
  }

  // Try every pair of numbers.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]

      // Keep all numbers that were not selected.
      const remaining = items.filter(
        (_, index) => index !== i && index !== j,
      )

      // Try addition.
      // Sort operands to avoid duplicate expressions in reverse order.
      const additionResult = a.value + b.value

      if (isIntegerResult(additionResult)) {
        const additionExpressions = [a.expression, b.expression].sort()

        searchAll(
          [
            ...remaining,
            {
              value: additionResult,
              expression: `(${additionExpressions[0]} + ${additionExpressions[1]})`,
            },
          ],
          solutions,
        )
      }

      // Try subtraction only when the result is non-negative.
      const subtractionResult1 = a.value - b.value

      if (
        a.value >= b.value &&
        isIntegerResult(subtractionResult1)
      ) {
        searchAll(
          [
            ...remaining,
            {
              value: subtractionResult1,
              expression: `(${a.expression} - ${b.expression})`,
            },
          ],
          solutions,
        )
      }

      const subtractionResult2 = b.value - a.value

      if (
        b.value >= a.value &&
        isIntegerResult(subtractionResult2)
      ) {
        searchAll(
          [
            ...remaining,
            {
              value: subtractionResult2,
              expression: `(${b.expression} - ${a.expression})`,
            },
          ],
          solutions,
        )
      }

      // Try multiplication.
      // Sort operands to avoid duplicate expressions in reverse order.
      const multiplicationResult = a.value * b.value

      if (isIntegerResult(multiplicationResult)) {
        const multiplicationExpressions = [a.expression, b.expression].sort()

        searchAll(
          [
            ...remaining,
            {
              value: multiplicationResult,
              expression: `(${multiplicationExpressions[0]} * ${multiplicationExpressions[1]})`,
            },
          ],
          solutions,
        )
      }

      // Try division in both orders, avoiding division by zero.
      if (Math.abs(b.value) > EPSILON) {
        const divisionResult1 = a.value / b.value

        if (isIntegerResult(divisionResult1)) {
          searchAll(
            [
              ...remaining,
              {
                value: divisionResult1,
                expression: `(${a.expression} / ${b.expression})`,
              },
            ],
            solutions,
          )
        }
      }

      if (Math.abs(a.value) > EPSILON) {
        const divisionResult2 = b.value / a.value

        if (isIntegerResult(divisionResult2)) {
          searchAll(
            [
              ...remaining,
              {
                value: divisionResult2,
                expression: `(${b.expression} / ${a.expression})`,
              },
            ],
            solutions,
          )
        }
      }
    }

  }
}
