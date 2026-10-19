import { describe, expect, it } from 'vitest';
import { calculate } from './arithmetic';
import { validateAnswer } from './expressions';
import { calculationKey, generateSolutions, type Calculation } from './solver';
import { dealCards, dealSolvableCards } from './puzzles';
import { assignCardIds, backspaceExpression, canEnterExpression } from './input';

describe('answer validation', () => {
  it('evaluates subtraction and division from left to right', () => {
    expect(validateAnswer('(10 - 3 - 1) * 4', [10, 3, 1, 4]).valid).toBe(true);
    expect(validateAnswer('8 / 2 / 2 * 10', [8, 2, 2, 10]).message).toBe('Your answer equals 20, not 24.');
  });
  it('rejects expressions beyond the input length bound', () => {
    expect(validateAnswer('('.repeat(100) + '1' + ')'.repeat(100), [1, 2, 3, 4]).message).toContain('200');
  });
  it.each([
    ['(1 + 2 + 3) * 4', [1, 2, 3, 4]],
    ['2 + 3 * 8 - 2', [2, 3, 8, 2]],
    ['(8 / 2) * (9 - 3)', [8, 2, 9, 3]],
    ['(5 - 1) * (8 - 2)', [1, 5, 2, 8]],
    ['((2 + 6) * 4) - 8', [2, 4, 6, 8]],
    ['(6 * 8) / (4 - 2)', [2, 4, 6, 8]],
    ['(2 - 2 + 4) * 6', [2, 2, 4, 6]],
    ['(5 + 5) + (7 + 7)', [5, 5, 7, 7]],
    ['10 + 10 + 3 + 1', [10, 10, 3, 1]],
  ])('accepts %s', (expression, numbers) => {
    expect(validateAnswer(expression, numbers).valid).toBe(true);
  });
  it.each([
    ['', [1, 2, 3, 4]],
    ['24', [1, 2, 3, 4]],
    ['1 + 2 + 3 + 4', [1, 2, 3, 4]],
    ['6 * 4', [6, 4, 1, 1]],
    ['6 * 4 + 1 - 1', [6, 4, 2, 2]],
    ['6 * 4 + 1 - 1', [6, 4, 1, 2]],
    ['(1 + 2 + 3) * 4 + 1 - 1', [1, 2, 3, 4]],
    ['8 / (3 - 8 / 3)', [8, 3, 8, 3]],
    ['(3 / 2) * (8 * 2)', [3, 2, 8, 2]],
    ['6 / (2 - 2) * 4', [6, 2, 2, 4]],
    ['(1 + 2 + 3 * 4', [1, 2, 3, 4]],
    ['(1 + 2 + 3)4', [1, 2, 3, 4]],
    ['1 + 2 + 3 + 4)', [1, 2, 3, 4]],
    ['2 ** 3 + 8 + 8', [2, 3, 8, 8]],
    ['alert(1)', [1, 2, 3, 4]],
    ['1.5 * 2 * 8', [1, 5, 2, 8]],
  ])('rejects %s', (expression, numbers) => {
    expect(validateAnswer(expression, numbers).valid).toBe(false);
  });
  it('reports fractional intermediate results even when final result would be 24', () => {
    expect(validateAnswer('(3 / 2) * (8 * 2)', [3, 2, 8, 2]).message).toContain('integer');
  });
  it.each([
    ['8 - ((2 - 6) * 4)', [2, 4, 6, 8]],
    ['(1 - 5) * (2 - 8)', [1, 5, 2, 8]],
    ['(2 - 4) + 6 * 8', [2, 4, 6, 8]],
    ['2 - 4 - 6 - 8', [2, 4, 6, 8]],
  ])('rejects negative results immediately in %s', (expression, cards) => {
    const result = validateAnswer(expression, cards);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('non-negative');
  });
  it('still rejects fractions and incorrect card usage under the non-negative rule', () => {
    expect(validateAnswer('(6 / 4) * (8 * 2)', [2, 4, 6, 8]).message).toContain('integer');
    expect(validateAnswer('(6 * 8) / 2', [2, 4, 6, 8]).message).toContain('all four');
    expect(validateAnswer('(6 * 8) / (2 + 2 - 2)', [2, 4, 6, 8]).valid).toBe(false);
  });
});

