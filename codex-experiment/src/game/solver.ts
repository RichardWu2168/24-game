import { ArithmeticError, calculate } from './arithmetic';
import type { Operator } from './types';

type Sign = 1 | -1;
type Shape =
  | { kind: 'number'; key: string }
  | { kind: 'sum'; key: string; terms: SignedShape[] }
  | { kind: 'product'; key: string; factors: ProductFactor[] };
interface SignedShape { sign: Sign; shape: Shape }
interface ProductFactor { role: 'numerator' | 'denominator'; shape: Shape }
interface Term { value: bigint; expression: string; identity: SignedShape }
export type Calculation = number | { operator: Operator; left: Calculation; right: Calculation };

function numberIdentity(value: number): SignedShape {
  return { sign: 1, shape: { kind: 'number', key: String(value) } };
}

// Structural identity only; actual expression validity is checked by calculate
// during the search. Never evaluate or rewrite an expression using this key.
export function calculationKey(calculation: Calculation): string {
  function identity(node: Calculation): SignedShape {
    return typeof node === 'number' ? numberIdentity(node) : combine(identity(node.left), identity(node.right), node.operator);
  }
  return signedKey(identity(calculation));
}

function signedKey(term: SignedShape): string { return `${term.sign}:${term.shape.key}`; }
function multiplySigns(left: Sign, right: Sign): Sign { return left === right ? 1 : -1; }
function factorKey(factor: ProductFactor): string {
  return `${factor.role === 'numerator' ? 1 : -1}:${factor.shape.key}`;
}

// Preserve the arithmetic approach: normalize order, grouping and signs without
// distributing products, cancelling factors, or replacing subexpressions by values.
function combine(left: SignedShape, right: SignedShape, operator: Operator): SignedShape {
  if (operator === '+' || operator === '-') {
    const parts: SignedShape[] = [];
    function collect(term: SignedShape, sign: Sign) {
      if (term.shape.kind === 'sum') {
        term.shape.terms.forEach(part => collect(part, multiplySigns(sign, term.sign)));
      } else parts.push({ shape: term.shape, sign: multiplySigns(sign, term.sign) });
    }
    collect(left, 1);
    collect(right, operator === '-' ? -1 : 1);
    const ordered = (items: SignedShape[]) => [...items].sort((a, b) => signedKey(a).localeCompare(signedKey(b)));
    const positive = ordered(parts);
    const negative = ordered(parts.map(part => ({ ...part, sign: multiplySigns(-1, part.sign) })));
    const key = (items: SignedShape[]) => JSON.stringify(items.map(signedKey));
    const sign = key(positive) <= key(negative) ? 1 : -1;
    const normalized = sign === 1 ? positive : negative;
    return { sign, shape: { kind: 'sum', key: `sum${key(normalized)}`, terms: normalized } };
  }
  const sign = multiplySigns(left.sign, right.sign);
  // Division reverses numerator/denominator roles, independently of sign.
  const factors: ProductFactor[] = [];
  function collectFactors(term: SignedShape, invert: boolean) {
    if (term.shape.kind === 'product') {
      term.shape.factors.forEach(factor => factors.push({
        shape: factor.shape,
        role: invert ? (factor.role === 'numerator' ? 'denominator' : 'numerator') : factor.role,
      }));
    } else factors.push({ shape: term.shape, role: invert ? 'denominator' : 'numerator' });
  }
  collectFactors(left, false);
  collectFactors(right, operator === '/');
  factors.sort((a, b) => factorKey(a).localeCompare(factorKey(b)));
  return { sign, shape: { kind: 'product', key: `product${JSON.stringify(factors.map(factorKey))}`, factors } };
}

function solve(numbers: readonly number[], firstOnly: boolean): string[] {
  if (numbers.length !== 4 || numbers.some(n => !Number.isInteger(n) || n < 1 || n > 10)) return [];
  const solutions = new Map<string, string>();
  function search(terms: Term[]): boolean {
    if (terms.length === 1) {
      if (terms[0].value === 24n) {
        const key = signedKey(terms[0].identity);
        if (!solutions.has(key)) solutions.set(key, terms[0].expression.slice(1, -1));
        return firstOnly;
      }
      return false;
    }
    for (let i = 0; i < terms.length; i++) {
      for (let j = i + 1; j < terms.length; j++) {
        const rest = terms.filter((_, index) => index !== i && index !== j);
        for (const [left, right] of [[terms[i], terms[j]], [terms[j], terms[i]]]) {
          for (const operator of ['+', '-', '*', '/'] as Operator[]) {
            // Canonical order removes mirrored addition and multiplication.
            if ((operator === '+' || operator === '*') && left.expression > right.expression) continue;
            let value: bigint;
            try {
              value = calculate(left.value, right.value, operator);
            } catch (error) {
              if (error instanceof ArithmeticError) continue;
              throw error;
            }
            const found = search([...rest, {
              value,
              expression: `(${left.expression} ${operator} ${right.expression})`,
              identity: combine(left.identity, right.identity, operator),
            }]);
            if (found) return true;
          }
        }
      }
    }
    return false;
  }
  search(numbers.map(value => ({ value: BigInt(value), expression: String(value), identity: numberIdentity(value) })));
  return [...solutions.values()].sort();
}

export function generateSolutions(numbers: readonly number[]): string[] {
  return solve(numbers, false);
}

export function hasSolution(numbers: readonly number[]): boolean {
  return solve(numbers, true).length > 0;
}
