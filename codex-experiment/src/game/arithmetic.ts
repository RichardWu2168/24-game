import type { Operator } from './types';

export class ArithmeticError extends Error {}

export function calculate(left: bigint, right: bigint, operator: Operator): bigint {
  let result: bigint;
  switch (operator) {
    case '+': result = left + right; break;
    case '-': result = left - right; break;
    case '*': result = left * right; break;
    case '/':
      if (right === 0n) throw new ArithmeticError('Division by zero is not allowed.');
      if (left % right !== 0n) throw new ArithmeticError('Every intermediate result must be an integer.');
      result = left / right;
      break;
  }
  if (result < 0n) throw new ArithmeticError('Every intermediate result must be a non-negative integer.');
  return result;
}