describe('exact arithmetic', () => {
  it('uses exact integers beyond floating-point precision', () => {
    expect(calculate(9007199254740993n, 1n, '+')).toBe(9007199254740994n);
  });
  it('supports exact positive division and zero results', () => {
    expect(calculate(12n, 3n, '/')).toBe(4n);
    expect(calculate(3n, 3n, '-')).toBe(0n);
    expect(calculate(0n, 3n, '/')).toBe(0n);
  });
  it('rejects negative operation results', () => {
    expect(() => calculate(2n, 6n, '-')).toThrow('non-negative');
    expect(() => calculate(-12n, 3n, '/')).toThrow('non-negative');
  });
  it('rejects zero divisors and non-integer division', () => {
    expect(() => calculate(1n, 0n, '/')).toThrow('zero');
    expect(() => calculate(-3n, 2n, '/')).toThrow('integer');
  });
});

describe('solution generation', () => {
  it('generates only valid non-negative integer solutions for [2,4,6,8]', () => {
    const cards = [2, 4, 6, 8];
    const solutions = generateSolutions(cards);
    expect(solutions.length).toBeGreaterThan(0);
    for (const solution of solutions) expect(validateAnswer(solution, cards).valid).toBe(true);
    expect(solutions).not.toContain('8 - ((2 - 6) * 4)');
    // Preserve both the addition/multiplication/subtraction and division approaches.
    expect(solutions.some(solution => solution.includes('+') && solution.includes('*') && solution.includes('-'))).toBe(true);
    expect(solutions.some(solution => solution.includes('/') && solution.includes('-'))).toBe(true);
  });
  const add = (left: Calculation, right: Calculation): Calculation => ({ operator: '+', left, right });
  const multiply = (left: Calculation, right: Calculation): Calculation => ({ operator: '*', left, right });
  const divide = (left: Calculation, right: Calculation): Calculation => ({ operator: '/', left, right });

  it('groups all three requested multiplication/division structures for [2,2,4,8]', () => {
    const examples = [
      ['((2 + 4) * 8) / 2', divide(multiply(add(2, 4), 8), 2)],
      ['((2 + 4) / 2) * 8', multiply(divide(add(2, 4), 2), 8)],
      ['(2 + 4) * (8 / 2)', multiply(add(2, 4), divide(8, 2))],
    ] as const;
    for (const [expression] of examples) expect(validateAnswer(expression, [2, 2, 4, 8]).valid).toBe(true);
    expect(new Set(examples.map(([, tree]) => calculationKey(tree))).size).toBe(1);

    // Include the mirrored sum and factor orderings as well as the examples.
    const equivalent = new Set<string>();
    for (const sum of ['(2 + 4)', '(4 + 2)']) {
      for (const expression of [
        `(${sum} * 8) / 2`, `(8 * ${sum}) / 2`,
        `(${sum} / 2) * 8`, `8 * (${sum} / 2)`,
        `${sum} * (8 / 2)`, `(8 / 2) * ${sum}`,
      ]) equivalent.add(expression);
    }
    const solutions = generateSolutions([2, 2, 4, 8]);
    expect(solutions.filter(solution => equivalent.has(solution))).toHaveLength(1);
    for (const solution of solutions) expect(validateAnswer(solution, [2, 2, 4, 8]).valid).toBe(true);
  });

  it('normalizes associative sums, products, operand ordering, and nested quotients', () => {
    expect(calculationKey(add(add(2, 2), 4))).toBe(calculationKey(add(4, add(2, 2))));
    expect(calculationKey(multiply(multiply(2, 4), 8))).toBe(calculationKey(multiply(8, multiply(4, 2))));
    expect(calculationKey(divide(8, divide(4, 2)))).toBe(calculationKey(divide(multiply(8, 2), 4)));
    expect(calculationKey(divide(8, multiply(4, 2)))).toBe(calculationKey(divide(divide(8, 4), 2)));
    expect(calculationKey(divide(8, multiply(4, 2)))).not.toBe(calculationKey(multiply(divide(8, 4), 2)));
  });

  it('retains genuinely different approaches for [2,2,4,8] without value-based merging', () => {
    // Both reach 24, but use different sums and factor structures.
    const first = multiply(add(2, 4), divide(8, 2));
    const distinct = multiply(2, { operator: '-', left: multiply(2, 8), right: 4 });
    expect(calculationKey(first)).not.toBe(calculationKey(distinct));
    expect(validateAnswer('2 * (2 * 8 - 4)', [2, 2, 4, 8]).valid).toBe(true);
    const solutions = generateSolutions([2, 2, 4, 8]);
    // 2 * (2 * 8 - 4) is a separate, valid approach.
    expect(solutions.some(solution => /2 \* \(\(2 \* 8\) - 4\)|\(\(2 \* 8\) - 4\) \* 2/.test(solution))).toBe(true);
  });

  it('keeps integer-only representatives when equivalent regroupings would introduce fractions', () => {
    expect(validateAnswer('(2 / 4) * (2 + 8)', [2, 2, 4, 8]).valid).toBe(false);
    // Both structural forms equal 24, but only the second has integer steps.
    expect(calculationKey(multiply(divide(4, 8), multiply(6, 8))))
      .toBe(calculationKey(divide(multiply(multiply(4, 6), 8), 8)));
    expect(validateAnswer('(4 / 8) * (6 * 8)', [4, 8, 6, 8]).valid).toBe(false);
    expect(validateAnswer('((4 * 6) * 8) / 8', [4, 8, 6, 8]).valid).toBe(true);
    const solutions = generateSolutions([4, 8, 6, 8]);
    expect(solutions.length).toBeGreaterThan(0);
    for (const solution of solutions) expect(validateAnswer(solution, [4, 8, 6, 8]).valid).toBe(true);
  });
  it('merges reversed differences multiplied together, including mirrored factors', () => {
    const equivalent = new Set([
      '(10 - 4) * (9 - 5)', '(9 - 5) * (10 - 4)',
      '(4 - 10) * (5 - 9)', '(5 - 9) * (4 - 10)',
    ]);
    const solutions = generateSolutions([10, 4, 9, 5]);
    expect(solutions.filter(solution => equivalent.has(solution))).toHaveLength(1);
    for (const solution of solutions) expect(validateAnswer(solution, [10, 4, 9, 5]).valid).toBe(true);
  });
  it('merges commutative ordering and associative grouping but keeps different approaches', () => {
    const solutions = generateSolutions([1, 2, 3, 4]);
    // All pure multiplication permutations/groupings form one approach.
    expect(solutions.filter(solution => !/[+\-/]/.test(solution))).toHaveLength(1);
    expect(solutions.some(solution => solution.includes('+'))).toBe(true);
    expect(solutions.some(solution => solution.includes('/'))).toBe(true);
  });
  it.each([[1, 2, 3, 4], [5, 5, 7, 7], [8, 2, 9, 3], [1, 5, 2, 8]])('generates valid unique solutions for %j', (...numbers) => {
    const solutions = generateSolutions(numbers);
    expect(solutions.length).toBeGreaterThan(0);
    expect(new Set(solutions).size).toBe(solutions.length);
    for (const solution of solutions) expect(validateAnswer(solution, numbers).valid).toBe(true);
  });
  it('finds exact-division solutions', () => {
    expect(generateSolutions([8, 2, 9, 3]).some(solution => solution.includes('/'))).toBe(true);
  });
  it('returns no solutions for impossible or fraction-only deals', () => {
    expect(generateSolutions([1, 1, 1, 1])).toEqual([]);
    expect(generateSolutions([3, 3, 8, 8])).toEqual([]);
  });
  it('rejects unsupported solver input', () => {
    expect(generateSolutions([1, 2, 3])).toEqual([]);
    expect(generateSolutions([1, 2, 3, 11])).toEqual([]);
  });
});

