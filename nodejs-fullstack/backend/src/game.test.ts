
import { test } from "node:test";
import assert from "node:assert/strict";
import { canMake24, generatePuzzle  } from "./game.js";

test("accepts a solvable puzzle", () => {
    assert.equal(canMake24([1, 2, 3, 4]), true);
});

test("accepts a puzzle that needs multiplication", () => {
    assert.equal(canMake24([2, 3, 4, 6]), true);
});

test("rejects a puzzle that cannot make 24", () => {
    assert.equal(canMake24([1, 1, 1, 1]), false);
});

test("rejects input that does not contain four numbers", () => {
    assert.equal(canMake24([1, 2, 3]), false);
});

test("rejects numbers outside the allowed range", () => {
    assert.equal(canMake24([0, 2, 3, 4]), false);
    assert.equal(canMake24([1, 2, 3, 11]), false);
});

test("rejects non-integer input", () => {
    assert.equal(canMake24([1, 2, 3, 4.5]), false);
});

test("generates a solvable puzzle with four numbers from 1 to 10", () => {
    const numbers = generatePuzzle();

    assert.equal(numbers.length, 4);
    assert.ok(numbers.every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 10
    ));
    assert.equal(canMake24(numbers), true);
});