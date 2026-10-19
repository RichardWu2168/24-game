export const suits = ['♣', '♦', '♥', '♠'] as const;
export type Suit = typeof suits[number];
export interface Card { value: number; suit: Suit }
export type Operator = '+' | '-' | '*' | '/';
export type ValidationResult = { valid: boolean; message: string };