describe('card dealing', () => {
  it('verifies every generated puzzle is solvable and preserves physical card rules', () => {
    let seed = 12345;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    for (let trial = 0; trial < 40; trial++) {
      const cards = dealSolvableCards(random);
      const numbers = cards.map(card => card.value);
      const solutions = generateSolutions(numbers);
      expect(solutions.length).toBeGreaterThan(0);
      expect(validateAnswer(solutions[0], numbers).valid).toBe(true);
      expect(new Set(cards.map(card => `${card.value}${card.suit}`)).size).toBe(4);
      expect(numbers.every(n => n >= 1 && n <= 10)).toBe(true);
    }
  });
  it('retries an unsolvable deal and terminates when attempts are exhausted', () => {
    // Four aces (unsolvable), followed by 1,2,3,4 (solvable).
    const draws = [0.001, 9.1 / 39, 18.1 / 38, 27.1 / 37, 0, 0, 0, 0];
    let calls = 0;
    expect(dealSolvableCards(() => draws[calls++], 2).map(card => card.value)).toEqual([1, 2, 3, 4]);
    expect(calls).toBe(8);
    calls = 0;
    expect(() => dealSolvableCards(() => draws[calls++ % 4], 3)).toThrow('Please try');
    expect(calls).toBe(12);
    expect(() => dealSolvableCards(Math.random, Infinity)).toThrow('attempts');
  });
  it('deals four distinct physical cards with values 1–10', () => {
    for (let trial = 0; trial < 100; trial++) {
      const cards = dealCards();
      expect(cards).toHaveLength(4);
      expect(new Set(cards.map(card => `${card.value}${card.suit}`)).size).toBe(4);
      expect(cards.every(card => Number.isInteger(card.value) && card.value >= 1 && card.value <= 10)).toBe(true);
    }
  });
  it('permits repeated values with different suits', () => {
    const targets = [0, 9, 18, 27];
    let index = 0;
    const cards = dealCards(() => (targets[index] + 0.1) / (40 - index++));
    expect(cards.map(card => card.value)).toEqual([1, 1, 1, 1]);
    expect(new Set(cards.map(card => card.suit)).size).toBe(4);
  });
});

