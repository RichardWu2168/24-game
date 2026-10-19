import { calculate } from './arithmetic';
import type { Operator, ValidationResult } from './types';

export function validateAnswer(expression: string, numbers: readonly number[]): ValidationResult {
  try {
    if (expression.length > 200) throw new Error('Please keep your answer under 200 characters.');
    const tokens = expression.match(/\d+|[^\s]/g) ?? [];
    let position = 0;
    const used: number[] = [];
    function factor(): bigint {
      const token = tokens[position++];
      if (token === '(') {
        const value = sum();
        if (tokens[position++] !== ')') throw new Error('Missing closing parenthesis.');
        return value;
      }
      if (!token || !/^(?:0|[1-9]\d*)$/.test(token)) throw new Error('Use card numbers, +, -, *, /, and parentheses only.');
      const value = BigInt(token);
      if (value < 1n || value > 10n) throw new Error('Use only the numbers on your cards.');
      used.push(Number(value));
      return value;
    }
    function product(): bigint {
      let value = factor();
      while (tokens[position] === '*' || tokens[position] === '/') {
        const operator = tokens[position++] as Operator;
        value = calculate(value, factor(), operator);
      }
      return value;
    }
    function sum(): bigint {
      let value = product();
      while (tokens[position] === '+' || tokens[position] === '-') {
        const operator = tokens[position++] as Operator;
        value = calculate(value, product(), operator);
      }
      return value;
    }
    const value = sum();
    if (position !== tokens.length) throw new Error('Unexpected input. Separate numbers with an operator.');
    const sorted = (values: readonly number[]) => [...values].sort((a, b) => a - b).join(',');
    if (used.length !== 4 || sorted(used) !== sorted(numbers)) throw new Error('Use all four card numbers exactly once.');
    return value === 24n ? { valid: true, message: 'Correct! You made 24 using all four cards.' } : { valid: false, message: `Your answer equals ${value}, not 24.` };
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : 'Invalid answer.' };
  }
}
