import { describe, expect, it, vi } from 'vitest';
import * as arithmetic from './arithmetic';
import { calculationKey, generateSolutions, hasSolution, type Calculation } from './solver';

// Independent oracle: partition the input multiset and collect all reachable
// values. Four cards of at most 10 keep every value safely within exact Number
// integer arithmetic. This deliberately does not use calculate or the solver.
const reachableCache = new Map<string, Set<number>>();
function reachableValues(numbers: readonly number[]): Set<number> {
  const key = numbers.join(',');
  const cached = reachableCache.get(key);
  if (cached) return cached;
  const values = new Set<number>();
  if (numbers.length === 1) values.add(numbers[0]);
  for (let mask = 1; mask < (1 << numbers.length) - 1; mask++) {
    if (!(mask & 1)) continue;
    const left = numbers.filter((_, index) => mask & (1 << index));
    const right = numbers.filter((_, index) => !(mask & (1 << index)));
    for (const a of reachableValues(left)) {
      for (const b of reachableValues(right)) {
        values.add(a + b);
        values.add(a * b);
        if (a >= b) values.add(a - b);
        if (b >= a) values.add(b - a);
        if (b !== 0 && a % b === 0) values.add(a / b);
        if (a !== 0 && b % a === 0) values.add(b / a);
      }
    }
  }
  reachableCache.set(key, values);
  return values;
}

// An independent shunting-yard evaluator checks actual generated expressions,
// not only the identities used to group them. It also reconstructs their trees.
function inspectExpression(expression: string) {
  const stack: { value: number; tree: Calculation }[] = [];
  const operators: string[] = [];
  const leaves: number[] = [];
  const precedence = (operator: string) => operator === '+' || operator === '-' ? 1 : 2;
  function apply() {
    const operator = operators.pop();
    const right = stack.pop()!;
    const left = stack.pop()!;
    let value: number;
    switch (operator) {
      case '+': value = left.value + right.value; break;
      case '-': value = left.value - right.value; break;
      case '*': value = left.value * right.value; break;
      case '/':
        if (right.value === 0 || left.value % right.value !== 0) throw new Error('Invalid division');
        value = left.value / right.value;
        break;
      default: throw new Error('Unknown generated operator');
    }
    if (value < 0 || !Number.isInteger(value)) throw new Error('Invalid intermediate result');
    stack.push({ value, tree: { operator, left: left.tree, right: right.tree } });
  }
  for (const token of expression.match(/\d+|[^\s]/g) ?? []) {
    if (/^\d+$/.test(token)) {
      const value = Number(token);
      leaves.push(value);
      stack.push({ value, tree: value });
    } else if (token === '(') {
      operators.push(token);
    } else if (token === ')') {
      while (operators.length && operators.at(-1) !== '(') apply();
      if (operators.pop() !== '(') throw new Error('Unbalanced generated expression');
    } else {
      while (operators.length && operators.at(-1) !== '(' && precedence(operators.at(-1)!) >= precedence(token)) apply();
      operators.push(token);
    }
  }
  while (operators.length) apply();
  if (stack.length !== 1) throw new Error('Malformed generated expression');
  return { ...stack[0], leaves: leaves.sort((a, b) => a - b) };
}

describe('solver regression checks', () => {
  it('agrees with an independent oracle for all 715 value multisets and emits only legal expressions', () => {
    let deals = 0;
    for (let a = 1; a <= 10; a++) {
      for (let b = a; b <= 10; b++) {
        for (let c = b; c <= 10; c++) {
          for (let d = c; d <= 10; d++) {
            const numbers = [a, b, c, d];
            const expected = reachableValues(numbers).has(24);
            const solutions = generateSolutions(numbers);
            expect(solutions.length > 0, numbers.join(',')).toBe(expected);
            expect(hasSolution(numbers), numbers.join(',')).toBe(expected);
            for (const expression of solutions) {
              const inspected = inspectExpression(expression);
              expect(inspected.value).toBe(24);
              expect(inspected.leaves).toEqual(numbers);
            }
            deals++;
          }
        }
      }
    }
    expect(deals).toBe(715);
  }, 60000);

  it.each([[2, 2, 4, 8], [2, 4, 6, 8], [1, 5, 2, 8]])('preserves calculation groups when %j is reordered', (...numbers) => {
    const keys = (values: number[]) => generateSolutions(values)
      .map(expression => calculationKey(inspectExpression(expression).tree)).sort();
    const expected = keys(numbers);
    expect(keys([...numbers].reverse())).toEqual(expected);
    expect(keys([...numbers.slice(1), numbers[0]])).toEqual(expected);
  });

  it('stops an existence search early instead of generating every solution', () => {
    const calculate = vi.spyOn(arithmetic, 'calculate');
    try {
      expect(hasSolution([1, 2, 3, 4])).toBe(true);
      const existenceCalls = calculate.mock.calls.length;
      calculate.mockClear();
      expect(generateSolutions([1, 2, 3, 4]).length).toBeGreaterThan(0);
      expect(existenceCalls).toBeLessThan(calculate.mock.calls.length);
    } finally {
      calculate.mockRestore();
    }
  });

  it('propagates unexpected arithmetic errors instead of declaring a puzzle unsolvable', () => {
    const calculate = vi.spyOn(arithmetic, 'calculate').mockImplementation(() => { throw new Error('Unexpected failure'); });
    try {
      expect(() => generateSolutions([1, 2, 3, 4])).toThrow('Unexpected failure');
      expect(() => hasSolution([1, 2, 3, 4])).toThrow('Unexpected failure');
    } finally {
      calculate.mockRestore();
    }
  });
});