describe('expression editing', () => {
  it('allows temporary prefixes in the middle while still rejecting invalid submissions', () => {
    expect(canEnterExpression('1+2', [10, 2, 3, 4])).toBe(true);
    expect(canEnterExpression('(1)+2', [10, 2, 3, 4])).toBe(true);
    expect(canEnterExpression('1+2+1', [10, 2, 3, 4])).toBe(false);
    expect(validateAnswer('(1+2+3)*4', [10, 2, 3, 4]).valid).toBe(false);
  });
  it('assigns clicked physical cards and backtracks when a prefix needs the 10', () => {
    const cards = [{ value: 5, suit: '♣' }, { value: 5, suit: '♥' }, { value: 7, suit: '♣' }, { value: 7, suit: '♥' }] as const;
    expect(assignCardIds('5', cards, ['5♥'])).toEqual(['5♥']);
    expect(assignCardIds('5 + 5', cards, ['5♥', '5♣'])).toEqual(['5♥', '5♣']);
    expect(canEnterExpression('1 + 10', [10, 1, 3, 4])).toBe(true);
  });
  it('limits number occurrences and supports typing 10 incrementally', () => {
    expect(canEnterExpression('5 + 5', [5, 5, 7, 7])).toBe(true);
    expect(canEnterExpression('5 + 5 + 5', [5, 5, 7, 7])).toBe(false);
    expect(canEnterExpression('1', [10, 2, 3, 4])).toBe(true);
    expect(canEnterExpression('10', [10, 2, 3, 4])).toBe(true);
    expect(canEnterExpression('11', [10, 2, 3, 4])).toBe(false);
  });
  it('removes the last entire item, including multi-digit numbers', () => {
    expect(backspaceExpression('( 10 + 2 ) ')).toBe('( 10 + 2');
    expect(backspaceExpression('( 10')).toBe('(');
    expect(backspaceExpression('10')).toBe('');
    expect(backspaceExpression('')).toBe('');
  });
});
