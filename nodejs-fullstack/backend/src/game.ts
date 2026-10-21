
const TARGET = 24;

/**
 * Determines whether the numbers can make 24.
 * Every intermediate result must be a non-negative integer.
 */
export function canMake24(numbers: number[]): boolean {
    if (
        numbers.length !== 4 ||
        numbers.some(
            (n) => !Number.isInteger(n) || n < 1 || n > 10
        )
    ) {
        return false;
    }

    function solve(values: number[]): boolean {
        if (values.length === 1) {
            return values[0] === TARGET;
        }

        // Try combining every possible pair of numbers.
        for (let i = 0; i < values.length; i++) {
            for (let j = i + 1; j < values.length; j++) {
                const a = values[i];
                const b = values[j];

                const remaining = values.filter(
                    (_, index) => index !== i && index !== j
                );

                const results = [
                    a + b,
                    a * b
                ];

                // Subtraction is allowed only when the result
                // is non-negative.
                if (a >= b) {
                    results.push(a - b);
                }

                if (b >= a) {
                    results.push(b - a);
                }

                // Division is allowed only when it produces
                // an integer and the divisor is not zero.
                if (b !== 0 && a % b === 0) {
                    results.push(a / b);
                }

                if (a !== 0 && b % a === 0) {
                    results.push(b / a);
                }

                for (const result of results) {
                    if (solve([...remaining, result])) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    return solve(numbers);
}

/**
 * Generates four random numbers from 1 to 10
 * that can make 24 under the game rules.
 */
export function generatePuzzle(): number[] {
    while (true) {
        const numbers = Array.from(
            { length: 4 },
            () => Math.floor(Math.random() * 10) + 1
        );

        if (canMake24(numbers)) {
            return numbers;
        }
    }
}